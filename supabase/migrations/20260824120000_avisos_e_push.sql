-- Aviso na mão de quem interessa: NF emitida e carga pronta.
--
-- Duas tabelas, dois papéis diferentes:
--   `avisos`            -- o QUE avisar e para QUEM. Vale mesmo sem push: a tela lê daqui.
--   `push_assinaturas`  -- por qual aparelho mandar. Uma linha por celular, não por pessoa.
--
-- O aviso existe ANTES do push de propósito. Push falha por motivo que não é nosso
-- (permissão revogada, aparelho trocado, serviço do navegador fora): se o aviso morasse
-- só no push, a informação sumiria com ele. Aqui o push é entrega, não o recado.
--
-- Idempotência pela `chave`: a rotina roda a cada 20 minutos e vai reencontrar a mesma
-- NF autorizada. `unique (destinatario, chave)` faz o segundo insert virar no-op em vez
-- de tocar o celular do motorista de novo a cada rodada.

create table avisos (
  id uuid primary key default gen_random_uuid(),
  destinatario uuid not null references profiles on delete cascade,
  -- nf_emitida | carga_pronta
  tipo text not null,
  titulo text not null,
  corpo text not null,
  -- rota do app para abrir no clique (ex.: /entregas)
  url text,
  -- idempotência: 'nf:11633' / 'carga:<uuid>'
  chave text not null,
  criado_em timestamptz not null default now(),
  lido_em timestamptz,
  -- quando o push saiu de verdade; null = só está na tela
  enviado_em timestamptz,
  erro_envio text,
  unique (destinatario, chave)
);

create index avisos_nao_lidos_idx on avisos (destinatario, criado_em desc)
  where lido_em is null;

create index avisos_a_enviar_idx on avisos (criado_em)
  where enviado_em is null;

create table push_assinaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  -- o endpoint é o endereço do aparelho no serviço do navegador; único no mundo
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text,
  criada_em timestamptz not null default now(),
  ultimo_erro text,
  -- 404/410 do serviço de push = aparelho sumiu. Desativa em vez de apagar: apagar
  -- esconde que a pessoa tinha aceitado e agora não recebe mais.
  desativada_em timestamptz
);

create index push_assinaturas_user_idx on push_assinaturas (user_id)
  where desativada_em is null;

-- ------------------------------------------------------------------ RLS
-- Aviso é pessoal: cada um lê e marca como lido o SEU. Quem escreve é a Edge Function
-- com service_role (nenhuma policy de insert de propósito) — assim ninguém fabrica aviso
-- para o celular de outro.
alter table avisos enable row level security;
alter table push_assinaturas enable row level security;

create policy avisos_select_proprio on avisos for select
  using (destinatario = auth.uid());

create policy avisos_marcar_lido on avisos for update
  using (destinatario = auth.uid())
  with check (destinatario = auth.uid());

-- A assinatura é do aparelho de quem está logado: ele cria e ele apaga (ao desligar o
-- aviso ou trocar de celular).
create policy push_select_proprio on push_assinaturas for select
  using (user_id = auth.uid());

create policy push_insert_proprio on push_assinaturas for insert
  with check (user_id = auth.uid() and esta_ativo());

create policy push_update_proprio on push_assinaturas for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy push_delete_proprio on push_assinaturas for delete
  using (user_id = auth.uid());

notify pgrst, 'reload schema';
