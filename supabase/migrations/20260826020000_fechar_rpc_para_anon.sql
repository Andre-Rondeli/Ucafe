-- Tira do visitante NÃO LOGADO as RPCs que não são dele.
--
-- O linter do Supabase aponta toda função `security definer` alcançável por `anon` em
-- /rest/v1/rpc/. Conferi uma a uma antes de mexer, e **nenhuma vazava**: todas checam o
-- chamador por dentro — `bases_comissao` e `pendencias_consignado` filtram por
-- `is_admin() or (esta_ativo() and auth.uid() = ...)`, `marcar_entregue`
-- levanta exceção se não for motorista nem dono do cliente, e
-- `listar_equipe` tem `where is_admin()`. Chamadas por anon, devolvem vazio ou erro.
--
-- Então por que mexer: essa é a segunda tranca, não a primeira. A primeira (a checagem
-- dentro da função) continua sendo a que vale — mas ela mora numa linha de SQL que alguém
-- pode reescrever um dia sem perceber o que estava segurando. Fechar o EXECUTE faz o
-- portão errar para o lado seguro se aquela linha cair.
--
-- **`revoke ... from anon` sozinho NÃO funciona** — e essa é a pegadinha. O Postgres
-- concede EXECUTE a `PUBLIC` em toda função nova, e `anon` herda dali; revogar do papel
-- sem revogar de PUBLIC não muda nada, e `has_function_privilege` continua devolvendo
-- true. Tem de tirar de PUBLIC e devolver só para quem precisa.
--
-- Confirmado antes de escrever: nenhuma Edge Function chama RPC (elas usam a tabela
-- direto), então `authenticated` é o único que precisa. `service_role` entra junto como
-- rede — se um dia uma edge passar a chamar, ela não descobre isso quebrando em produção.

-- ---------------------------------------------------------------- ação e leitura de dado
revoke execute on function public.bases_comissao(uuid, date, date) from public;
grant execute on function public.bases_comissao(uuid, date, date) to authenticated, service_role;

revoke execute on function public.pendencias_consignado() from public;
grant execute on function public.pendencias_consignado() to authenticated, service_role;

revoke execute on function public.listar_equipe() from public;
grant execute on function public.listar_equipe() to authenticated, service_role;

revoke execute on function public.marcar_entregue(uuid) from public;
grant execute on function public.marcar_entregue(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- o que NÃO se toca aqui
-- 1. `is_admin()`, `esta_ativo()`, `is_motorista()`, `pode_ver_cliente()`,
--    `tem_entrega_pendente()` — são chamadas DENTRO das policies
--    de RLS, avaliadas no contexto de quem consulta. Revogar ali arrisca quebrar a
--    autorização do app inteiro para ganhar aviso limpo no linter. Não vale a troca.
--
-- 2. As funções de GATILHO — `handle_new_user()`, `pedido_item_congelar_custo()`,
--    `consignado_resolver_produto()`,
--    `pedidos_bloquear_reescrita()`. Chamá-las direto pelo PostgREST não faz nada útil
--    (elas só têm sentido presas ao trigger, com NEW/OLD). O risco de mexer é real e o
--    ganho é zero: `handle_new_user` é o que cria o profile de gente nova, e
--    `pedido_item_congelar_custo` é o que congela custo — as duas quebram calado.
--    O aviso do linter sobre elas fica, e fica sabido.

notify pgrst, 'reload schema';
