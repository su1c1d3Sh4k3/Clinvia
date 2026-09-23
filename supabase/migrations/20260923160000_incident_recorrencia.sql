-- Regra de recorrencia: um erro identico passa pela IA UMA vez.
--
-- O PROBLEMA MEDIDO: os 182 resumos que falharam em 21-22/09 sao UM erro, com
-- uma causa e uma acao. No modelo anterior cada evento era candidato a analise e
-- a aviso — 182 chamadas de IA e 182 mensagens no WhatsApp para dizer a mesma
-- frase. O agrupamento por fingerprint ja existia; faltava o portao que decide
-- QUANDO analisar e QUANDO avisar.
--
-- ONDE O CONTROLE MORA: no banco, como o fingerprint. Rajada do mesmo erro cai
-- toda na MESMA linha de `incidents` (indice unico parcial por fingerprint), e a
-- reserva para analise/aviso e feita no proprio UPDATE que devolve a linha
-- (`for update skip locked`). Nao existe janela entre "vi que precisa" e "marquei
-- que peguei" — e por isso duas execucoes simultaneas nao produzem duas analises.
--
-- O QUE NAO MUDA: `incident_record` continua incrementando event_count e
-- last_seen em TODO evento. Suprimir analise e aviso nunca suprime a contagem —
-- e ela que sustenta o "continua acontecendo: N ocorrencias desde HH:MM".
--
-- alert_max_per_hour: evento suprimido nao chega ao notificador, entao nao gera
-- linha em incident_notifications e nao consome a cota da hora. A cota so e
-- gasta por mensagem realmente tentada.

-- ============================================================
-- 1. Janelas configuraveis
-- ============================================================

alter table public.llm_platform_settings
    add column if not exists incident_analyze_cooldown_min integer not null default 60,
    add column if not exists incident_notify_cooldown_min  integer not null default 60;

comment on column public.llm_platform_settings.incident_analyze_cooldown_min is
  'Minutos em que a analise de um fingerprint e REAPROVEITADA por um incidente novo do mesmo fingerprint, em vez de gastar tokens. Nao vale quando o incidente anterior foi resolvido por uma pessoa: resolveu e voltou e noticia, e analisado de novo.';
comment on column public.llm_platform_settings.incident_notify_cooldown_min is
  'Minutos de silencio apos um aviso. Dentro da janela o erro so conta; passada a janela sai UMA mensagem de recorrencia, sem nova analise.';

-- ============================================================
-- 2. Estado da analise no incidente
-- ============================================================

alter table public.incidents
    add column if not exists analysis_claimed_at   timestamptz,
    add column if not exists analysis_reused_from  uuid references public.incidents(id) on delete set null;

comment on column public.incidents.analysis_claimed_at is
  'Reserva da analise. Preenchida no mesmo UPDATE que devolve a linha ao worker, para que rajada nao gere duas analises. Reserva com mais de 15 min e considerada abandonada.';
comment on column public.incidents.analysis_reused_from is
  'Quando preenchida, a analise foi COPIADA do incidente apontado (mesmo fingerprint, dentro da janela) e nao custou token.';

-- Fila de analise: so o que ainda nao tem analise e nao esta reservado.
create index if not exists incidents_analise_pendente_idx
  on public.incidents (first_seen)
  where analyzed_at is null and status <> 'resolved';

-- Reaproveitamento: buscar a analise mais recente do mesmo fingerprint.
create index if not exists incidents_fingerprint_analisado_idx
  on public.incidents (fingerprint, analyzed_at desc)
  where analyzed_at is not null;

-- ============================================================
-- 3. Fila de analise — reaproveita se puder, reserva se precisar
-- ============================================================

create or replace function public.incident_claim_for_analysis(p_limit integer default 5)
returns table (
    id uuid,
    fingerprint text,
    source text,
    component text,
    event_count integer,
    first_seen timestamptz,
    last_seen timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_ligado   boolean;
    v_cooldown integer;
begin
    select coalesce(s.alert_analyze_enabled, true),
           greatest(0, coalesce(s.incident_analyze_cooldown_min, 60))
      into v_ligado, v_cooldown
      from public.llm_platform_settings s limit 1;

    if v_ligado is false then
        return;
    end if;

    -- PASSADA 1 — reaproveitamento, custo zero.
    --
    -- So existe UMA linha nao-resolvida por fingerprint (indice unico parcial),
    -- entao a unica fonte possivel de analise pronta e um incidente RESOLVIDO do
    -- mesmo fingerprint — ou seja, este bloco trata exatamente o caso
    -- "resolveu e voltou". E ai a regra do user manda distinguir quem resolveu:
    --
    --   * resolvido POR ELE (resolved_by preenchido) e voltou = noticia. O contexto
    --     mudou, ele achava que estava corrigido; a IA analisa de novo.
    --   * resolvido sem dono (automacao/limpeza) e voltou dentro da janela = e o
    --     mesmo erro de sempre. Copia a analise e nao gasta token.
    with pendentes as (
        select i.id, i.fingerprint, i.ai_severity
          from public.incidents i
         where i.analyzed_at is null
           and i.status <> 'resolved'
    ),
    fonte as (
        select distinct on (p.id)
               p.id          as alvo_id,
               p.ai_severity as sev_alvo,
               f.id          as fonte_id,
               f.ai_summary, f.ai_probable_cause, f.ai_origin, f.ai_severity as sev_fonte,
               f.ai_impact, f.ai_fix_n8n, f.ai_fix_system, f.ai_confidence, f.ai_model
          from pendentes p
          join public.incidents f
            on f.fingerprint = p.fingerprint
           and f.id <> p.id
           and f.analyzed_at is not null
           and f.resolved_by is null
           and f.analyzed_at >= now() - make_interval(mins => v_cooldown)
         order by p.id, f.analyzed_at desc
    )
    update public.incidents alvo
       set ai_summary           = fonte.ai_summary,
           ai_probable_cause    = fonte.ai_probable_cause,
           ai_origin            = fonte.ai_origin,
           ai_severity          = coalesce(fonte.sev_alvo, fonte.sev_fonte),
           ai_impact            = fonte.ai_impact,
           ai_fix_n8n           = fonte.ai_fix_n8n,
           ai_fix_system        = fonte.ai_fix_system,
           ai_confidence        = fonte.ai_confidence,
           ai_model             = fonte.ai_model,
           analyzed_at          = now(),
           analysis_reused_from = fonte.fonte_id,
           updated_at           = now()
      from fonte
     where alvo.id = fonte.alvo_id;

    -- PASSADA 2 — o que sobrou precisa mesmo da IA.
    -- A reserva acontece DENTRO deste update: nao ha instante em que a linha
    -- esteja "escolhida mas nao marcada".
    return query
    with alvo as (
        select i.id
          from public.incidents i
         where i.analyzed_at is null
           and i.status <> 'resolved'
           and (i.analysis_claimed_at is null
                or i.analysis_claimed_at < now() - interval '15 minutes')
         order by
            case i.ai_severity when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end,
            i.first_seen
         limit greatest(1, coalesce(p_limit, 5))
         for update skip locked
    )
    update public.incidents i
       set analysis_claimed_at = now(),
           updated_at = now()
      from alvo a
     where i.id = a.id
    returning i.id, i.fingerprint, i.source, i.component, i.event_count, i.first_seen, i.last_seen;
end;
$$;

comment on function public.incident_claim_for_analysis(integer) is
  'Fila de analise. Primeiro copia analise ja existente do mesmo fingerprint (custo zero); devolve so o que precisa de IA de verdade, ja reservado contra rajada.';

-- ============================================================
-- 4. Gravar o resultado da analise
-- ============================================================

create or replace function public.incident_finish_analysis(
    p_incident_id uuid,
    p_result jsonb
)
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
           analyzed_at         = now(),
           analysis_claimed_at = null,
           updated_at          = now()
     where id = p_incident_id;
end;
$$;

comment on function public.incident_finish_analysis(uuid, jsonb) is
  'Grava o resultado da analise e libera a reserva. Nao sobrescreve severidade vinda do catalogo.';

-- ============================================================
-- 5. Fila de aviso — primeira vez, depois so recorrencia
-- ============================================================
--
-- Os contadores sobem NO MOMENTO DA RESERVA, nao depois do envio. E deliberado:
-- o UPDATE que escolhe a linha e o que marca "ja avisei", entao duas execucoes
-- concorrentes nao conseguem avisar o mesmo incidente duas vezes. O preco e que
-- um envio que falhe nao e retentado antes da proxima janela — o painel mostra
-- isso em `envios_falhos`, e alerta repetido incomoda mais do que alerta perdido
-- que ja esta visivel na tela.

create or replace function public.incident_claim_for_notification(p_limit integer default 10)
returns table (
    id uuid,
    source text,
    component text,
    ai_severity text,
    ai_summary text,
    ai_probable_cause text,
    ai_fix_system text,
    ai_fix_n8n text,
    event_count integer,
    first_seen timestamptz,
    last_seen timestamptz,
    kind text,
    ocorrencias_novas integer,
    desde timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_ligado   boolean;
    v_cooldown integer;
begin
    select coalesce(s.alert_notify_enabled, true),
           greatest(0, coalesce(s.incident_notify_cooldown_min, 60))
      into v_ligado, v_cooldown
      from public.llm_platform_settings s limit 1;

    if v_ligado is false then
        return;
    end if;

    return query
    with alvo as (
        select i.id,
               case when i.notified_count = 0 then 'individual' else 'recorrencia' end as kind,
               (i.event_count - i.notified_at_event_count)                             as novas,
               i.last_notified_at                                                      as desde
          from public.incidents i
         where i.status <> 'resolved'
           -- sem analise ainda nao ha o que contar para a pessoa
           and i.analyzed_at is not null
           and (
                i.notified_count = 0
                or (
                    -- so volta a falar se continuou acontecendo DEPOIS do ultimo aviso
                    i.event_count > i.notified_at_event_count
                    and i.last_notified_at < now() - make_interval(mins => v_cooldown)
                )
           )
         order by
            case i.ai_severity when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end,
            i.last_seen desc
         limit greatest(1, coalesce(p_limit, 10))
         for update skip locked
    )
    update public.incidents i
       set last_notified_at        = now(),
           notified_count          = i.notified_count + 1,
           notified_at_event_count = i.event_count,
           updated_at              = now()
      from alvo a
     where i.id = a.id
    returning i.id, i.source, i.component, i.ai_severity, i.ai_summary, i.ai_probable_cause,
              i.ai_fix_system, i.ai_fix_n8n, i.event_count, i.first_seen, i.last_seen,
              a.kind, a.novas, a.desde;
end;
$$;

comment on function public.incident_claim_for_notification(integer) is
  'Fila de aviso. Primeira vez = individual; depois so uma mensagem de recorrencia por janela, e apenas se o erro continuou. Reserva e contagem no mesmo UPDATE.';

-- ============================================================
-- 6. Reabrir um incidente resolvido volta a permitir analise
-- ============================================================
--
-- Regra do user: incidente reaberto pode ser analisado de novo, porque o
-- contexto mudou. Limpar analyzed_at da propria linha e o que faz a passada 1
-- nao reaproveitar a analise velha dela mesma (a busca exclui `f.id <> alvo.id`).

create or replace function public.admin_set_incident_status(
    p_incident_id uuid,
    p_status text,
    p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_antes  text;
    v_row    public.incidents;
    v_reabre boolean;
begin
    if not public.admin_can('alertas', 'edit') then
        raise exception 'Sem permissão para alterar incidentes' using errcode = '42501';
    end if;

    if p_status not in ('open', 'acknowledged', 'resolved') then
        raise exception 'Estado inválido: %', p_status using errcode = '22023';
    end if;

    select status into v_antes from public.incidents where id = p_incident_id;
    if v_antes is null then
        raise exception 'Incidente não encontrado' using errcode = 'P0002';
    end if;

    v_reabre := (v_antes = 'resolved' and p_status <> 'resolved');

    update public.incidents
       set status      = p_status,
           notes       = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
           resolved_at = case when p_status = 'resolved' then now() else null end,
           resolved_by = case when p_status = 'resolved' then auth.uid() else null end,
           -- reabriu: analise e aviso voltam a valer do zero
           analyzed_at             = case when v_reabre then null else analyzed_at end,
           analysis_claimed_at     = case when v_reabre then null else analysis_claimed_at end,
           analysis_reused_from    = case when v_reabre then null else analysis_reused_from end,
           notified_count          = case when v_reabre then 0 else notified_count end,
           notified_at_event_count = case when v_reabre then 0 else notified_at_event_count end,
           last_notified_at        = case when v_reabre then null else last_notified_at end,
           updated_at  = now()
     where id = p_incident_id
    returning * into v_row;

    return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'reaberto', v_reabre);
end;
$$;

-- ============================================================
-- 7. Painel: recorrencia visivel sem abrir o incidente
-- ============================================================

-- muda a lista de colunas devolvidas: `create or replace` nao consegue trocar
-- o tipo de retorno, o drop e obrigatorio.
drop function if exists public.admin_list_incidents(text, text, text, integer);

create function public.admin_list_incidents(
    p_status text default 'open',
    p_severity text default null,
    p_search text default null,
    p_limit integer default 100
)
returns table (
    id uuid,
    fingerprint text,
    source text,
    component text,
    status text,
    first_seen timestamptz,
    last_seen timestamptz,
    event_count integer,
    conta text,
    contas_afetadas integer,
    ai_summary text,
    ai_probable_cause text,
    ai_origin text,
    ai_severity text,
    ai_impact text,
    ai_fix_n8n text,
    ai_fix_system text,
    ai_confidence numeric,
    analyzed_at timestamptz,
    analise_reaproveitada boolean,
    last_notified_at timestamptz,
    notified_count integer,
    ocorrencias_desde_ultimo_aviso integer,
    envios_falhos integer,
    resolved_at timestamptz,
    notes text
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
    if not public.admin_can('alertas', 'view') then
        raise exception 'Acesso negado ao painel de alertas' using errcode = '42501';
    end if;

    return query
    select
        i.id,
        i.fingerprint,
        i.source,
        i.component,
        i.status,
        i.first_seen,
        i.last_seen,
        i.event_count,
        coalesce(p.company_name, p.full_name, 'nenhuma identificada') as conta,
        coalesce(array_length(i.affected_tenants, 1), 0) as contas_afetadas,
        i.ai_summary,
        i.ai_probable_cause,
        i.ai_origin,
        i.ai_severity,
        i.ai_impact,
        i.ai_fix_n8n,
        i.ai_fix_system,
        i.ai_confidence,
        i.analyzed_at,
        (i.analysis_reused_from is not null) as analise_reaproveitada,
        i.last_notified_at,
        i.notified_count,
        greatest(0, i.event_count - i.notified_at_event_count) as ocorrencias_desde_ultimo_aviso,
        (
            select count(*)::integer
            from public.incident_notifications n
            where n.incident_id = i.id and n.status = 'failed'
        ) as envios_falhos,
        i.resolved_at,
        i.notes
    from public.incidents i
    left join public.profiles p on p.id = i.owner_id
    where (p_status is null or p_status = 'todos' or i.status = p_status)
      and (p_severity is null or p_severity = 'todas' or i.ai_severity = p_severity)
      and (
        p_search is null or p_search = ''
        or i.component ilike '%' || p_search || '%'
        or coalesce(i.ai_summary, '') ilike '%' || p_search || '%'
      )
    order by
        case i.status when 'open' then 0 when 'acknowledged' then 1 else 2 end,
        case i.ai_severity when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end,
        i.last_seen desc
    limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

-- Corrige coluna inexistente: incident_events tem `error_message`, nao `message`
-- — o detalhe do painel erraria 42703 na primeira expansao de incidente.
create or replace function public.admin_incident_detail(p_incident_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
    v_eventos jsonb;
    v_envios  jsonb;
begin
    if not public.admin_can('alertas', 'view') then
        raise exception 'Acesso negado ao painel de alertas' using errcode = '42501';
    end if;

    select coalesce(jsonb_agg(e order by e.received_at desc), '[]'::jsonb)
    into v_eventos
    from (
        select received_at, source, component, error_name, error_message, http_code, started_at
        from public.incident_events
        where incident_id = p_incident_id
        order by received_at desc
        limit 50
    ) e;

    select coalesce(jsonb_agg(n order by n.sent_at desc), '[]'::jsonb)
    into v_envios
    from (
        select n.sent_at, n.kind, n.status, n.template_name, n.error_code,
               n.error_message, r.nome as destinatario
        from public.incident_notifications n
        join public.alert_recipients r on r.id = n.recipient_id
        where n.incident_id = p_incident_id
        order by n.sent_at desc
        limit 50
    ) n;

    return jsonb_build_object('eventos', v_eventos, 'envios', v_envios);
end;
$$;

-- ============================================================
-- 8. Chaves novas gravaveis pelo painel
-- ============================================================

create or replace function public.admin_set_alert_setting(
    p_key text,
    p_value text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    if not public.admin_can('alertas', 'edit') then
        raise exception 'Sem permissão para alterar os alertas' using errcode = '42501';
    end if;

    -- Lista fechada de proposito: sem ela, `p_key` viraria nome de coluna
    -- dinamico e qualquer coluna de llm_platform_settings seria gravavel daqui.
    if p_key = 'alert_notify_enabled' then
        update public.llm_platform_settings set alert_notify_enabled = (p_value = 'true');
    elsif p_key = 'alert_summary_enabled' then
        update public.llm_platform_settings set alert_summary_enabled = (p_value = 'true');
    elsif p_key = 'alert_analyze_enabled' then
        update public.llm_platform_settings set alert_analyze_enabled = (p_value = 'true');
    elsif p_key = 'incident_db_scan_enabled' then
        update public.llm_platform_settings set incident_db_scan_enabled = (p_value = 'true');
    elsif p_key = 'alert_max_per_hour' then
        update public.llm_platform_settings
           set alert_max_per_hour = greatest(1, least(100, p_value::integer));
    elsif p_key = 'incident_analyze_cooldown_min' then
        update public.llm_platform_settings
           set incident_analyze_cooldown_min = greatest(0, least(10080, p_value::integer));
    elsif p_key = 'incident_notify_cooldown_min' then
        update public.llm_platform_settings
           set incident_notify_cooldown_min = greatest(0, least(10080, p_value::integer));
    else
        raise exception 'Chave desconhecida: %', p_key using errcode = '22023';
    end if;

    return jsonb_build_object('ok', true, 'key', p_key);
end;
$$;

create or replace function public.admin_alert_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
    v_cfg  jsonb;
    v_dest jsonb;
begin
    if not public.admin_can('alertas', 'view') then
        raise exception 'Acesso negado ao painel de alertas' using errcode = '42501';
    end if;

    select jsonb_build_object(
        'alert_notify_enabled',  s.alert_notify_enabled,
        'alert_summary_enabled', s.alert_summary_enabled,
        'alert_max_per_hour',    s.alert_max_per_hour,
        'alert_analyze_enabled', s.alert_analyze_enabled,
        'alert_analyze_model',   s.alert_analyze_model,
        'incident_db_scan_enabled',      s.incident_db_scan_enabled,
        'incident_analyze_cooldown_min', s.incident_analyze_cooldown_min,
        'incident_notify_cooldown_min',  s.incident_notify_cooldown_min
    )
    into v_cfg
    from public.llm_platform_settings s
    limit 1;

    -- telefone mascarado: o painel prova QUEM recebe, nao precisa do numero inteiro
    select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'nome', r.nome,
        'telefone', '****' || right(r.telefone, 4),
        'min_severity', r.min_severity,
        'is_active', r.is_active,
        'janela', to_char(r.window_start, 'HH24:MI') || '–' || to_char(r.window_end, 'HH24:MI'),
        'instancia', i.instance_name,
        'ultimo_envio', (
            select max(n.sent_at)
            from public.incident_notifications n
            where n.recipient_id = r.id and n.status = 'sent'
        )
    ) order by r.nome), '[]'::jsonb)
    into v_dest
    from public.alert_recipients r
    left join public.instances i on i.id = r.instance_id;

    return jsonb_build_object('config', coalesce(v_cfg, '{}'::jsonb), 'destinatarios', v_dest);
end;
$$;

-- ============================================================
-- 9. Privilegios
-- ============================================================
-- `create function` concede EXECUTE a PUBLIC e `revoke from anon` NAO tira esse
-- grant — os dois comandos, nesta ordem, sao obrigatorios.

revoke all on function public.incident_claim_for_analysis(integer) from public, anon, authenticated;
revoke all on function public.incident_finish_analysis(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.incident_claim_for_notification(integer) from public, anon, authenticated;
grant execute on function public.incident_claim_for_analysis(integer) to service_role;
grant execute on function public.incident_finish_analysis(uuid, jsonb) to service_role;
grant execute on function public.incident_claim_for_notification(integer) to service_role;

revoke all on function public.admin_set_incident_status(uuid, text, text) from public, anon;
revoke all on function public.admin_list_incidents(text, text, text, integer) from public, anon;
revoke all on function public.admin_incident_detail(uuid) from public, anon;
revoke all on function public.admin_set_alert_setting(text, text) from public, anon;
revoke all on function public.admin_alert_settings() from public, anon;
grant execute on function public.admin_set_incident_status(uuid, text, text) to authenticated;
grant execute on function public.admin_list_incidents(text, text, text, integer) to authenticated;
grant execute on function public.admin_incident_detail(uuid) to authenticated;
grant execute on function public.admin_set_alert_setting(text, text) to authenticated;
grant execute on function public.admin_alert_settings() to authenticated;
