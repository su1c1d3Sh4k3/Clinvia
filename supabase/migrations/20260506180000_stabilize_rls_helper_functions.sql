-- =====================================================
-- CRÍTICO: marcar funções helper de RLS como STABLE
-- =====================================================
-- Bug raiz da lentidão geral da plataforma: 5 funções usadas em RLS policies
-- estavam marcadas como VOLATILE (default do PL/pgSQL). Isso significa que
-- o Postgres NÃO podia cachear o resultado, então:
--
--   * cada query com RLS executava a função N vezes (1 vez por row scanned)
--   * em joins, podia ser ainda pior (N×M)
--
-- Medição antes da correção:
--   get_my_owner_id():    3321 ms numa única chamada
--   useUnreadCounts:      417 ms (Seq Scan com filtro RLS)
--   useConversations:     6087 ms primeira execução
--
-- Medição depois:
--   get_my_owner_id():    2 ms (1660x mais rápido)
--   useUnreadCounts:      2.96 ms (140x mais rápido)
--
-- Funções afetadas — todas eram VOLATILE, viram STABLE:
--   * get_my_owner_id            (RPC do useOwnerId, fallback nas hooks)
--   * get_current_user_role      (RLS de notifications)
--   * get_current_team_member_id (RLS de várias tabelas)
--   * has_financial_notification_access (RLS de notifications financeiras)
--   * is_staff                   (RLS de team_costs)
--
-- Por que STABLE é seguro aqui: nenhuma delas modifica dados; todas
-- retornam o mesmo valor para o mesmo input (auth.uid()) dentro de uma
-- mesma transação. STABLE permite o planner cachear o resultado por
-- statement, eliminando re-execução redundante.
-- =====================================================

ALTER FUNCTION public.get_my_owner_id() STABLE;
ALTER FUNCTION public.get_current_user_role() STABLE;
ALTER FUNCTION public.get_current_team_member_id() STABLE;
ALTER FUNCTION public.has_financial_notification_access() STABLE;
ALTER FUNCTION public.is_staff() STABLE;

-- Verificação: lista todas as funções helper de RLS e seu volatility status.
-- Deve retornar zero linhas marcadas VOLATILE.
DO $$
DECLARE
    v_volatile_count INT;
BEGIN
    SELECT COUNT(*) INTO v_volatile_count
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.provolatile = 'v'
      AND p.proname IN (
          'get_my_owner_id',
          'get_owner_id',
          'get_current_user_role',
          'get_current_team_member_id',
          'has_financial_notification_access',
          'is_staff',
          'is_admin',
          'is_agent',
          'is_supervisor'
      );

    IF v_volatile_count > 0 THEN
        RAISE WARNING 'Ainda há % funções helper de RLS marcadas como VOLATILE — investigar', v_volatile_count;
    END IF;
END $$;
