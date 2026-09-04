// Gera os ícones do PWA (PNG) sem dependência nenhuma: "U" da Ucafé — marinho sobre
// fundo branco, com o arco âmbar da logo por baixo — desenhado por matemática e
// codificado à mão (zlib é do Node). Rodar uma vez e commitar os PNGs:
// `node scripts/gerar-icones.mjs`.
//
// Cores tiradas por inspeção visual da logomarca enviada (wordmark "U" + arco);
// se a Ucafé tiver um manual de marca com hex oficial, troque aqui.
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const MARINHO = [31, 58, 107] // o "U" da logo
const AMBAR = [212, 146, 46] // o arco sob o "U" na logo
const BRANCO = [255, 255, 255]

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(tipo, dados) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(dados.length)
  const corpo = Buffer.concat([Buffer.from(tipo), dados])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(corpo))
  return Buffer.concat([len, corpo, crc])
}

function png(tamanho) {
  // o "U": dois traços retos que descem e se fecham numa curva por baixo (anel), tudo
  // dentro da zona segura de ícone maskable (raio de 40% a partir do centro).
  const dentroDoU = (px, py) => {
    const haste = py >= 0.22 && py <= 0.5 && ((px >= 0.37 && px <= 0.45) || (px >= 0.55 && px <= 0.63))
    const dx = px - 0.5
    const dy = py - 0.5
    const r = Math.sqrt(dx * dx + dy * dy)
    const curva = py >= 0.5 && r >= 0.05 && r <= 0.13
    return haste || curva
  }

  // o arco âmbar sob o "U": metade de baixo de uma elipse achatada.
  const dentroDoArco = (px, py) => {
    const ex = (px - 0.5) / 0.2
    const ey = (py - 0.72) / 0.07
    return py >= 0.72 && ex * ex + ey * ey <= 1
  }

  const linhas = []
  for (let y = 0; y < tamanho; y++) {
    const linha = Buffer.alloc(1 + tamanho * 3) // byte de filtro 0 + RGB
    for (let x = 0; x < tamanho; x++) {
      const px = x / tamanho
      const py = y / tamanho
      let cor = BRANCO
      if (dentroDoU(px, py)) cor = MARINHO
      else if (dentroDoArco(px, py)) cor = AMBAR
      const [r, g, b] = cor
      linha[1 + x * 3] = r
      linha[1 + x * 3 + 1] = g
      linha[1 + x * 3 + 2] = b
    }
    linhas.push(linha)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(tamanho, 0)
  ihdr.writeUInt32BE(tamanho, 4)
  ihdr[8] = 8 // 8 bits por canal
  ihdr[9] = 2 // RGB

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(linhas))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public/icones', { recursive: true })
writeFileSync('public/icones/icone-192.png', png(192))
writeFileSync('public/icones/icone-512.png', png(512))
writeFileSync('public/icones/apple-touch-icon.png', png(180))
console.log('ícones gerados em public/icones/')
