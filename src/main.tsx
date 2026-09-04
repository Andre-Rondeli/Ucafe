import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { MARCA } from '@/lib/marca'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// PWA: só em produção — no dev o service worker atrapalha o hot reload
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // sem SW o app continua funcionando normal, só não instala/abre offline
    })
  })

  // deploy novo com o app aberto: avisa e deixa a pessoa escolher a hora de
  // recarregar — nunca recarrega sozinho (podia estar no meio de um pedido).
  // DOM puro de propósito: fora da árvore React, não depende de tela nenhuma.
  let tinhaControlador = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaControlador) {
      tinhaControlador = true // primeira instalação, não é atualização
      return
    }
    if (document.getElementById('aviso-versao')) return
    const aviso = document.createElement('div')
    aviso.id = 'aviso-versao'
    aviso.style.cssText =
      'position:fixed;bottom:76px;left:16px;right:16px;z-index:50;background:#92400e;color:#fff;' +
      'padding:12px 16px;border-radius:12px;display:flex;align-items:center;gap:12px;' +
      'box-shadow:0 4px 12px rgba(0,0,0,.25);font:500 14px system-ui'
    aviso.innerHTML =
      `<span style="flex:1">Versão nova do ${MARCA} disponível.</span>` +
      '<button style="background:#fff;color:#92400e;border:0;border-radius:8px;padding:8px 14px;font-weight:600">Atualizar</button>'
    aviso.querySelector('button')!.addEventListener('click', () => window.location.reload())
    document.body.appendChild(aviso)
  })
}
