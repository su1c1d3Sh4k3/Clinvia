-- Rollback de 20260923370000_canal_de_alertas_email.sql
--
-- CONSEQUENCIA DE RODAR ISTO: o alerta volta a ter UM unico caminho de saida.
-- Se o WhatsApp da conta Bruno Admin parar, nenhum incidente critico chega a
-- ninguem e o silencio fica indistinguivel de "esta tudo bem" — que e
-- exatamente o defeito que esta migration veio fechar. So rode se o e-mail
-- estiver causando dano maior do que isso.
--
-- ANTES DE ROLAR ISTO, considere desligar em vez de remover:
--   update public.llm_platform_settings set alert_email_enabled = false;   -- so a 2a via
--   update public.llm_platform_settings set canal_mudo_enabled  = false;   -- so o detector
--   select cron.unschedule('alert-channel-watch');                          -- so o vigia
--
-- O que NAO e desfeito, de proposito:
--   * `alert_recipients.email` fica. Derrubar coluna e destrutivo e apagaria um
--     endereco digitado a mao; sem as funcoes lendo, ela e inerte.
--   * `incident_notifications.via` fica, pelo mesmo motivo — e porque as linhas
--     ja gravadas perderiam a informacao de por onde o aviso saiu.
--   * a linha `canal:whatsapp-alertas` do catalogo fica: ela so da NOME ao
--     incidente. Apagar troca uma descricao util por "componente nao catalogado".

-- ── 1. o vigia para de ser acordado ──────────────────────────────────────────

select cron.unschedule('alert-channel-watch')
 where exists (select 1 from cron.job where jobname = 'alert-channel-watch');

drop function if exists public.invoke_alert_channel_watch();

-- ── 2. detector e fechamento do ciclo saem ───────────────────────────────────

drop function if exists public.canal_alertas_email_done(uuid, uuid, boolean, text);
drop function if exists public.canal_alertas_scan();

-- ── 3. restricoes voltam ao vocabulario antigo ───────────────────────────────
--
-- Linhas ja gravadas com kind='canal' impediriam a restricao antiga de voltar.
-- Elas sao registro de e-mail enviado; viram 'individual' para nao serem
-- perdidas (o `via` continua dizendo que sairam por e-mail).

update public.incident_notifications set kind = 'individual' where kind = 'canal';

alter table public.incident_notifications
    drop constraint if exists incident_notifications_kind_check;
alter table public.incident_notifications
    add constraint incident_notifications_kind_check
    check (kind in ('individual', 'resumo', 'recorrencia'));

-- `skipped_severity` NAO volta a ser proibido: aquilo era um defeito (a edge
-- function grava esse valor e o insert falhava calado). Reintroduzir a proibicao
-- seria reintroduzir o defeito.

-- ── 4. chaves de desligar saem ───────────────────────────────────────────────

alter table public.llm_platform_settings
    drop column if exists alert_email_enabled,
    drop column if exists canal_mudo_enabled,
    drop column if exists canal_mudo_atraso_min,
    drop column if exists canal_mudo_horas,
    drop column if exists canal_mudo_cooldown_min;
