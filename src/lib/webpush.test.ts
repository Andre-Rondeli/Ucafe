import { describe, expect, it } from 'vitest'
import {
  base64urlParaBytes,
  bytesParaBase64url,
  montarEnvio,
  tokenVapid,
  type AssinaturaPush,
  type ChavesVapid,
} from './webpush'

/**
 * O teste faz o caminho INTEIRO: cifra com a implementação e DECIFRA com a chave privada
 * do "aparelho", derivando as chaves outra vez a partir do texto do RFC 8291. Se a ordem
 * dos campos, o nonce, o delimitador 0x02 ou o enquadramento do corpo estiverem errados,
 * o AES-GCM falha aqui — que é exatamente o que o celular faria em silêncio.
 */

const texto = new TextEncoder()
const decodificador = new TextDecoder()

function juntar(...partes: (Uint8Array | number[])[]): Uint8Array {
  const total = partes.reduce((soma, p) => soma + p.length, 0)
  const saida = new Uint8Array(total)
  let posicao = 0
  for (const parte of partes) {
    saida.set(parte instanceof Uint8Array ? parte : new Uint8Array(parte), posicao)
    posicao += parte.length
  }
  return saida
}

async function hmac(chave: Uint8Array, dados: Uint8Array): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    'raw',
    chave as unknown as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', material, dados as unknown as ArrayBuffer))
}

/** Par de chaves do "aparelho" que assinou o push. */
async function aparelho() {
  const par = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair
  const publica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey))
  const auth = crypto.getRandomValues(new Uint8Array(16))
  const assinatura: AssinaturaPush = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123?token=xyz',
    p256dh: bytesParaBase64url(publica),
    auth: bytesParaBase64url(auth),
  }
  return { par, publica, auth, assinatura }
}

async function chavesVapid(): Promise<{ chaves: ChavesVapid; publicaCrypto: CryptoKey }> {
  const par = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const publica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey))
  const jwk = await crypto.subtle.exportKey('jwk', par.privateKey)
  return {
    chaves: {
      publica: bytesParaBase64url(publica),
      privada: jwk.d as string,
      assunto: 'mailto:torrao@rondelli.com.br',
    },
    publicaCrypto: par.publicKey,
  }
}

/** Decifra como o navegador faria, derivando as chaves outra vez a partir do RFC 8291. */
async function decifrarComoOAparelho(
  corpo: Uint8Array,
  privadaDoAparelho: CryptoKey,
  publicaDoAparelho: Uint8Array,
  authSecreto: Uint8Array,
): Promise<string> {
  const salt = corpo.slice(0, 16)
  const tamanhoId = corpo[20]
  const asPublica = corpo.slice(21, 21 + tamanhoId)
  const cifra = corpo.slice(21 + tamanhoId)

  const asChave = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: bytesParaBase64url(asPublica.slice(1, 33)),
      y: bytesParaBase64url(asPublica.slice(33, 65)),
      ext: true,
    },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const segredo = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: asChave }, privadaDoAparelho, 256),
  )

  const prkAuth = await hmac(authSecreto, segredo)
  const infoChave = juntar(texto.encode('WebPush: info'), [0], publicaDoAparelho, asPublica)
  const ikm = (await hmac(prkAuth, juntar(infoChave, [1]))).slice(0, 32)
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, juntar(texto.encode('Content-Encoding: aes128gcm'), [0], [1]))).slice(0, 16)
  const nonce = (await hmac(prk, juntar(texto.encode('Content-Encoding: nonce'), [0], [1]))).slice(0, 12)

  const chaveAes = await crypto.subtle.importKey(
    'raw',
    cek as unknown as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  )
  const claro = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce as unknown as ArrayBuffer, tagLength: 128 },
      chaveAes,
      cifra as unknown as ArrayBuffer,
    ),
  )
  // último byte é o delimitador 0x02
  expect(claro[claro.length - 1]).toBe(2)
  return decodificador.decode(claro.slice(0, -1))
}

describe('base64url', () => {
  it('vai e volta sem perder byte, e não usa + / =', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(65))
    const texto64 = bytesParaBase64url(bytes)
    expect(texto64).not.toMatch(/[+/=]/)
    expect([...base64urlParaBytes(texto64)]).toEqual([...bytes])
  })

  it('aceita base64url sem padding, que é como o navegador entrega', () => {
    expect(decodificador.decode(base64urlParaBytes('YWJj'))).toBe('abc')
    expect(decodificador.decode(base64urlParaBytes('YWJjZA'))).toBe('abcd')
  })
})

describe('corpo cifrado (RFC 8291)', () => {
  it('o aparelho decifra a mensagem que mandamos', async () => {
    const { par, publica, auth, assinatura } = await aparelho()
    const { chaves } = await chavesVapid()
    const mensagem = JSON.stringify({
      titulo: 'NF 1234 emitida — Bar do Zé',
      corpo: '25 kg · R$ 1.100,00. Entrega prevista terça, 25/08/2026.',
    })

    const envio = await montarEnvio(assinatura, chaves, mensagem)
    const lido = await decifrarComoOAparelho(envio.body, par.privateKey, publica, auth)
    expect(lido).toBe(mensagem)
  })

  it('enquadra o corpo como o padrão manda: salt, rs, tamanho e chave efêmera', async () => {
    const { assinatura } = await aparelho()
    const { chaves } = await chavesVapid()
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const envio = await montarEnvio(assinatura, chaves, 'oi', { salt })

    expect([...envio.body.slice(0, 16)]).toEqual([...salt])
    // record size 4096, big-endian
    expect([...envio.body.slice(16, 20)]).toEqual([0, 0, 0x10, 0])
    expect(envio.body[20]).toBe(65)
    expect(envio.body[21]).toBe(4) // ponto P-256 não comprimido
    // 'oi' + delimitador + tag de 16 bytes do GCM
    expect(envio.body.length).toBe(16 + 4 + 1 + 65 + 3 + 16)
  })

  it('dois envios da mesma mensagem saem diferentes — salt e chave efêmera são novos', async () => {
    const { assinatura } = await aparelho()
    const { chaves } = await chavesVapid()
    const um = await montarEnvio(assinatura, chaves, 'igual')
    const outro = await montarEnvio(assinatura, chaves, 'igual')
    expect(bytesParaBase64url(um.body)).not.toBe(bytesParaBase64url(outro.body))
  })

  it('recusa mensagem grande em vez de tomar 413 do serviço de push', async () => {
    const { assinatura } = await aparelho()
    const { chaves } = await chavesVapid()
    await expect(montarEnvio(assinatura, chaves, 'x'.repeat(5000))).rejects.toThrow(/limite/i)
  })
})

describe('VAPID (RFC 8292)', () => {
  it('assina um JWT que a própria chave pública valida', async () => {
    const { assinatura } = await aparelho()
    const { chaves, publicaCrypto } = await chavesVapid()
    const jwt = await tokenVapid(assinatura.endpoint, chaves)

    const [cabecalho, corpo, assinado] = jwt.split('.')
    expect(JSON.parse(decodificador.decode(base64urlParaBytes(cabecalho)))).toEqual({
      typ: 'JWT',
      alg: 'ES256',
    })
    const valido = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicaCrypto,
      base64urlParaBytes(assinado) as unknown as ArrayBuffer,
      texto.encode(`${cabecalho}.${corpo}`) as unknown as ArrayBuffer,
    )
    expect(valido, 'o serviço de push valida esta assinatura').toBe(true)
  })

  it('o `aud` é a ORIGEM do endpoint, não o endpoint inteiro — com caminho dá 401', async () => {
    const { assinatura } = await aparelho()
    const { chaves } = await chavesVapid()
    const jwt = await tokenVapid(assinatura.endpoint, chaves, Date.UTC(2026, 7, 24, 12, 0, 0))
    const corpo = JSON.parse(decodificador.decode(base64urlParaBytes(jwt.split('.')[1])))
    expect(corpo.aud).toBe('https://fcm.googleapis.com')
    expect(corpo.sub).toBe('mailto:torrao@rondelli.com.br')
    // 12 horas de validade
    expect(corpo.exp).toBe(Math.floor(Date.UTC(2026, 7, 24, 12, 0, 0) / 1000) + 12 * 3600)
  })

  it('o header Authorization leva o token e a chave pública', async () => {
    const { assinatura } = await aparelho()
    const { chaves } = await chavesVapid()
    const envio = await montarEnvio(assinatura, chaves, 'oi')
    expect(envio.url).toBe(assinatura.endpoint)
    expect(envio.headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/)
    expect(envio.headers['Content-Encoding']).toBe('aes128gcm')
    expect(envio.headers.TTL).toBe('86400')
  })
})
