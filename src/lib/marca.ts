/**
 * O nome que aparece na tela. **É aqui que se troca o nome do app.**
 *
 * Existe como constante e não espalhado no meio do JSX porque trocar o nome tem de ser um
 * passo de um minuto, não uma caçada por vinte arquivos.
 *
 * Três lugares FORA do TypeScript não leem daqui e precisam ser trocados à mão — eles
 * viram o nome no celular e na aba do navegador:
 *   1. `index.html`               — <title>, description, apple-mobile-web-app-title
 *   2. `public/manifest.webmanifest` — name, short_name, description (nome do ícone na tela de início)
 *   3. `package.json`             — o campo "name"
 *
 * E a logo do cabeçalho é `public/icones/logo-cabecalho.png`; os ícones do app saem de
 * `scripts/gerar-icones.mjs`.
 */
export const MARCA = 'Ucafé'
