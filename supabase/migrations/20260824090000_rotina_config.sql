-- Configuração das rotinas automáticas (pg_cron) — e o segredo que as autoriza.
--
-- Três valores, e nenhum deles é a chave-mestra do banco:
--   `token`     -- nasce DENTRO do banco. Quem o vazasse conseguiria pedir ao app que
--                  rodasse uma rotina, e nada além disso. É o mínimo privilégio de verdade.
--   `url_base`  -- https://<seu-projeto>.supabase.co  (SEM barra no fim)
--   `anon_key`  -- a publishable key do projeto. Pública por natureza: já vai no bundle do
--                  app. Ela existe aqui só para passar pelo portão do Supabase, que exige
--                  um JWT válido antes de a função rodar. Quem autoriza é o `token`.
--
-- **Por que os dois últimos ficam no BANCO e não escritos dentro da função:** um endereço
-- errado dentro de `net.http_post` falha CALADO — a chamada é assíncrona, o cron fica
-- verde e ninguém descobre por semanas. Lidos daqui, a função levanta exceção na hora e o
-- erro aparece.
--
-- ⚠️ PASSO OBRIGATÓRIO ao montar o projeto (sem ele nenhuma rotina roda):
--
--   update rotina_config set
--     url_base = 'https://SEU-PROJETO.supabase.co',
--     anon_key = 'COLE-A-PUBLISHABLE-KEY-AQUI';
--
-- Os dois valores estão em Project Settings → API no dashboard do Supabase.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table rotina_config (
  -- linha única: o check trava a tabela em UMA configuração
  id boolean primary key default true check (id),
  -- 256 bits de um gerador criptográfico (gen_random_uuid do PG13+), em hexa
  token text not null default replace(gen_random_uuid()::text, '-', '') ||
                               replace(gen_random_uuid()::text, '-', ''),
  -- null até alguém rodar o update acima. Null é honesto: "ninguém configurou ainda".
  url_base text,
  anon_key text,
  criado_em timestamptz not null default now()
);

insert into rotina_config (id) values (true) on conflict (id) do nothing;

-- RLS ligada e NENHUMA policy: nem o admin logado lê o token pelo PostgREST. Só a Edge
-- Function (service_role, que não passa por policy) e o cron (security definer).
alter table rotina_config enable row level security;

-- Uma função só que lê a configuração e RECLAMA quando falta — em vez de cada rotina
-- repetir a mesma checagem e uma delas esquecer.
create or replace function rotina_alvo(p_funcao text)
returns table (url text, token text, anon text)
language plpgsql security definer set search_path = public as $$
declare
  cfg record;
begin
  select * into cfg from rotina_config limit 1;
  if cfg is null then
    raise exception 'rotina_config vazia — rode o insert desta migration.';
  end if;
  if cfg.token is null or cfg.url_base is null or cfg.anon_key is null then
    raise exception 'rotina_config incompleta: preencha url_base e anon_key (Project Settings → API).';
  end if;
  return query select rtrim(cfg.url_base, '/') || '/functions/v1/' || p_funcao, cfg.token, cfg.anon_key;
end;
$$;

alter function public.rotina_alvo(text) owner to postgres;
revoke all on function public.rotina_alvo(text) from public, anon, authenticated;

notify pgrst, 'reload schema';
