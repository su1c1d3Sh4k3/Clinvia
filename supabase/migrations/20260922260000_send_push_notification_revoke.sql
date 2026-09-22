-- Item 0.4: public.send_push_notification deixa de ser chamavel pelo navegador.
--
-- O QUE E: helper SECURITY DEFINER criado em 20251217_add_push_notification_helper.sql
-- que faz extensions.http_post para a edge function /functions/v1/send-push com
-- title, body, url e tag ARBITRARIOS para qualquer p_user_id.
--
-- ESTADO ANTES (medido em 22/09/2026):
--   - EXECUTE concedido a PUBLIC, anon, authenticated, postgres, service_role;
--   - chamadores reais no banco: ZERO (nenhuma funcao com o nome no prosrc,
--     nenhum trigger);
--   - chamadores no repo: ZERO (o unico `PERFORM send_push_notification(...)` do
--     repo esta dentro do bloco de exemplo COMENTADO da propria migration que a
--     criou; `send-push` nao aparece em src/ nem nas edge functions);
--   - as duas GUCs que ela precisa (`app.settings.supabase_url` e
--     `app.settings.service_role_key`) NAO estao configuradas, entao a url vira
--     NULL, o http_post falha e o `exception when others` engole o erro: hoje a
--     funcao e um no-op.
--
-- POR QUE IMPORTA MESMO SENDO NO-OP: basta alguem configurar essas duas GUCs
-- para que qualquer visitante anonimo passe a disparar push com texto e link
-- arbitrarios para os dispositivos de qualquer conta (phishing dentro do app).
-- O privilegio nao deve depender de uma GUC estar vazia.
--
-- CORRECAO: revoke de EXECUTE para public, anon e authenticated. A funcao NAO e
-- dropada (pode voltar a ser usada por trigger interno) e service_role/postgres
-- continuam podendo executar, que e como um trigger ou cron a chamaria.
--
-- NAO AFETA: nada. Zero chamadores. O push do app nao passa por aqui - o front
-- nao invoca nem a RPC nem a edge function send-push.
--
-- Rollback: 20260922260000_send_push_notification_revoke_rollback.sql

begin;

set local lock_timeout = '5s';

revoke all on function public.send_push_notification(uuid, text, text, text, text, text)
  from public, anon, authenticated;

grant execute on function public.send_push_notification(uuid, text, text, text, text, text)
  to service_role;

commit;
