-- Rollback de 20260922260000_send_push_notification_revoke.sql
--
-- ATENCAO: devolve a PUBLIC/anon/authenticated o direito de disparar push com
-- titulo, corpo e link arbitrarios para qualquer conta. So rodar se aparecer um
-- chamador legitimo que execute com o token do navegador - e nesse caso o certo
-- e envolver a chamada num RPC com checagem de tenant, nao reabrir esta.

begin;

set local lock_timeout = '5s';

grant execute on function public.send_push_notification(uuid, text, text, text, text, text)
  to public, anon, authenticated, service_role;

commit;
