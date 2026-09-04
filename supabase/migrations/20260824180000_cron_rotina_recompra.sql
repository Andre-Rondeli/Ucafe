-- Aviso das 9h: quem já devia ter repetido o pedido.
--
-- Usa o token que nasceu dentro do banco em `rotina_config` — nenhuma chave nova, nenhuma
-- `service_role` guardada no banco. Ver 20260824090000_rotina_config para o porquê.
--
-- **12:00 UTC = 9:00 da Bahia.** O banco roda em UTC e a Bahia não tem horário de verão
-- desde 2019, então o deslocamento é fixo em -3: um número só, sem conversão dinâmica.
-- Ajuste o horário se a operação for de outro fuso.
--
-- Uma vez por dia, e não a cada hora: a lista de vencidos muda de dia para dia, e o aviso
-- é para o time começar a ligar. Rodar duas vezes no mesmo dia não incomoda ninguém — a
-- chave do aviso carrega a data, então o segundo disparo não cria nada.

create or replace function rodar_rotina_recompra() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_url text; v_token text; v_anon text;
begin
  select url, token, anon into v_url, v_token, v_anon from rotina_alvo('recompra');

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'x-rotina-token', v_token
    ),
    body := jsonb_build_object('acao', 'rotina-recompra'),
    timeout_milliseconds := 120000
  );
end;
$$;

alter function public.rodar_rotina_recompra() owner to postgres;
revoke all on function public.rodar_rotina_recompra() from public, anon, authenticated;

-- desagenda antes para poder rodar este arquivo duas vezes sem erro
select cron.unschedule('rotina-recompra')
where exists (select 1 from cron.job where jobname = 'rotina-recompra');

select cron.schedule(
  'rotina-recompra',
  '0 12 * * *', -- 9:00 da Bahia
  $cron$ select public.rodar_rotina_recompra(); $cron$
);

-- Para rodar agora, sem esperar as 9h:
--   select public.rodar_rotina_recompra();
-- Para ver o que voltou:
--   select status_code, content from net._http_response order by created desc limit 5;
-- Para desligar:
--   select cron.unschedule('rotina-recompra');

notify pgrst, 'reload schema';
