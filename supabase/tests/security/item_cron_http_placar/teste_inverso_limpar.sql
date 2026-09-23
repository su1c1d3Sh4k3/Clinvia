-- Passo 3 de 3 do teste inverso: nao deixa sujeira no painel.
-- Rodar SEMPRE, mesmo que o passo 2 tenha reprovado.

delete from public.incident_events
 where incident_id in (select id from public.incidents where component like 'cron-http:zz-teste%');

delete from public.incidents where component like 'cron-http:zz-teste%';

delete from public.cron_http_calls where alvo like 'zz-teste-%';

delete from public.incident_component_catalog where component = 'cron-http:zz-teste';

select jsonb_pretty(jsonb_build_object(
    'incidentes_restantes', (select count(*) from public.incidents where component like '%zz-teste%'),
    'chamadas_restantes',   (select count(*) from public.cron_http_calls where alvo like 'zz-teste-%'),
    'catalogo_restante',    (select count(*) from public.incident_component_catalog where component = 'cron-http:zz-teste')
));
