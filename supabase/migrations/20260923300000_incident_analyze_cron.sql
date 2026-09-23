-- Liga o analisador: cron + medicao do custo da propria IA.
--
-- CONTEXTO: `incident-analyze` e a peca que a §4 do plano descreve desde o
-- inicio e que nunca foi construida. Todo o resto ja existia — as colunas `ai_*`
-- em `incidents`, `incident_claim_for_analysis`, `incident_finish_analysis`,
-- `incident_catalog`. Faltava a edge function e faltava alguem acorda-la. O
-- efeito pratico de faltar era o alerta sair dizendo "Causa provavel: analise
-- ainda nao feita", que e um lembrete, nao um alerta.
--
-- ESTA MIGRATION FAZ TRES COISAS:
--
-- 1. MEDE O CUSTO DA IA DE MONITORAMENTO.
--    `token_usage_log.owner_id` e NOT NULL e todo consumo la dentro pertence a
--    um tenant e aparece no relatorio dele. O custo desta analise e da
--    plataforma, nao de cliente nenhum: gravar la falsificaria a conta de
--    alguem. Entao a medicao vive no proprio incidente — duas colunas, uma
--    linha por analise, somavel por periodo. Sem tabela nova e sem rateio
--    errado. (Mesmo motivo pelo qual `support-ai-chat` tambem nao escreve em
--    token_usage_log.)
--
-- 2. `incident_finish_analysis` passa a persistir tokens e custo. A assinatura
--    NAO muda (p_incident_id, p_result jsonb): entram duas chaves novas no
--    jsonb, e quem nao mandar elas continua funcionando igual.
--
-- 3. AGENDA a varredura de 2 em 2 minutos. O invocador sai de fabrica ja
--    correto nos dois pontos que custaram semanas de alerta mudo:
--      - le `SUPABASE_EDGE_SECRET_KEY` do vault (o vault ainda guarda o JWT
--        LEGADO em SUPABASE_SERVICE_ROLE_KEY, e a function compara com o
--        proprio env, que ja e `sb_secret_` — era esse o 401 invisivel);
--      - dispara por `clinvia_http_post`, entao a falha aparece nomeada em
--        `cron_http_calls` em vez de virar 'http-desconhecido' quando
--        `net._http_response` for podado aos 30 minutos.
--
-- CADENCIA: 2 minutos. O despachante de alerta espera ate 2 minutos pela
-- analise antes de mandar o alerta mesmo assim; com a varredura nesse mesmo
-- ritmo, o caso comum e o alerta sair ja analisado. O gate de contagem faz a
-- chamada HTTP so acontecer quando ha fila, entao o custo de rodar de 2 em 2
-- minutos e uma consulta barata, nao uma invocacao.
--
-- NAO MEXE EM: quem escreve incidente, quem despacha alerta, nem no conteudo da
-- mensagem. Se o analisador falhar, o despachante segue mandando o alerta com o
-- erro bruto — degradado, nunca mudo.

-- ── 1. medicao do custo ──────────────────────────────────────────────────────

alter table public.incidents
    add column if not exists ai_tokens   integer,
    add column if not exists ai_cost_usd numeric(12, 6);

comment on column public.incidents.ai_tokens is
    'Tokens gastos pela IA de monitoramento para analisar ESTE incidente. Analise reaproveitada de outro incidente fica nula: nao houve chamada.';
comment on column public.incidents.ai_cost_usd is
    'Custo em USD da analise deste incidente, preco de provedor de llm_model_prices, SEM margem. E custo da plataforma, nao de tenant — por isso nao vai para token_usage_log.';

-- ── 2. gravacao ──────────────────────────────────────────────────────────────

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
           -- catalogo vence a IA: quando ja havia severidade, ela fica.
           ai_severity         = coalesce(ai_severity, v_sev),
           ai_impact           = nullif(trim(coalesce(p_result ->> 'impacto', '')), ''),
           ai_fix_n8n          = nullif(trim(coalesce(p_result ->> 'acao_n8n', '')), ''),
           ai_fix_system       = nullif(trim(coalesce(p_result ->> 'acao_sistema', '')), ''),
           ai_confidence       = case when jsonb_typeof(p_result -> 'confianca') = 'number'
                                      then least(1, greatest(0, (p_result ->> 'confianca')::numeric)) end,
           ai_model            = nullif(trim(coalesce(p_result ->> 'modelo', '')), ''),
           -- novas: medicao do custo da propria IA de monitoramento.
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

revoke all on function public.incident_finish_analysis(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.incident_finish_analysis(uuid, jsonb) to service_role;

-- ── 3. invocador + cron ──────────────────────────────────────────────────────

-- Quantos incidentes esperam analise AGORA. Serve de portao: sem fila, nao ha
-- chamada HTTP. Espelha a condicao da passada 2 de incident_claim_for_analysis,
-- inclusive a reserva de 15 minutos — contar diferente do que o claim pega
-- produziria chamada que nao analisa nada.
create or replace function public.incident_analyze_pending_count()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
    select count(*)::integer
      from public.incidents i
     where i.analyzed_at is null
       and i.status <> 'resolved'
       and (i.analysis_claimed_at is null
            or i.analysis_claimed_at < now() - interval '15 minutes');
$$;

revoke all on function public.incident_analyze_pending_count() from public, anon, authenticated;
grant execute on function public.incident_analyze_pending_count() to service_role;

create or replace function public.invoke_incident_analyze()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_url    text;
    v_jwt    text;
    v_edge   text;
    v_ligado boolean;
begin
    select coalesce(s.alert_analyze_enabled, true) into v_ligado
      from public.llm_platform_settings s limit 1;
    if v_ligado is false then
        return;
    end if;

    if public.incident_analyze_pending_count() = 0 then
        return;
    end if;

    select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'SUPABASE_URL' limit 1;
    select decrypted_secret into v_jwt  from vault.decrypted_secrets where name = 'SUPABASE_SERVICE_ROLE_KEY' limit 1;
    select decrypted_secret into v_edge from vault.decrypted_secrets where name = 'SUPABASE_EDGE_SECRET_KEY' limit 1;

    perform public.clinvia_http_post(
        p_alvo    := 'incident-analyze',
        p_origem  := 'cron:incident-analyze-scan',
        p_url     := v_url || '/functions/v1/incident-analyze',
        p_headers := jsonb_build_object(
            'Content-Type',  'application/json',
            'Authorization', 'Bearer ' || coalesce(v_edge, v_jwt),
            'x-service-key', coalesce(v_edge, v_jwt)
        ),
        p_body    := jsonb_build_object('action', 'scan', 'limit', 5)
    );
exception when others then
    -- nao derruba o cron: a fila continua e a proxima rodada tenta de novo.
    raise warning 'invoke_incident_analyze: %', sqlerrm;
end;
$$;

revoke all on function public.invoke_incident_analyze() from public, anon, authenticated;
grant execute on function public.invoke_incident_analyze() to service_role;

do $$
begin
    perform cron.unschedule('incident-analyze-scan');
exception when others then
    null;
end;
$$;

select cron.schedule('incident-analyze-scan', '*/2 * * * *', $$select public.invoke_incident_analyze();$$);
