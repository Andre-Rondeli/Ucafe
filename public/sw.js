// Service worker do Torrão — o mínimo que faz o app instalar e abrir rápido,
// sem NUNCA servir dado velho de venda.
//
// Regras, na ordem em que importam:
// 1. Supabase (dado de negócio) não passa pelo cache de jeito nenhum: preço,
//    pedido e comissão têm que ser o que está no banco agora.
// 2. Navegação (index.html) é network-first: deploy novo chega na próxima
//    abertura; o cache só responde quando está sem rede.
// 3. /assets/ do Vite tem hash no nome (imutável): cache-first sem medo.
const CACHE = 'torrao-v1'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (evento) => {
  const { request } = evento
  const url = new URL(request.url)

  // só GET do próprio site — Supabase e qualquer POST seguem direto pra rede
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  // navegação: rede primeiro; cache é só o modo offline
  if (request.mode === 'navigate') {
    evento.respondWith(
      fetch(request)
        .then((resposta) => {
          const copia = resposta.clone()
          caches.open(CACHE).then((cache) => cache.put('/', copia))
          return resposta
        })
        .catch(() => caches.match('/')),
    )
    return
  }

  // assets com hash + ícones/manifest: cache primeiro
  evento.respondWith(
    caches.match(request).then(
      (guardado) =>
        guardado ??
        fetch(request).then((resposta) => {
          if (resposta.ok) {
            const copia = resposta.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copia))
          }
          return resposta
        }),
    ),
  )
})

// ---------------------------------------------------------------- aviso no celular
// Chega com o app FECHADO — é o ponto do Web Push. O recado vem cifrado (RFC 8291) e o
// navegador já entrega decifrado aqui; a Edge Function `avisos` é quem manda.
self.addEventListener('push', (evento) => {
  // corpo sempre JSON nosso; se vier outra coisa (teste do navegador, serviço estranho),
  // mostra como texto em vez de engolir o aviso
  let dados = {}
  try {
    dados = evento.data ? evento.data.json() : {}
  } catch (_) {
    dados = { titulo: 'Torrão', corpo: evento.data ? evento.data.text() : '' }
  }

  evento.waitUntil(
    self.registration.showNotification(dados.titulo || 'Torrão', {
      body: dados.corpo || '',
      icon: '/icones/icone-192.png',
      badge: '/icones/icone-192.png',
      lang: 'pt-BR',
      // `tag` com o id do aviso: reenvio do MESMO aviso substitui a notificação em vez de
      // empilhar três iguais na tela do motorista
      tag: dados.avisoId || undefined,
      data: { url: dados.url || '/' },
      // aviso de trabalho: vibra e fica na barra
      requireInteraction: false,
    }),
  )
})

// Tocar no aviso abre o app JÁ na tela certa (entregas), e reaproveita a janela aberta —
// abrir uma segunda aba do PWA confunde quem está com o celular na mão.
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const destino = (evento.notification.data && evento.notification.data.url) || '/'

  evento.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const janela of janelas) {
        if (janela.url.indexOf(destino) !== -1) return janela.focus()
      }
      const aberta = janelas[0]
      if (aberta) {
        await aberta.focus()
        // navigate falha em alguns navegadores quando a janela não é controlada por nós:
        // focar já resolve o essencial, então a falha não pode derrubar o clique
        try {
          return await aberta.navigate(destino)
        } catch (_) {
          return
        }
      }
      return self.clients.openWindow(destino)
    })(),
  )
})
