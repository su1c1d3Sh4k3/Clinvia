-- Alerta de saldo da organizacao OpenAI.
--
-- POR QUE O SALDO E DIGITADO, E NAO LIDO:
-- a Admin API da OpenAI expoe uso e custo por projeto, mas NAO expoe saldo de
-- credito nem o estado da recarga automatica. Nao existe endpoint. Entao o saldo
-- so pode ser uma ESTIMATIVA ancorada num numero que o Super Admin informa depois
-- de cada recarga. O campo e editavel no painel exatamente por isso: sem deploy.
--
-- E POR QUE A DATA DA ANCORA APARECE NA TELA:
-- estimativa envelhece. Saldo informado ha 20 dias, projetado por uma media de
-- gasto, e chute com cara de numero. Passando de `openai_credit_stale_days` o
-- painel para de projetar e diz "ancora vencida" — melhor admitir que nao sabe.
--
-- A DIVIDA DO provider_cost_usd (registrada, nao resolvida):
-- `token_usage_log.provider_cost_usd` vem 0.000 em TODAS as linhas de
-- source='system' e parcial em n8n, porque foi preenchida so depois de ad8f002.
-- Somar essa coluna dava US$ 10,01 em 30 dias contra uma fatura real de ~US$ 136.
-- A base usada aqui e `cost_usd`: n8n US$ 155,55 + sistema US$ 15,93 em 30 dias
-- = US$ 171,48, ou ~US$ 5,72/dia — coerente com a fatura. O erro que isso
-- introduz e a margem embutida em cost_usd (o preco cobrado, nao o de custo),
-- ou seja, a queima estimada e CONSERVADORA: superestima o gasto e antecipa o
-- alerta. Para o proposito "avise antes de acabar", errar para cima e o lado
-- certo de errar. Corrigir provider_cost_usd continua na fila.

-- ============================================================
-- 1. Ancora do saldo + limiares
-- ============================================================

alter table public.llm_platform_settings
    add column if not exists openai_credit_usd            numeric(12,2),
    add column if not exists openai_credit_recorded_at    timestamptz,
    add column if not exists openai_auto_recharge_enabled boolean,
    add column if not exists openai_credit_stale_days     integer not null default 7,
    add column if not exists openai_balance_warn_usd      numeric(12,2) not null default 50.00,
    add column if not exists openai_balance_critical_usd  numeric(12,2) not null default 20.00,
    add column if not exists openai_balance_alert_enabled boolean not null default true;

comment on column public.llm_platform_settings.openai_credit_usd is
  'Saldo de credito da organizacao OpenAI, em USD, informado a mao pelo Super Admin. A OpenAI nao expoe isso por API.';
comment on column public.llm_platform_settings.openai_credit_recorded_at is
  'Quando o saldo acima foi informado. E a ancora da projecao: o gasto contado a partir deste instante e subtraido dele.';
comment on column public.llm_platform_settings.openai_auto_recharge_enabled is
  'Estado da recarga automatica na OpenAI, informado a mao. Desligada + saldo baixo = critico na hora; ligada = o mesmo saldo vira apenas aviso.';
comment on column public.llm_platform_settings.openai_credit_stale_days is
  'Depois de tantos dias sem atualizar o saldo, o painel para de projetar e mostra "ancora vencida" em vez de fingir precisao.';
comment on column public.llm_platform_settings.openai_balance_warn_usd is
  'Saldo estimado abaixo deste valor gera incidente de severidade ALTA. Aprovado em 23/09/2026: US$ 50.';
comment on column public.llm_platform_settings.openai_balance_critical_usd is
  'Saldo estimado abaixo deste valor gera incidente CRITICO. Aprovado em 23/09/2026: US$ 20.';

-- ============================================================
-- 2. Estimativa do saldo
-- ============================================================
--
-- Tudo o que a funcao sabe sobre a propria incerteza sai no retorno: a ancora,
-- a idade dela, a base de queima e se a projecao ainda vale. Quem desenha a tela
-- nao precisa repetir nenhuma dessas contas.

create or replace function public.openai_saldo_estimado()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
    v_cfg        record;
    v_gasto      numeric := 0;
    v_dias_ancora numeric;
    v_queima     numeric := 0;
    v_saldo      numeric;
    v_vencida    boolean;
    v_dias_rest  numeric;
begin
    -- Chamada por outras funcoes security definer (que ja checaram permissao) e
    -- tambem direto pelo painel. O gasto da plataforma inteira nao pode vazar
    -- para um usuario de tenant, entao a checagem mora aqui, e nao so em quem chama.
    if auth.uid() is not null and not public.admin_can('alertas', 'view') then
        raise exception 'Acesso negado ao saldo da plataforma' using errcode = '42501';
    end if;

    select openai_credit_usd, openai_credit_recorded_at, openai_auto_recharge_enabled,
           openai_credit_stale_days, openai_balance_warn_usd, openai_balance_critical_usd
      into v_cfg
      from public.llm_platform_settings limit 1;

    if v_cfg.openai_credit_usd is null or v_cfg.openai_credit_recorded_at is null then
        return jsonb_build_object(
            'tem_ancora', false,
            'motivo', 'saldo nunca informado — preencha o campo no painel depois da próxima recarga'
        );
    end if;

    -- Queima media dos ultimos 30 dias, base cost_usd (ver cabecalho).
    select coalesce(sum(cost_usd), 0) / 30.0
      into v_queima
      from public.token_usage_log
     where created_at >= now() - interval '30 days';

    -- Gasto desde a ancora: o que efetivamente saiu do saldo informado.
    select coalesce(sum(cost_usd), 0)
      into v_gasto
      from public.token_usage_log
     where created_at >= v_cfg.openai_credit_recorded_at;

    v_dias_ancora := extract(epoch from (now() - v_cfg.openai_credit_recorded_at)) / 86400.0;
    v_vencida     := v_dias_ancora > coalesce(v_cfg.openai_credit_stale_days, 7);
    v_saldo       := v_cfg.openai_credit_usd - v_gasto;
    v_dias_rest   := case when v_queima > 0 then v_saldo / v_queima end;

    return jsonb_build_object(
        'tem_ancora', true,
        'saldo_informado_usd', round(v_cfg.openai_credit_usd, 2),
        'informado_em', v_cfg.openai_credit_recorded_at,
        'dias_desde_ancora', round(v_dias_ancora, 1),
        'ancora_vencida', v_vencida,
        'limite_dias_ancora', coalesce(v_cfg.openai_credit_stale_days, 7),
        'gasto_desde_ancora_usd', round(v_gasto, 2),
        -- projecao SO existe enquanto a ancora vale; vencida, o campo vem nulo de
        -- proposito para que a tela nao tenha um numero bonito para mostrar.
        'saldo_estimado_usd', case when v_vencida then null else round(v_saldo, 2) end,
        'queima_dia_usd', round(v_queima, 2),
        'dias_restantes', case when v_vencida then null else round(v_dias_rest, 1) end,
        'recarga_automatica', v_cfg.openai_auto_recharge_enabled,
        'limite_aviso_usd', round(v_cfg.openai_balance_warn_usd, 2),
        'limite_critico_usd', round(v_cfg.openai_balance_critical_usd, 2),
        'base_do_calculo', 'token_usage_log.cost_usd — provider_cost_usd está zerada em source=system e parcial no n8n'
    );
end;
$$;

comment on function public.openai_saldo_estimado() is
  'Saldo estimado da organizacao OpenAI a partir da ancora informada a mao. Devolve a propria incerteza: idade da ancora, se venceu, e a base de queima.';

-- ============================================================
-- 3. Gravar o saldo pelo painel
-- ============================================================

create or replace function public.admin_set_openai_credit(
    p_saldo_usd numeric,
    p_auto_recharge boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
    if not public.admin_can('alertas', 'edit') then
        raise exception 'Sem permissão para alterar o saldo' using errcode = '42501';
    end if;
    if p_saldo_usd is null or p_saldo_usd < 0 then
        raise exception 'Saldo inválido' using errcode = '22023';
    end if;

    update public.llm_platform_settings
       set openai_credit_usd            = round(p_saldo_usd, 2),
           openai_credit_recorded_at    = now(),
           openai_auto_recharge_enabled =
               coalesce(p_auto_recharge, openai_auto_recharge_enabled);

    -- Recarregou: o alerta de saldo baixo que estava aberto nao faz mais sentido.
    -- Fica `resolved_by = null` de proposito — quem resolveu foi a automacao, e
    -- e isso que permite a analise ser reaproveitada se o saldo cair de novo.
    update public.incidents
       set status = 'resolved', resolved_at = now(), updated_at = now()
     where status <> 'resolved'
       and component in ('openai:saldo_baixo', 'openai:sem_credito');

    return public.openai_saldo_estimado();
end;
$$;

-- ============================================================
-- 4. Varredura do saldo
-- ============================================================
--
-- Regra aprovada em 23/09/2026:
--   saldo < US$ 50                              -> ALTA
--   saldo < US$ 20                              -> CRITICA
--   saldo < US$ 50 com recarga automatica OFF   -> CRITICA na hora
-- Ancora vencida nao gera alerta de saldo: gera um aviso de que a ancora venceu,
-- porque alertar com base num numero velho e pior do que nao alertar.

create or replace function public.openai_saldo_scan()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_ligado boolean;
    v_est    jsonb;
    v_saldo  numeric;
    v_auto   boolean;
    v_warn   numeric;
    v_crit   numeric;
    v_sev    text;
    v_res    jsonb;
begin
    select coalesce(openai_balance_alert_enabled, true) into v_ligado
      from public.llm_platform_settings limit 1;
    if v_ligado is false then
        return jsonb_build_object('skipped', 'openai_balance_alert_enabled=false');
    end if;

    v_est := public.openai_saldo_estimado();

    if coalesce((v_est ->> 'tem_ancora')::boolean, false) is false then
        return jsonb_build_object('skipped', 'sem_ancora');
    end if;

    if coalesce((v_est ->> 'ancora_vencida')::boolean, false) then
        v_res := public.incident_record(jsonb_build_object(
            'source', 'db_job',
            'component', 'openai:ancora_de_saldo_vencida',
            'route', 'saldo/ancora',
            'request_id', 'saldo_ancora:' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
            'error_name', 'ancora_vencida',
            'error_message',
                'O saldo da OpenAI foi informado há ' || (v_est ->> 'dias_desde_ancora')
                || ' dias e o limite é ' || (v_est ->> 'limite_dias_ancora')
                || '. Enquanto não for atualizado, não há como estimar quanto resta.',
            'context', v_est
        ));
        if coalesce((v_res ->> 'skipped')::boolean, false) is false then
            perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, 'media');
        end if;
        return jsonb_build_object('ancora_vencida', true);
    end if;

    v_saldo := (v_est ->> 'saldo_estimado_usd')::numeric;
    v_auto  := (v_est ->> 'recarga_automatica')::boolean;
    v_warn  := (v_est ->> 'limite_aviso_usd')::numeric;
    v_crit  := (v_est ->> 'limite_critico_usd')::numeric;

    if v_saldo >= v_warn then
        return jsonb_build_object('saldo_ok', true, 'saldo_estimado_usd', v_saldo);
    end if;

    -- recarga automatica desligada nao deixa espaco para "aviso": acabou, parou.
    v_sev := case when v_saldo < v_crit or v_auto is not true then 'critica' else 'alta' end;

    v_res := public.incident_record(jsonb_build_object(
        'source', 'db_job',
        'component', 'openai:saldo_baixo',
        'route', 'saldo/' || v_sev,
        -- um incidente por dia por severidade: o saldo cai devagar, avisar de
        -- hora em hora so treinaria ele a ignorar o alerta.
        'request_id', 'saldo:' || v_sev || ':' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
        'error_name', 'saldo_baixo',
        'error_message',
            'Saldo estimado da OpenAI: US$ ' || round(v_saldo, 2)::text
            || ' (queima de US$ ' || (v_est ->> 'queima_dia_usd') || '/dia, '
            || coalesce((v_est ->> 'dias_restantes'), '?') || ' dias restantes). '
            || case when v_auto is true
                    then 'A recarga automática está ligada.'
                    else 'A RECARGA AUTOMÁTICA ESTÁ DESLIGADA — quando acabar, a IA para.' end,
        'context', v_est
    ));

    if coalesce((v_res ->> 'skipped')::boolean, false) is false then
        perform public.incident_set_severidade_inicial((v_res ->> 'incident_id')::uuid, v_sev);
        update public.incidents
           set ai_probable_cause = 'consumo normal contra um saldo que não foi recarregado',
               ai_fix_system = case when v_auto is true
                    then 'confirme na OpenAI se a recarga automática tem cartão válido e teto suficiente'
                    else 'recarregue a conta OpenAI e atualize o saldo no painel de alertas' end
         where id = (v_res ->> 'incident_id')::uuid;
    end if;

    return jsonb_build_object('severidade', v_sev, 'saldo_estimado_usd', v_saldo, 'incidente', v_res);
end;
$$;

-- ============================================================
-- 5. O sinal duro: 429 "no credits remaining"
-- ============================================================
--
-- Estimativa erra; o 429 da OpenAI nao. Quando ele aparece, o saldo JA acabou e
-- a IA JA parou de responder. Por isso ele nao passa por limiar, por janela de
-- silencio nem por cooldown: entra como critica na hora, venha de onde vier
-- (edge function, n8n, varredor). E entra pelo catalogo, e nao por codigo
-- espalhado, para que qualquer caminho que chame incident_record ja o reconheca.

insert into public.incident_catalog (pattern, match_type, source, severidade_sugerida, causa, acao, is_active)
select v.pattern, v.match_type, null, 'critica', v.causa, v.acao, true
from (values
    ('no credits remaining', 'substring',
     'a organização OpenAI ficou sem crédito — não é erro de código',
     'recarregue a conta OpenAI agora e atualize o saldo no painel de alertas'),
    ('insufficient_quota', 'substring',
     'cota da OpenAI esgotada (sem crédito ou teto do projeto atingido)',
     'recarregue a conta OpenAI ou revise o teto do projeto, depois atualize o saldo no painel'),
    ('billing_hard_limit_reached', 'substring',
     'teto de faturamento da OpenAI atingido',
     'eleve o teto na OpenAI ou recarregue, depois atualize o saldo no painel')
) as v(pattern, match_type, causa, acao)
where not exists (
    select 1 from public.incident_catalog c
     where c.pattern = v.pattern and c.match_type = v.match_type
);

-- ============================================================
-- 6. Cron
-- ============================================================
-- De hora em hora: o saldo nao cai em minutos, e o 429 tem caminho proprio e
-- imediato pelo catalogo.

select cron.unschedule('openai-saldo-scan')
 where exists (select 1 from cron.job where jobname = 'openai-saldo-scan');

select cron.schedule('openai-saldo-scan', '15 * * * *', 'select public.openai_saldo_scan()');

-- ============================================================
-- 7. Privilegios
-- ============================================================

revoke all on function public.openai_saldo_scan() from public, anon, authenticated;
revoke all on function public.openai_saldo_estimado() from public, anon;
revoke all on function public.admin_set_openai_credit(numeric, boolean) from public, anon;
grant execute on function public.openai_saldo_estimado() to authenticated;
grant execute on function public.admin_set_openai_credit(numeric, boolean) to authenticated;

-- ============================================================
-- 8. O painel le saldo junto com o resto da configuracao
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
        'alert_analyze_model',   s.alert_analyze_model,
        'incident_db_scan_enabled',      s.incident_db_scan_enabled,
        'incident_analyze_cooldown_min', s.incident_analyze_cooldown_min,
        'incident_notify_cooldown_min',  s.incident_notify_cooldown_min,
        'openai_balance_alert_enabled',  s.openai_balance_alert_enabled,
        'openai_credit_stale_days',      s.openai_credit_stale_days,
        'openai_balance_warn_usd',       s.openai_balance_warn_usd,
        'openai_balance_critical_usd',   s.openai_balance_critical_usd
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

    return jsonb_build_object(
        'config', coalesce(v_cfg, '{}'::jsonb),
        'destinatarios', v_dest,
        'saldo', public.openai_saldo_estimado()
    );
end;
$$;

revoke all on function public.admin_alert_settings() from public, anon;
grant execute on function public.admin_alert_settings() to authenticated;

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
    elsif p_key = 'openai_balance_alert_enabled' then
        update public.llm_platform_settings set openai_balance_alert_enabled = (p_value = 'true');
    elsif p_key = 'alert_max_per_hour' then
        update public.llm_platform_settings
           set alert_max_per_hour = greatest(1, least(100, p_value::integer));
    elsif p_key = 'incident_analyze_cooldown_min' then
        update public.llm_platform_settings
           set incident_analyze_cooldown_min = greatest(0, least(10080, p_value::integer));
    elsif p_key = 'incident_notify_cooldown_min' then
        update public.llm_platform_settings
           set incident_notify_cooldown_min = greatest(0, least(10080, p_value::integer));
    elsif p_key = 'openai_credit_stale_days' then
        update public.llm_platform_settings
           set openai_credit_stale_days = greatest(1, least(90, p_value::integer));
    elsif p_key = 'openai_balance_warn_usd' then
        update public.llm_platform_settings
           set openai_balance_warn_usd = greatest(0, least(100000, p_value::numeric));
    elsif p_key = 'openai_balance_critical_usd' then
        update public.llm_platform_settings
           set openai_balance_critical_usd = greatest(0, least(100000, p_value::numeric));
    else
        raise exception 'Chave desconhecida: %', p_key using errcode = '22023';
    end if;

    return jsonb_build_object('ok', true, 'key', p_key);
end;
$$;

revoke all on function public.admin_set_alert_setting(text, text) from public, anon;
grant execute on function public.admin_set_alert_setting(text, text) to authenticated;
