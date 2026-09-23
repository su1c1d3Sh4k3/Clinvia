-- Rollback de 20260923300000_incident_analyze_cron.sql
--
-- CONSEQUENCIA DE RODAR ISTO: os incidentes voltam a nascer sem analise. O
-- alerta continua saindo (o despachante nao depende do analisador), mas com
-- "analise indisponivel" no lugar da causa provavel e com o erro bruto no lugar
-- da explicacao. Nenhum incidente e apagado e nenhuma analise ja gravada se
-- perde.
--
-- As colunas ai_tokens/ai_cost_usd NAO sao dropadas: sao o unico registro de
-- quanto a IA de monitoramento ja custou. Dropar apagaria a contabilidade junto
-- com o mecanismo. Para remove-las de verdade, o comando esta comentado no fim.

do $$
begin
    perform cron.unschedule('incident-analyze-scan');
exception when others then
    null;
end;
$$;

drop function if exists public.invoke_incident_analyze();
drop function if exists public.incident_analyze_pending_count();

-- Volta incident_finish_analysis a versao sem medicao de custo.
create or replace function public.incident_finish_analysis(p_incident_id uuid, p_result jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_sev text := nullif(trim(coalesce(p_result ->> 'severidade', '')), '');
begin
    if v_sev is not null and v_sev not in ('critica', 'alta', 'media', 'baixa') then
        v_sev := null;
    end if;

    update public.incidents
       set ai_summary          = nullif(trim(coalesce(p_result ->> 'resumo', '')), ''),
           ai_probable_cause   = nullif(trim(coalesce(p_result ->> 'causa', '')), ''),
           ai_origin           = nullif(trim(coalesce(p_result ->> 'origem', '')), ''),
           ai_severity         = coalesce(ai_severity, v_sev),
           ai_impact           = nullif(trim(coalesce(p_result ->> 'impacto', '')), ''),
           ai_fix_n8n          = nullif(trim(coalesce(p_result ->> 'acao_n8n', '')), ''),
           ai_fix_system       = nullif(trim(coalesce(p_result ->> 'acao_sistema', '')), ''),
           ai_confidence       = case when jsonb_typeof(p_result -> 'confianca') = 'number'
                                      then least(1, greatest(0, (p_result ->> 'confianca')::numeric)) end,
           ai_model            = nullif(trim(coalesce(p_result ->> 'modelo', '')), ''),
           analyzed_at         = now(),
           analysis_claimed_at = null,
           updated_at          = now()
     where id = p_incident_id;
end;
$$;

revoke all on function public.incident_finish_analysis(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.incident_finish_analysis(uuid, jsonb) to service_role;

-- alter table public.incidents drop column if exists ai_tokens;
-- alter table public.incidents drop column if exists ai_cost_usd;
