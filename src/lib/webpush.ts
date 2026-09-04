/**
 * Web Push do zero, com WebCrypto — o que faz a notificação chegar no celular fechado.
 *
 * São duas coisas empilhadas, e vale entender a diferença:
 *
 *   **RFC 8291 (aes128gcm)** — o RECADO É CIFRADO PARA O APARELHO. O serviço de push do
 *   navegador (Google, Apple, Mozilla) transporta sem poder ler: a chave sai de um ECDH
 *   entre uma chave efêmera nossa e a chave pública do aparelho, mais o `auth` secreto da
 *   assinatura. Por isso o texto do aviso pode dizer o nome do cliente e o valor da nota.
 *
 *   **RFC 8292 (VAPID)** — a IDENTIFICAÇÃO DE QUEM MANDA. Um JWT ES256 assinado com a
 *   chave privada VAPID, para o serviço de push saber que o remetente é sempre o mesmo
 *   servidor. A chave privada vive num secret da Edge Function e nunca no bundle.
 *
 * Módulo puro e sem dependência: `crypto.subtle` existe igual no Deno (Edge Function) e no
 * Node (vitest), então a mesma implementação roda em produção e no teste. Biblioteca de npm
 * aqui significaria depender de compatibilidade node no runtime do Deno — foi decisão
 * consciente escrever os 100 passos do RFC em vez de importar a caixa-preta.
 *
 * O que NÃO está aqui de propósito: retentativa e limpeza de assinatura morta. Quem sabe
 * disso é quem lê o 404/410 do serviço de push — a Edge Function `avisos`.
 */

/** Assinatura de um aparelho, como o navegador entrega em `pushManager.subscribe()`. */
export interface AssinaturaPush {
  endpoint: string
  /** Chave pública do aparelho (P-256, 65 bytes, base64url). */
  p256dh: string
  /** Segredo de autenticação da assinatura (16 bytes, base64url). */
  auth: string
}

export interface ChavesVapid {
  /** Chave pública (65 bytes, base64url) — também vai no cliente, em `applicationServerKey`. */
  publica: string
  /** Chave privada (32 bytes, base64url). Secret do servidor. NUNCA no bundle. */
  privada: string
  /** `sub` do JWT: mailto: ou https:// de contato, exigido pelo RFC 8292. */
  assunto: string
}

export interface EnvioPush {
  url: string
  headers: Record<string, string>
  body: Uint8Array
}

const texto = new TextEncoder()

export function bytesParaBase64url(bytes: Uint8Array): string {
  let binario = ''
  for (const byte of bytes) binario += String.fromCharCode(byte)
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function base64urlParaBytes(valor: string): Uint8Array {
  const base64 = valor.replace(/-/g, '+').replace(/_/g, '/')
  // base64url vem sem `=`; atob exige o tamanho múltiplo de 4
  const completo = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binario = atob(completo)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}

function juntar(...partes: (Uint8Array | number[])[]): Uint8Array {
  const total = partes.reduce((soma, parte) => soma + parte.length, 0)
  const saida = new Uint8Array(total)
  let posicao = 0
  for (const parte of partes) {
    saida.set(parte instanceof Uint8Array ? parte : new Uint8Array(parte), posicao)
    posicao += parte.length
  }
  return saida
}

/** HMAC-SHA256 — é ele que faz o papel de HKDF-Extract e HKDF-Expand aqui. */
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

/**
 * HKDF do RFC 8291 com saída de um bloco só (32 bytes bastam para CEK e nonce).
 * `info || 0x01` é o HKDF-Expand com contador 1 — não há segundo bloco a pedir.
 */
async function derivar(prk: Uint8Array, info: Uint8Array, tamanho: number): Promise<Uint8Array> {
  const bloco = await hmac(prk, juntar(info, [1]))
  return bloco.slice(0, tamanho)
}

function inteiro32(valor: number): Uint8Array {
  const saida = new Uint8Array(4)
  new DataView(saida.buffer).setUint32(0, valor, false) // big-endian, como o RFC pede
  return saida
}

/** P-256 cru (65 bytes, 0x04 || X || Y) para JWK — é o formato que o WebCrypto importa. */
function jwkDaChave(publica: Uint8Array, privada?: Uint8Array): JsonWebKey {
  if (publica.length !== 65 || publica[0] !== 4) {
    throw new Error('Chave pública P-256 precisa ter 65 bytes começando em 0x04.')
  }
  return {
    kty: 'EC',
    crv: 'P-256',
    x: bytesParaBase64url(publica.slice(1, 33)),
    y: bytesParaBase64url(publica.slice(33, 65)),
    ...(privada ? { d: bytesParaBase64url(privada) } : {}),
    ext: true,
  }
}

/**
 * JWT do VAPID: quem está mandando o push.
 *
 * `aud` é a ORIGEM do endpoint (não o endpoint inteiro): mandar o caminho junto faz o
 * serviço de push recusar com 401. `exp` de 12 horas — o RFC 8292 permite até 24 e o
 * relógio do servidor pode estar adiantado.
 */
export async function tokenVapid(
  endpoint: string,
  chaves: ChavesVapid,
  agoraMs = Date.now(),
): Promise<string> {
  const cabecalho = { typ: 'JWT', alg: 'ES256' }
  const corpo = {
    aud: new URL(endpoint).origin,
    exp: Math.floor(agoraMs / 1000) + 12 * 60 * 60,
    sub: chaves.assunto,
  }
  const parte = (valor: unknown) => bytesParaBase64url(texto.encode(JSON.stringify(valor)))
  const entrada = `${parte(cabecalho)}.${parte(corpo)}`

  const chave = await crypto.subtle.importKey(
    'jwk',
    jwkDaChave(base64urlParaBytes(chaves.publica), base64urlParaBytes(chaves.privada)),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  // ECDSA no WebCrypto já sai como r||s de 64 bytes, que é exatamente o que o JWS quer
  const assinatura = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      chave,
      texto.encode(entrada) as unknown as ArrayBuffer,
    ),
  )
  return `${entrada}.${bytesParaBase64url(assinatura)}`
}

/** Corpo cifrado no formato aes128gcm: salt | rs | idlen | chave efêmera | cifra. */
export async function corpoCifrado(
  assinatura: AssinaturaPush,
  mensagem: string,
  // injetáveis só para o teste poder ser determinístico; em produção nascem aleatórios
  semente?: { salt?: Uint8Array; efemera?: CryptoKeyPair },
): Promise<Uint8Array> {
  const uaPublica = base64urlParaBytes(assinatura.p256dh)
  const authSecreto = base64urlParaBytes(assinatura.auth)

  const efemera =
    semente?.efemera ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair)

  const asPublica = new Uint8Array(await crypto.subtle.exportKey('raw', efemera.publicKey))
  const uaChave = await crypto.subtle.importKey(
    'jwk',
    jwkDaChave(uaPublica),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const segredoEcdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaChave }, efemera.privateKey, 256),
  )

  // RFC 8291 §3.4: o auth da assinatura entra como salt do primeiro extract, e o info
  // amarra as DUAS chaves públicas — é o que impede reusar o pacote noutro aparelho.
  const prkAuth = await hmac(authSecreto, segredoEcdh)
  const infoChave = juntar(texto.encode('WebPush: info'), [0], uaPublica, asPublica)
  const ikm = await derivar(prkAuth, infoChave, 32)

  const salt = semente?.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const prk = await hmac(salt, ikm)
  const cek = await derivar(prk, juntar(texto.encode('Content-Encoding: aes128gcm'), [0]), 16)
  const nonce = await derivar(prk, juntar(texto.encode('Content-Encoding: nonce'), [0]), 12)

  const chaveAes = await crypto.subtle.importKey(
    'raw',
    cek as unknown as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  )
  // 0x02 é o delimitador de fim de conteúdo do aes128gcm (RFC 8188). Sem ele o
  // navegador descarta a mensagem sem dizer por quê.
  const claro = juntar(texto.encode(mensagem), [2])
  const cifra = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as unknown as ArrayBuffer, tagLength: 128 },
      chaveAes,
      claro as unknown as ArrayBuffer,
    ),
  )

  return juntar(salt, inteiro32(4096), [asPublica.length], asPublica, cifra)
}

/** Tamanho máximo do recado. Acima disso o serviço de push devolve 413. */
export const LIMITE_MENSAGEM_BYTES = 3800

/**
 * Monta a requisição de push pronta para o `fetch`. Não manda: quem manda trata o 404/410
 * (aparelho que sumiu) e é a Edge Function `avisos` que sabe o que fazer com isso.
 */
export async function montarEnvio(
  assinatura: AssinaturaPush,
  chaves: ChavesVapid,
  mensagem: string,
  semente?: { salt?: Uint8Array; efemera?: CryptoKeyPair; agoraMs?: number },
): Promise<EnvioPush> {
  if (texto.encode(mensagem).length > LIMITE_MENSAGEM_BYTES) {
    throw new Error('Mensagem de push maior que o limite do serviço de push.')
  }
  const body = await corpoCifrado(assinatura, mensagem, semente)
  const jwt = await tokenVapid(assinatura.endpoint, chaves, semente?.agoraMs)
  return {
    url: assinatura.endpoint,
    headers: {
      Authorization: `vapid t=${jwt}, k=${chaves.publica}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      // 1 dia: aviso de entrega perde o sentido depois disso
      TTL: '86400',
      Urgency: 'high',
    },
    body,
  }
}
