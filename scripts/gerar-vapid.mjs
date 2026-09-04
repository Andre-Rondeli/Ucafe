/**
 * Gera o par de chaves VAPID do Web Push. Rode uma vez:
 *
 *   node scripts/gerar-vapid.mjs
 *
 * A chave PÚBLICA vai no JWT de todo push (o app a busca da Edge Function `avisos`).
 * A chave PRIVADA é secret do servidor — ela sai só na SUA tela, e o jeito de guardar é:
 *
 *   npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:...
 *
 * Nunca commite a privada, nunca cole em chat. Trocar o par desinscreve todos os
 * aparelhos (a assinatura do navegador é amarrada à chave pública): só troque se a
 * privada vazar.
 */
import { webcrypto } from 'node:crypto'

const par = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
])

const publica = Buffer.from(await webcrypto.subtle.exportKey('raw', par.publicKey))
const jwk = await webcrypto.subtle.exportKey('jwk', par.privateKey)

console.log('VAPID_PUBLIC_KEY=' + publica.toString('base64url'))
console.log('VAPID_PRIVATE_KEY=' + jwk.d)
console.log('VAPID_SUBJECT=mailto:morandi7@hotmail.com')
console.log()
console.log('Guarde com:')
console.log('  npx supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=...')
