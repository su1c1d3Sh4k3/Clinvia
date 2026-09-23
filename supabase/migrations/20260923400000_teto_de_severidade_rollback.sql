-- Rollback de 20260923400000_teto_de_severidade.sql
--
-- CONSEQUENCIA DE RODAR ISTO:
--   * a IA volta a poder REBAIXAR: um 'baixa' dela num componente catalogado
--     como 'alta' faz o incidente valer 'baixa' — `api-scheduling` (agenda
--     quebrada) pode virar aviso de resumo em vez de alerta;
--   * a IA volta a NAO poder subir: `ai_severity` fica travado no primeiro
--     valor gravado, mesmo que a analise conclua que e critico;
--   * os incidentes de `api-scheduling` abertos voltam de ALTA para 'media'
--     (a severidade efetiva e calculada na leitura, entao muda na hora).
--
-- `incident_severidade_rank` NAO e removida de proposito: e um helper puro,
-- ninguem depende de ela sumir, e derruba-la quebraria qualquer coisa que
-- tenha passado a usa-la depois.

create or replace function public.incident_severidade_efetiva(
    p_component   text,
    p_ai_severity text
)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
    -- A IA vence o catalogo (ela viu o erro); o catalogo vence o silencio.
    select coalesce(
        nullif(p_ai_severity, ''),
        (select c.severidade_padrao from public.incident_component_info(p_component) c),
        'media'
    );
$$;

revoke all on function public.incident_severidade_efetiva(text, text)
    from public, anon, authenticated;
grant execute on function public.incident_severidade_efetiva(text, text) to service_role;


create or replace function public.incident_finish_analysis(
    p_incident_id uuid,
    p_result      jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_sev text := nullif(trim(coalesce(p_result ->> 'severidade', '')), '');
begin
    if v_sev is not null and v_sev not in ('critica','alta','media','baixa') then
        v_sev := null;
    end if;

    update public.incidents
       set ai_summary          = nullif(trim(coalesce(p_result ->> 'resumo', '')), ''),
           ai_probable_cause   = nullif(trim(coalesce(p_result ->> 'causa', '')), ''),
           ai_origin           = nullif(trim(coalesce(p_result ->> 'origem', '')), ''),
           -- catalogo vence a IA: quando ja havia severidade, ela fica.
           ai_severity         = coalesce(ai_severity, v_sev),
           ai_impact           = nullif(trim(coalesce(p_result ->> 'impacto', '')), ''),
           ai_fix_n8n          = nullif(trim(coalesce(p_result ->> 'acao_n8n', '')), ''),
           ai_fix_system       = nullif(trim(coalesce(p_result ->> 'acao_sistema', '')), ''),
           ai_confidence       = case when jsonb_typeof(p_result -> 'confianca') = 'number'
                                      then least(1, greatest(0, (p_result ->> 'confianca')::numeric)) end,
           ai_model            = nullif(trim(coalesce(p_result ->> 'modelo', '')), ''),
           ai_tokens           = case when jsonb_typeof(p_result -> 'tokens') = 'number'
                                      then greatest(0, (p_result ->> 'tokens')::integer) end,
           ai_cost_usd         = case when jsonb_typeof(p_result -> 'custo_usd') = 'number'
                                      then greatest(0, (p_result ->> 'custo_usd')::numeric) end,
           analyzed_at         = now(),
           analysis_claimed_at = null,
           updated_at          = now()
     where id = p_incident_id;
end;
$$;

revoke all on function public.incident_finish_analysis(uuid, jsonb)
    from public, anon, authenticated;
grant execute on function public.incident_finish_analysis(uuid, jsonb) to service_role;
