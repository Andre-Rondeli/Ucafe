-- Espelho do café Torrão nas lojas da Rede Rondelli.
--
-- Uma vez por dia a Edge `processdesk` busca no ProcessDesk quanto saiu e quanto tem, e
-- grava aqui. Documento técnico: docs/ESPELHO-REDE-TECNICO.md · funcional:
-- docs/ESPELHO-REDE-COMO-FUNCIONA.md
--
-- Mesmo desenho do espelho do AgroFácil (20260823140000_espelho_por_venda): o dono do
-- espelho vai buscar, a chave primária é natural, e reprocessar não duplica.

-- UMA tabela, e não duas (venda e estoque separadas): o grão é o mesmo — dia × loja ×
-- produto. Duas tabelas significariam dois upserts, dois testes e um join na tela para
-- responder a pergunta que sempre vem junta ("vendeu quanto e ainda tem quanto?").
create table if not exists rede_dia (
  dia             date not null,
  loja_codigo     text not null,
  produto_codigo  text not null,
  -- denormalizados de propósito: o app do Torrão não tem cadastro de loja da rede nem de
  -- produto do Consinco, e criar um só para dar nome exigiria um segundo sincronizador.
  loja_nome       text,
  loja_tipo       text,   -- supermercado | atacado | cd — CD não é ponto de venda
  uf              text,
  produto_nome    text,
  -- NULOS quando não houve venda/foto naquele dia. Zero seria afirmação, e afirmar venda
  -- zero onde o dado não chegou é o que faz decidir errado.
  venda_qtd       numeric,
  venda_valor     numeric,
  estoque_qtd     numeric,   -- foto de ABERTURA do dia, não "agora"
  atualizado_em   timestamptz not null default now(),
  primary key (dia, loja_codigo, produto_codigo)
);

comment on table rede_dia is
  'Espelho somente-leitura do café Torrão nas lojas da Rede Rondelli, um registro por dia × loja × produto. Alimentado pela Edge Function processdesk (acao=sincronizar), que lê a Edge industria-espelho do ProcessDesk. PK natural, então reprocessar não duplica — e o Consinco reenvia os últimos dias corrigindo carga parcial, então reprocessar é o normal, não a exceção.';

comment on column rede_dia.estoque_qtd is
  'Foto de ABERTURA do dia no Consinco. Durante o dia a loja vende e este número já não vale — a tela precisa dizer isso.';
comment on column rede_dia.venda_qtd is
  'Quantidade LÍQUIDA de devolução. NULL = não houve venda registrada nesse dia nessa loja; não é zero.';

create index if not exists idx_rede_dia_dia on rede_dia (dia desc);
create index if not exists idx_rede_dia_loja on rede_dia (loja_codigo, dia desc);

alter table rede_dia enable row level security;

-- Dado comercial da rede: só admin. Vendedor e motorista não precisam, e abrir depois é
-- uma linha; fechar depois de aberto é conversa.
create policy rede_dia_select_admin on rede_dia for select using (is_admin());
-- Sem policy de escrita: quem grava é a Edge com service_role, que ignora RLS. É espelho —
-- ninguém digita aqui.

-- ---------------------------------------------------------------------------
-- Rastro das rodadas. Sem isto a tela não consegue dizer "a busca de hoje falhou" —
-- ela veria só dado de ontem e não teria como saber se é porque não houve venda ou
-- porque a sincronização quebrou.
-- ---------------------------------------------------------------------------
create table if not exists rede_sync_execucoes (
  id            bigserial primary key,
  em            timestamptz not null default now(),
  desde         date,
  resultado     text not null check (resultado in ('ok', 'erro', 'recusado_vazio')),
  linhas_venda  integer,
  linhas_estoque integer,
  linhas_gravadas integer,
  detalhe       text
);

comment on table rede_sync_execucoes is
  'Uma linha por rodada da sincronia com o ProcessDesk, inclusive as que falharam. resultado=recusado_vazio é a trava de completude: a origem respondeu sem nenhuma venda e o espelho já tinha dado, então NADA foi gravado — origem vazia não é o mesmo que "não vendeu".';

create index if not exists idx_rede_sync_execucoes_em on rede_sync_execucoes (em desc);

alter table rede_sync_execucoes enable row level security;
create policy rede_sync_execucoes_select_admin on rede_sync_execucoes for select using (is_admin());

notify pgrst, 'reload schema';
