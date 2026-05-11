-- =====================================================
-- heartbeat_session — auto-recovery quando o slot não existe
-- =====================================================
-- Bug original: usuários que JÁ estavam logados antes do deploy do
-- single-session (ou após bug que limpou active_sessions) não tinham
-- linha em `active_sessions`. A função heartbeat retornava ROW_COUNT=0
-- e o frontend interpretava como "sessão tomada por outro device" →
-- forçava signOut a cada reload. Resultado: TODOS os usuários antigos
-- eram deslogados no primeiro heartbeat após reload.
--
-- Correção: o heartbeat agora distingue 3 cenários:
--   1. Meu session_id existe e é o registrado → UPDATE last_heartbeat_at (valid)
--   2. Não existe NENHUM registro pra esse user → cria o meu (recovery)
--   3. Existe registro de OUTRO session_id E ele está ATIVO (<2min) → valid=false
--      (esse é o único caso legítimo de "sessão perdida")
--   4. Existe registro de outro session_id mas está STALE → toma o slot
--
-- Resultado: zero falsos positivos de "session_lost" para usuários legados.
-- =====================================================

CREATE OR REPLACE FUNCTION public.heartbeat_session(p_session_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_updated INT;
    v_existing public.active_sessions;
    v_stale_threshold INTERVAL := INTERVAL '5 minutes';
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'not_authenticated');
    END IF;

    -- Caso 1: meu session_id existe → só atualiza heartbeat
    UPDATE public.active_sessions
    SET last_heartbeat_at = now()
    WHERE auth_user_id = v_uid
      AND session_id = p_session_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated > 0 THEN
        RETURN jsonb_build_object('valid', true, 'reason', 'ok');
    END IF;

    -- Não encontrou meu session_id. Vamos investigar o slot do user.
    SELECT * INTO v_existing
    FROM public.active_sessions
    WHERE auth_user_id = v_uid;

    -- Caso 2: NÃO existe linha alguma → AUTO-RECOVERY
    -- Cria a entrada para este session_id (cenário: usuário legado sem
    -- registro, ou linha apagada por limpeza).
    IF NOT FOUND THEN
        INSERT INTO public.active_sessions (auth_user_id, session_id, last_heartbeat_at)
        VALUES (v_uid, p_session_id, now())
        ON CONFLICT (auth_user_id) DO UPDATE
            SET session_id = EXCLUDED.session_id,
                last_heartbeat_at = now();
        RETURN jsonb_build_object('valid', true, 'reason', 'recovered');
    END IF;

    -- Caso 3: existe linha de OUTRO session_id e está stale → toma o slot
    IF v_existing.last_heartbeat_at < (now() - v_stale_threshold) THEN
        UPDATE public.active_sessions
        SET session_id = p_session_id,
            last_heartbeat_at = now(),
            acquired_at = now()
        WHERE auth_user_id = v_uid;
        RETURN jsonb_build_object('valid', true, 'reason', 'replaced_stale');
    END IF;

    -- Caso 4: existe linha de OUTRO session_id ATIVO → conflito legítimo
    RETURN jsonb_build_object(
        'valid', false,
        'reason', 'session_lost',
        'other_device', v_existing.device_label
    );
END;
$$;
