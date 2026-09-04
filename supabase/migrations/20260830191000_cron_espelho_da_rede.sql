-- Sincronia diária do espelho da rede, às 6h30 da Bahia.
--
-- Reaproveita o token que já nasceu dentro do banco em `rotina_config` — nenhuma chave
-- nova, nenhuma `service_role` no banco. Ver 20260824090000_rotina_config para o
-- porquê disso.
--
-- **9:30 UTC = 6:30 da Bahia.** O banco roda em UTC e a Bahia não tem horário de verão
-- desde 2019, então o deslocamento é fixo em -3: um número só, sem conversão dinâmica.
--
-- Por que 6h30 e não de madrugada: a janela de sincronização do ProcessDesk com o Consinco
-- é 02:00–06:00 da Bahia. Buscar antes das 6h traria a foto de anteontem. Buscar às 6h30
-- pega o dado do dia já fechado e ainda chega antes de qualquer pessoa abrir a tela.
--
-- Uma vez por dia, e não de hora em hora: a venda de uma loja só muda de dia para dia
-- nesta fonte (o Consinco entrega por dia fechado). E rodar duas vezes no mesmo dia não
-- incomoda — a chave de `rede_dia` é (dia, loja, produto), então o segundo disparo
-- atualiza as mesmas linhas em vez de duplicar.

create or replace function rodar_rotina_rede() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text; v_token text; v_anon text;
begin
  select url, token, anon into v_url, v_token, v_anon from rotina_alvo('processdesk');

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'x-rotina-token', v_token
    ),
    body := jsonb_build_object('acao', 'sincronizar'),
    -- 120s: a primeira carga traz ~4 meses de histórico de uma vez. As seguintes trazem
    -- 3 dias e voltam em segundos.
    timeout_milliseconds := 120000
  );
end;
$$;

alter function public.rodar_rotina_rede() owner to postgres;
revoke all on function public.rodar_rotina_rede() from public, anon, authenticated;

-- desagenda antes para poder rodar este arquivo duas vezes sem erro
select cron.unschedule('espelho-da-rede')
where exists (select 1 from cron.job where jobname = 'espelho-da-rede');

select cron.schedule(
  'espelho-da-rede',
  '30 9 * * *', -- 6:30 da Bahia
  $cron$ select public.rodar_rotina_rede(); $cron$
);

-- Para rodar agora, sem esperar as 6h30:
--   select public.rodar_rotina_rede();
-- Para ver o que voltou:
--   select status_code, content from net._http_response order by created desc limit 5;
-- Para ver como foi a rodada, em português:
--   select em, resultado, linhas_gravadas, detalhe from rede_sync_execucoes order by em desc limit 5;
-- Para desligar:
--   select cron.unschedule('espelho-da-rede');

notify pgrst, 'reload schema';
