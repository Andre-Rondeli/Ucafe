import { createClient } from '@supabase/supabase-js'

/**
 * Ligação com o Supabase deste projeto.
 *
 * **Os dois valores vêm do `.env`** (copie de `.env.example`). Não existe um projeto real
 * embutido aqui de propósito: um padrão de verdade no código faria o app apontar em
 * silêncio para o banco de outra pessoa quando alguém esquecesse o `.env`, e ninguém
 * descobriria pela tela — só pelo dado errado, semanas depois.
 *
 * Sem `.env` o app aponta para um endereço que **não existe**: a tela mostra erro de
 * conexão e o console diz o que fazer. Falhar assim é melhor do que os dois extremos —
 * quebrar no import (que derruba o build e os testes, que não têm `.env`) ou funcionar
 * apontando para o lugar errado.
 *
 * A chave anon é *publishable*: o Vite embute qualquer `VITE_*` no bundle, então ela já é
 * legível por qualquer visitante do site. Isso não é falha — quem protege o dado é a RLS
 * do banco, não o segredo desta chave.
 *
 * A `service_role` NUNCA entra aqui nem em variável de build: essa sim ignora a RLS. Ela
 * vive só nos segredos do projeto, lida pelas Edge Functions.
 *
 * Na Vercel (ou onde for publicado) as duas variáveis precisam estar cadastradas no
 * painel do projeto — o `.env` local não sobe junto.
 */
const NAO_CONFIGURADO = 'https://configure-o-env.invalid'

const url = import.meta.env.VITE_SUPABASE_URL || NAO_CONFIGURADO
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sem-chave'

if (url === NAO_CONFIGURADO) {
  console.error(
    'Supabase não configurado: copie `.env.example` para `.env` e preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (dashboard → Project Settings → API). Nada vai carregar até isso.',
  )
}

export const supabase = createClient(url, chave)
