import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const raiz = (caminho: string) => fileURLToPath(new URL(`../${caminho}`, import.meta.url))

describe('PWA', () => {
  const manifest = JSON.parse(readFileSync(raiz('public/manifest.webmanifest'), 'utf-8'))
  const sw = readFileSync(raiz('public/sw.js'), 'utf-8')
  const html = readFileSync(raiz('index.html'), 'utf-8')
  const main = readFileSync(raiz('src/main.tsx'), 'utf-8')

  it('manifest instala como app: standalone, ícones 192 e 512 existindo de verdade', () => {
    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/')
    const tamanhos = manifest.icons.map((i: { sizes: string }) => i.sizes)
    expect(tamanhos).toContain('192x192')
    expect(tamanhos).toContain('512x512')
    for (const icone of manifest.icons) {
      expect(existsSync(raiz(`public${icone.src}`)), `${icone.src} precisa existir`).toBe(true)
    }
  })

  it('index.html liga manifest, theme-color e ícone do iOS', () => {
    expect(html).toContain('manifest.webmanifest')
    expect(html).toContain('theme-color')
    expect(html).toContain('apple-touch-icon')
  })

  it('service worker é registrado só em produção', () => {
    expect(main).toContain("navigator.serviceWorker.register('/sw.js')")
    expect(main).toContain('import.meta.env.PROD')
  })

  it('service worker NUNCA intercepta o Supabase — dado de venda não pode vir de cache', () => {
    // o guard de origem tem que vir antes de qualquer respondWith
    const guard = sw.indexOf('url.origin !== self.location.origin')
    const primeiroRespond = sw.indexOf('respondWith')
    expect(guard).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(primeiroRespond)
    expect(sw).toContain("request.method !== 'GET'")
    expect(sw).not.toContain('supabase.co') // nenhuma regra específica: cross-origin inteiro fica de fora
  })

  it('mostra o aviso que chega por push, com ícone e sem depender do app aberto', () => {
    expect(sw).toContain("addEventListener('push'")
    expect(sw).toContain('showNotification')
    expect(sw).toContain('/icones/icone-192.png')
    // corpo que não é o nosso JSON não pode fazer o aviso desaparecer
    expect(sw).toMatch(/catch[\s\S]{0,120}titulo/)
  })

  it('tocar no aviso abre a tela do aviso e reaproveita a janela do app', () => {
    expect(sw).toContain("addEventListener('notificationclick'")
    expect(sw).toContain('notification.close()')
    expect(sw).toContain('matchAll')
    expect(sw).toContain('openWindow')
  })

  it('navegação é network-first: deploy novo não fica preso atrás do cache', () => {
    const navegacao = sw.slice(sw.indexOf("mode === 'navigate'"))
    const fetchPrimeiro = navegacao.indexOf('fetch(request)')
    const cacheDepois = navegacao.indexOf('caches.match')
    expect(fetchPrimeiro).toBeGreaterThan(-1)
    expect(fetchPrimeiro).toBeLessThan(cacheDepois)
  })
})
