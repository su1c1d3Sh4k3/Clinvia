-- Painel de Alertas do Super Admin (/admin?tab=alertas) — RPCs de leitura e acao.
--
-- POR QUE RPC E NAO LEITURA DIRETA DA TABELA:
-- as 5 tabelas de monitoramento nasceram SEM privilegio nenhum para anon e
-- authenticated (migration 20260923100000, secao 9). O front nao consegue — e nao
-- deve conseguir — dar SELECT nelas. Toda leitura do painel passa por estas
-- funcoes SECURITY DEFINER, que checam public.admin_can('alertas', ...) no corpo.
--
-- Disciplina obrigatoria (CLAUDE.md): `create function` concede EXECUTE a PUBLIC e
-- `revoke ... from anon` NAO tira esse grant. Toda funcao aqui termina em
-- `revoke all ... from public, anon` ANTES do `grant execute ... to authenticated`.
--
-- O QUE ESTAS FUNCOES NUNCA DEVOLVEM: token, chave, telefone de paciente ou custo
-- real de provedor. O texto ja chega sanitizado por sanitize_incident_text no
-- momento da ingestao; aqui nao ha nenhum campo de segredo no select.

-- ============================================================
-- 1. Lista de incidentes
-- ============================================================

create or replace function public.admin_list_incidents(
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
    last_notified_at timestamptz,
    notified_count integer,
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
        i.last_notified_at,
        i.notified_count,
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
    -- aberto primeiro, depois o mais grave, depois o mais recente
    order by
        case i.status when 'open' then 0 when 'acknowledged' then 1 else 2 end,
        case i.ai_severity when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end,
        i.last_seen desc
    limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.admin_list_incidents(text, text, text, integer) from public, anon;
grant execute on function public.admin_list_incidents(text, text, text, integer) to authenticated;

-- ============================================================
-- 2. Contadores do topo da pagina
-- ============================================================

create or replace function public.admin_incident_counters()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
    v jsonb;
begin
    if not public.admin_can('alertas', 'view') then
        raise exception 'Acesso negado ao painel de alertas' using errcode = '42501';
    end if;

    select jsonb_build_object(
        'abertos',        count(*) filter (where status = 'open'),
        'criticos',       count(*) filter (where status = 'open' and ai_severity = 'critica'),
        'altos',          count(*) filter (where status = 'open' and ai_severity = 'alta'),
        'sem_analise',    count(*) filter (where status = 'open' and analyzed_at is null),
        'resolvidos_24h', count(*) filter (where status = 'resolved' and resolved_at >= now() - interval '24 hours'),
        'eventos_24h',    coalesce(sum(event_count) filter (where last_seen >= now() - interval '24 hours'), 0)
    )
    into v
    from public.incidents;

    -- Envio falhando e o alerta do alerta: se isto sobe, o canal esta mudo.
    return v || jsonb_build_object(
        'envios_falhos_24h', (
            select count(*)
            from public.incident_notifications
            where status = 'failed' and sent_at >= now() - interval '24 hours'
        ),
        'envios_ok_1h', (
            select count(*)
            from public.incident_notifications
            where status = 'sent' and sent_at >= now() - interval '1 hour'
        )
    );
end;
$$;

revoke all on function public.admin_incident_counters() from public, anon;
grant execute on function public.admin_incident_counters() to authenticated;

-- ============================================================
-- 3. Detalhe: eventos crus + historico de envio
-- ============================================================

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
        select received_at, source, component, error_name, message, started_at
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

revoke all on function public.admin_incident_detail(uuid) from public, anon;
grant execute on function public.admin_incident_detail(uuid) to authenticated;

-- ============================================================
-- 4. Mudar o estado de um incidente
-- ============================================================

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
    v_row public.incidents;
begin
    if not public.admin_can('alertas', 'edit') then
        raise exception 'Sem permissão para alterar incidentes' using errcode = '42501';
    end if;

    if p_status not in ('open', 'acknowledged', 'resolved') then
        raise exception 'Estado inválido: %', p_status using errcode = '22023';
    end if;

    update public.incidents
       set status      = p_status,
           notes       = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes),
           resolved_at = case when p_status = 'resolved' then now() else null end,
           resolved_by = case when p_status = 'resolved' then auth.uid() else null end,
           updated_at  = now()
     where id = p_incident_id
    returning * into v_row;

    if v_row.id is null then
        raise exception 'Incidente não encontrado' using errcode = 'P0002';
    end if;

    return jsonb_build_object('id', v_row.id, 'status', v_row.status);
end;
$$;

revoke all on function public.admin_set_incident_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_incident_status(uuid, text, text) to authenticated;

-- ============================================================
-- 5. Chaves de desligar + destinatarios (leitura)
-- ============================================================

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
        'alert_analyze_model',   s.alert_analyze_model
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

revoke all on function public.admin_alert_settings() from public, anon;
grant execute on function public.admin_alert_settings() to authenticated;

-- ============================================================
-- 6. Chaves de desligar (escrita)
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
    elsif p_key = 'alert_max_per_hour' then
        update public.llm_platform_settings
           set alert_max_per_hour = greatest(1, least(100, p_value::integer));
    else
        raise exception 'Chave desconhecida: %', p_key using errcode = '22023';
    end if;

    return jsonb_build_object('ok', true, 'key', p_key);
end;
$$;

revoke all on function public.admin_set_alert_setting(text, text) from public, anon;
grant execute on function public.admin_set_alert_setting(text, text) to authenticated;
