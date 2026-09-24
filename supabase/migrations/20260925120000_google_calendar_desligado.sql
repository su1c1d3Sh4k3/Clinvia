-- Google Calendar desligado por chave, nao apagado (25/09/2026).
--
-- O QUE ELE PEDIU: "flag unica que desliga a sincronia inteira, servidor e
-- front; a opcao some da tela de configuracao; cliente que ja tinha conectado
-- precisa ver mensagem clara de que o recurso esta temporariamente
-- indisponivel; crons e workers desagendados; alertas dessa classe suprimidos
-- NA ORIGEM, nao filtrados na saida; agendamentos existentes nao podem
-- quebrar; se houver google_event_id gravado, ele fica la, intocado."
--
-- O QUE A MEDICAO MOSTROU ANTES DE MEXER EM QUALQUER COISA:
--
--   conexoes em professional_google_calendars ......... 4 (TODAS is_active=false)
--   contas distintas com conexao ATIVA ................ 0
--   e-mail das 4 ...................................... suicideshake@gmail.com
--   criadas 22-23/02, desligadas 27/02
--   appointments com google_event_id .................. 0
--   crons com 'google' no comando ..................... 0
--   incidentes reais da classe ........................ 0
--
-- Ou seja: NENHUM cliente esta sincronizado hoje e NENHUM agendamento carrega
-- id de evento do Google. As 4 conexoes sao do tenant de teste do proprio
-- super admin e ja estavam desligadas ha sete meses. Desligar nao tira nada
-- de ninguem — a parte "agendamentos existentes nao podem quebrar" e vacuo
-- verdadeiro, e a parte "cliente que ja tinha conectado" tem audiencia zero
-- hoje; o aviso na tela existe para essas 4 linhas e para o dia em que voltar.
--
-- O unico incidente com 'google' no componente
-- (`google:credencial_recusada`, 23/09 21:28) e uma INJECAO DE TESTE minha
-- (`context.zz_teste = true`, "teste inverso da Etapa 2"), nao trafego real.
-- Fica resolvido aqui porque e lixo de teste meu no painel dele.
--
-- "CRONS E WORKERS DESAGENDADOS": nao ha o que desagendar. A sincronia nunca
-- teve cron — ela e acordada por (a) `api-scheduling` ao criar/reagendar/
-- cancelar, (b) o front ao abrir /scheduling e nos botoes "Sincronizar
-- Google", (c) `delivery-automation-respond`, e (d) o webhook de push do
-- Google. Os quatro gatilhos passam pela chave.
--
-- "ALERTAS SUPRIMIDOS NA ORIGEM": deliberadamente NAO cadastrei componente
-- `somente_painel` para a classe. Isso seria filtrar na saida, que e
-- exatamente o que ele proibiu. O alerta deixa de existir porque o
-- `reportIncident` de `google_calendar_sync:*` em `api-scheduling` nao e mais
-- alcancado e porque as cinco functions google-* devolvem 200 com
-- `skipped` — `serveMonitored` so relata >= 500, entao 200 nao gera nada.
-- PEGADINHA que isso evita: se a resposta de "desligado" fosse 503, o proprio
-- desligamento viraria incidente a cada chamada.
--
-- POR QUE A CHAVE MORA EM `llm_platform_settings`: e o singleton de
-- configuracao da plataforma (ja carrega `cron_health_*`, `canal_mudo_*`,
-- `alert_*`). Uma linha, um lugar para virar. O default e FALSE: recurso
-- nasce desligado, e ligar de volta e um UPDATE de uma celula.
--
-- COMO O FRONT LE: `llm_platform_settings` tem RLS ligada e ZERO policies, ou
-- seja, anon/authenticated nao leem nada dela (e nem devem — ha e-mail de
-- alerta e saldo da OpenAI ali). Entao o front le por RPC que devolve SO o
-- booleano, sem expor a tabela.

begin;

alter table public.llm_platform_settings
    add column if not exists google_calendar_enabled boolean not null default false;

comment on column public.llm_platform_settings.google_calendar_enabled is
    'Chave unica da sincronia com o Google Calendar (servidor + front). false = '
    'recurso indisponivel: as 5 functions google-* devolvem 200 sem fazer nada, '
    'api-scheduling nao dispara a sincronia nem o incidente, e a opcao some da '
    'tela do profissional. Nada e apagado: professional_google_calendars, '
    'appointments.google_event_id e google_calendar_sync_id ficam intactos.';

-- Desliga de fato. `add column ... default false` ja cobriria a linha
-- existente, mas o update explicito deixa a migration idempotente caso a
-- coluna ja exista de uma tentativa anterior.
update public.llm_platform_settings set google_calendar_enabled = false;

-- ── Leitor para o front ──────────────────────────────────────────────────────
-- Devolve so o booleano. Nao expoe nenhuma outra coluna do singleton.
create or replace function public.google_calendar_enabled()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select coalesce((select s.google_calendar_enabled
                       from public.llm_platform_settings s
                      order by s.id
                      limit 1), false);
$$;

-- `create function` concede EXECUTE a PUBLIC e `revoke from anon` NAO tira o
-- grant de PUBLIC. Tira de PUBLIC primeiro, depois concede nominalmente.
revoke all on function public.google_calendar_enabled() from public, anon;
grant execute on function public.google_calendar_enabled() to authenticated, service_role;

-- ── Lixo de teste meu no painel dele ─────────────────────────────────────────
update public.incidents
   set status = 'resolved',
       resolved_at = now(),
       notes = coalesce(notes || E'\n', '')
            || 'Injecao de teste da Etapa 2 (context.zz_teste = true), nao trafego real. '
            || 'A classe inteira foi desligada em 25/09 pela chave '
            || 'llm_platform_settings.google_calendar_enabled.'
 where component = 'google:credencial_recusada'
   and status <> 'resolved'
   and exists (
        select 1 from public.incident_events e
         where e.incident_id = incidents.id
           and (e.context->>'zz_teste')::boolean is true
   );

commit;
