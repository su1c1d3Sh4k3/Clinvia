-- Rollback de 20260925120000_google_calendar_desligado.sql
--
-- Este arquivo derruba a INFRAESTRUTURA da chave (coluna + RPC). Quase nunca e
-- o que se quer.
--
-- PARA RELIGAR O RECURSO, NAO RODE ISTO. Religar e uma celula:
--
--     update public.llm_platform_settings set google_calendar_enabled = true;
--
-- O servidor obedece em ate 5 minutos (cache do `_shared/google-calendar-flag.ts`)
-- e o front em ate 5 minutos (staleTime do `useGoogleCalendarEnabled`), sem
-- deploy e sem build.
--
-- Rode este arquivo so para desfazer a MIGRATION em si. Efeito colateral:
-- sem a coluna, `googleCalendarLigado()` nas edge functions cai no default
-- seguro (desligado) e o front perde a RPC e tambem fica desligado — ou seja,
-- remover a chave NAO religa o recurso, apenas tira o interruptor da parede.
--
-- O incidente de teste resolvido pela migration NAO e reaberto: era lixo de
-- teste e reabri-lo so devolveria ruido ao painel.

begin;

revoke all on function public.google_calendar_enabled() from authenticated, service_role;
drop function if exists public.google_calendar_enabled();

alter table public.llm_platform_settings
    drop column if exists google_calendar_enabled;

commit;
