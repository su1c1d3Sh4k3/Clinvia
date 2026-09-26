-- =====================================================
-- Instancias UAZAPI removidas do provedor
-- =====================================================
-- Em 26/09/2026 o dono da conta apagou TODAS as instancias no servidor UAZAPI
-- (clinvia). Eram testes antigos; nenhum cliente estava conectado por ali. A
-- lista vazia que `/instance/all` passou a devolver esta CERTA, e o
-- `UAZAPI_ADMIN_TOKEN` esta correto -- a leitura anterior, de que o token novo
-- enxergava outro escopo de administrador, caiu.
--
-- Sobraram DUAS linhas em `public.instances` sem contraparte no provedor
-- (`pele-10` e `confirmação-agenda`). Elas nao sao mais instancias: sao
-- cadastro morto. Enquanto existirem como linha viva, o banner vermelho de
-- "instancia desconectada" acusa para sempre na tela da clinica, os seletores
-- oferecem um canal que nao envia nada e o painel do super admin conta duas
-- desconexoes que ninguem pode consertar.
--
-- NAO se apaga em cascata: conversas e historico FICAM. Sao 191 conversas
-- penduradas na `pele-10`, e o `messages_history` delas so e legivel enquanto
-- a linha da instancia existir para o chat resolver nome e provedor. Por isso
-- a remocao e uma MARCA, nao um delete.
--
-- Por que coluna nova e nao um estado novo em `instances.status`: `status` e o
-- enum `instance_status`, com exatamente tres rotulos
-- (`connected`/`disconnected`/`connecting`). Acrescentar um quarto obrigaria
-- todo `switch` de status do front e das functions a tratar um caso que eles
-- nao conhecem -- e o que se quer aqui nao e um estado de conexao, e a
-- ausencia da instancia.
--
-- Por que nao reaproveitar `removal_pending_at`: aquela coluna significa o
-- OPOSTO -- "pedimos ao provedor para apagar e ele recusou, a linha fica sob
-- vigilancia". Aqui o provedor ja nao tem nada; quem sobrou fomos nos.
-- =====================================================

set lock_timeout = '5s';
set statement_timeout = '120s';

-- ---------------------------------------------------------------
-- 1. A marca
-- ---------------------------------------------------------------
alter table public.instances
    add column if not exists removed_at     timestamptz,
    add column if not exists removed_reason text;

comment on column public.instances.removed_at is
    'Instancia que nao existe mais no provedor. A linha e mantida para que as '
    'conversas e o messages_history continuem legiveis, mas ela nao aparece no '
    'front nem nas rotinas de checagem. Diferente de removal_pending_at, que '
    'marca pedido de remocao RECUSADO pelo provedor.';

comment on column public.instances.removed_reason is
    'Por que a instancia foi marcada como removida.';

-- ---------------------------------------------------------------
-- 2. As duas linhas orfas do nosso lado
-- ---------------------------------------------------------------
-- Filtro por provedor e nao por nome: nomear as duas deixaria a migration muda
-- se uma terceira linha morta aparecesse antes de ela rodar. Como o `update`
-- corre uma unica vez, ele so alcanca o que existe neste instante -- conta
-- conectada depois nasce com `removed_at` nulo, viva.
update public.instances
   set removed_at     = now(),
       removed_reason = 'Instancia apagada no servidor UAZAPI em 26/09/2026; '
                        'a linha ficou so para preservar conversas e historico.',
       updated_at     = now()
 where coalesce(provider, 'uazapi') <> 'meta'
   and removed_at is null;

-- ---------------------------------------------------------------
-- 3. Os incidentes de orfa
-- ---------------------------------------------------------------
-- As 9 orfas eram instancias que existiam NA UAZAPI e nao tinham linha aqui.
-- Elas deixaram de existir; o incidente perdeu o assunto. O varredor fecharia
-- sozinho na proxima passada (a lista viva ficou vazia), mas deixa-los abertos
-- ate as 4h50 de amanha seria manter divida quitada no painel.
update public.incidents
   set status      = 'resolved',
       resolved_at = now(),
       updated_at  = now(),
       notes       = coalesce(notes || chr(10), '')
                     || 'instancias apagadas no servidor UAZAPI em 26/09/2026'
 where component in ('uazapi:instancia-orfa', 'uazapi:varredura-cega')
   and status <> 'resolved';

-- A `uazapi:varredura-cega` continua ATIVA no catalogo, e de proposito. Ela
-- so dispara quando o provedor devolve lista vazia E existe instancia UAZAPI
-- VIVA no banco -- com as duas linhas marcadas, a condicao deixa de existir
-- hoje e volta a valer no dia em que alguem conectar uma conta nova. Desativar
-- o componente agora seria desarmar o detector justamente para o caso futuro
-- em que ele e a unica coisa entre "perdi a visao" e "0 orfas, tudo bem".

-- ---------------------------------------------------------------
-- 4. O painel do super admin para de contar cadastro morto
-- ---------------------------------------------------------------
-- Reemissao de `admin_get_dashboard_metrics` a partir da versao VIVA
-- (`pg_get_functiondef`), nao de migration antiga. Diferenca em relacao ao que
-- esta no ar: DUAS linhas, ambas acrescimo, nenhuma remocao --
--   . bloco 'instances'            -> WHERE i.removed_at IS NULL
--   . bloco 'restricted_instances' -> AND i.removed_at IS NULL

CREATE OR REPLACE FUNCTION public.admin_get_dashboard_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rate NUMERIC := COALESCE(public.latest_usd_brl_rate(), 5.50);
  v_today DATE := (NOW() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_today_start TIMESTAMPTZ := (v_today::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_month_start TIMESTAMPTZ := (date_trunc('month', v_today)::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_super BOOLEAN := public.is_super_admin();
  v_scope_all BOOLEAN;
  v_allowed UUID[];
  v_result JSONB;
BEGIN
  IF NOT public.is_admin_staff() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_scope_all := v_super OR public.admin_client_scope_all();
  v_allowed := public.admin_allowed_client_ids();

  SELECT jsonb_build_object(
    'generated_at', NOW(),
    'exchange_rate', v_rate,
    'is_super_admin', v_super,

    'clients', (
      SELECT jsonb_build_object(
        'active', COUNT(*) FILTER (WHERE p.role IN ('admin','agent','supervisor') AND p.deactivated_at IS NULL),
        'new_this_month', COUNT(*) FILTER (WHERE p.role = 'admin' AND p.deactivated_at IS NULL AND p.created_at >= v_month_start),
        'deactivated', CASE WHEN v_super THEN COUNT(*) FILTER (WHERE p.deactivated_at IS NOT NULL) ELSE NULL END,
        'active_admins', COUNT(*) FILTER (WHERE p.role = 'admin' AND p.deactivated_at IS NULL)
      ) FROM public.profiles p WHERE NOT COALESCE(p.is_internal, false)
    ),

    'pending_signups', (
      CASE WHEN v_super
        THEN (SELECT COUNT(*) FROM public.pending_signups WHERE status = 'pending')
        ELSE NULL END
    ),

    'deactivated_list', (
      CASE WHEN v_super THEN (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', p.id, 'company_name', p.company_name, 'full_name', p.full_name,
          'deactivated_at', p.deactivated_at,
          'days_remaining', GREATEST(0, 30 - EXTRACT(DAY FROM NOW() - p.deactivated_at)::int)
        ) ORDER BY p.deactivated_at), '[]'::jsonb)
        FROM public.profiles p WHERE p.deactivated_at IS NOT NULL
      ) ELSE '[]'::jsonb END
    ),

    'tokens', (
      SELECT jsonb_build_object(
        'today_tokens', COALESCE(SUM(t.total_tokens) FILTER (WHERE t.created_at >= v_today_start), 0),
        'today_brl', ROUND(COALESCE(SUM(COALESCE(t.cost_brl, t.cost_usd * v_rate)) FILTER (WHERE t.created_at >= v_today_start), 0)::numeric, 2),
        'month_tokens', COALESCE(SUM(t.total_tokens), 0),
        'month_brl', ROUND(COALESCE(SUM(COALESCE(t.cost_brl, t.cost_usd * v_rate)), 0)::numeric, 2)
      ) FROM public.token_usage_log t WHERE t.created_at >= v_month_start
    ),

    'templates', (
      SELECT jsonb_build_object(
        'today_count', COUNT(*) FILTER (WHERE s.created_at >= v_today_start),
        'today_brl', ROUND(COALESCE(SUM(public.meta_template_price_usd(s.user_id, s.template_name)) FILTER (WHERE s.created_at >= v_today_start), 0) * v_rate, 2),
        'month_count', COUNT(*),
        'month_brl', ROUND(COALESCE(SUM(public.meta_template_price_usd(s.user_id, s.template_name)), 0) * v_rate, 2)
      ) FROM public.template_sends s WHERE s.created_at >= v_month_start
    ),

    'instances', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'connected', COUNT(*) FILTER (WHERE i.status = 'connected'),
        'disconnected', COUNT(*) FILTER (WHERE i.status IS DISTINCT FROM 'connected'),
        'meta', COUNT(*) FILTER (WHERE i.provider = 'meta'),
        'restricted', COUNT(*) FILTER (WHERE i.restriction_active)
      ) FROM public.instances i WHERE i.removed_at IS NULL
    ),

    'instagram', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'connected', COUNT(*) FILTER (WHERE g.status = 'connected'),
        'expiring', COUNT(*) FILTER (WHERE g.token_expires_at IS NOT NULL AND g.token_expires_at < NOW() + INTERVAL '7 days')
      ) FROM public.instagram_instances g
    ),

    'health', (
      SELECT jsonb_build_object(
        'queue_pending', (SELECT COUNT(*) FROM public.webhook_queue WHERE status = 'pending'),
        'queue_processing', (SELECT COUNT(*) FROM public.webhook_queue WHERE status = 'processing'),
        'queue_failed', (SELECT COUNT(*) FROM public.webhook_queue WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours'),
        'alerts_open', (SELECT COUNT(*) FROM public.alert_log WHERE NOT resolved),
        'tickets_open', (SELECT COUNT(*) FROM public.support_tickets WHERE status <> 'resolved'),
        'tickets_urgent', (SELECT COUNT(*) FROM public.support_tickets WHERE status <> 'resolved' AND priority = 'urgent'),
        'tickets_waiting', (SELECT COUNT(*) FROM public.support_tickets WHERE status <> 'resolved' AND last_sender_type = 'client')
      )
    ),

    'usage', (
      SELECT jsonb_build_object(
        'messages_in', (SELECT COUNT(*) FROM public.messages WHERE created_at >= v_today_start AND direction = 'inbound'),
        'messages_out', (SELECT COUNT(*) FROM public.messages WHERE created_at >= v_today_start AND direction = 'outbound'),
        'conversations_active', (SELECT COUNT(*) FROM public.conversations WHERE status IN ('open','pending')),
        'campaigns_dispatching', (SELECT COUNT(*) FROM public.campaigns WHERE status = 'dispatching'),
        'appointments_today', (SELECT COUNT(*) FROM public.appointments WHERE created_at >= v_today_start)
      )
    ),

    'top_cost', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT p.id, COALESCE(p.company_name, p.full_name, p.email) AS company_name,
               ROUND(SUM(COALESCE(t.cost_brl, t.cost_usd * v_rate))::numeric, 2) AS cost_brl,
               SUM(t.total_tokens) AS tokens
          FROM public.token_usage_log t
          JOIN public.profiles p ON p.id = t.owner_id
         WHERE t.created_at >= NOW() - INTERVAL '30 days'
           AND NOT COALESCE(p.is_internal, false)
           AND (v_scope_all OR p.id = ANY (v_allowed))
           AND (v_super OR p.role IS DISTINCT FROM 'super-admin')
         GROUP BY p.id, p.company_name, p.full_name, p.email
         ORDER BY 3 DESC
         LIMIT 10
      ) x
    ),

    'risk', (
      SELECT jsonb_build_object(
        'invalid_openai', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'company_name', COALESCE(p.company_name, p.full_name))), '[]'::jsonb)
            FROM public.profiles p
           WHERE p.openai_token_invalid IS TRUE AND p.deactivated_at IS NULL
             AND NOT COALESCE(p.is_internal, false)
             AND (v_scope_all OR p.id = ANY (v_allowed))
             AND (v_super OR p.role IS DISTINCT FROM 'super-admin')
        ),
        'restricted_instances', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', i.id, 'name', i.name, 'type', i.restriction_type,
            'company_name', COALESCE(p.company_name, p.full_name)
          )), '[]'::jsonb)
            FROM public.instances i LEFT JOIN public.profiles p ON p.id = i.user_id
           WHERE i.restriction_active
             AND i.removed_at IS NULL
             AND (v_scope_all OR i.user_id = ANY (v_allowed))
        ),
        'idle_tenants', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', p.id, 'company_name', COALESCE(p.company_name, p.full_name), 'last_message_at', lm.last_at
          ) ORDER BY lm.last_at NULLS FIRST), '[]'::jsonb)
            FROM public.profiles p
            LEFT JOIN LATERAL (
              SELECT MAX(c.last_message_at) AS last_at
                FROM public.conversations c WHERE c.user_id = p.id
            ) lm ON TRUE
           WHERE p.role = 'admin' AND p.deactivated_at IS NULL
             AND NOT COALESCE(p.is_internal, false)
             AND (v_scope_all OR p.id = ANY (v_allowed))
             AND (lm.last_at IS NULL OR lm.last_at < NOW() - INTERVAL '7 days')
        )
      )
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$

-- O verify de `item_instancias_uazapi_removidas` procura `removed_at IS NULL`
-- dentro de `pg_get_functiondef` justamente para que a proxima reemissao desta
-- funcao reprove na suite em vez de apagar a guarda em silencio.
