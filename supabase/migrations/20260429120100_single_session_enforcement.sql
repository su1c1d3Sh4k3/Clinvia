-- =====================================================
-- Single-Session Enforcement
-- =====================================================
-- Impede que duas pessoas/dispositivos diferentes usem a mesma conta
-- (auth.users.id) simultaneamente. Quando alguém loga, registra a sessão
-- na tabela. Outro login na mesma conta é REJEITADO até o atual fazer
-- logout ou ficar mais de 2 minutos sem heartbeat.
--
-- Fluxo:
--   1. Login → frontend chama acquire_session(session_id, device_label, ip)
--   2. A cada 30s → frontend chama heartbeat_session(session_id)
--   3. Se heartbeat retorna {valid:false} → frontend força signOut
--      (significa que outra sessão tomou o lugar OU foi liberada por idle)
--   4. Logout → frontend chama release_session(session_id) antes de signOut
-- =====================================================

CREATE TABLE IF NOT EXISTS public.active_sessions (
    auth_user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    device_label TEXT,
    ip TEXT,
    last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.active_sessions
    IS 'Uma linha por auth_user_id ativo. Permite no máximo UMA sessão simultânea por conta.';

-- Index para limpeza periódica de sessões idle
CREATE INDEX IF NOT EXISTS idx_active_sessions_heartbeat
    ON public.active_sessions(last_heartbeat_at);

-- RLS: usuário só vê/manipula sua própria entrada (mas RPCs com SECURITY DEFINER
-- bypassam isso para conseguir ler "outras" sessões na hora de validar conflito)
ALTER TABLE public.active_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "active_sessions_self_select" ON public.active_sessions;
CREATE POLICY "active_sessions_self_select" ON public.active_sessions
    FOR SELECT USING (auth.uid() = auth_user_id);

-- =====================================================
-- RPC: acquire_session
-- =====================================================
-- Tenta registrar a sessão. Retorna jsonb { acquired, reason, ... }.
-- Se já existir entrada ativa (heartbeat < 2min) com session_id diferente,
-- REJEITA e devolve info do device atual.
-- =====================================================
CREATE OR REPLACE FUNCTION public.acquire_session(
    p_session_id TEXT,
    p_device_label TEXT DEFAULT NULL,
    p_ip TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing public.active_sessions;
    v_stale_threshold INTERVAL := INTERVAL '2 minutes';
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('acquired', false, 'reason', 'not_authenticated');
    END IF;

    SELECT * INTO v_existing
    FROM public.active_sessions
    WHERE auth_user_id = v_uid;

    IF FOUND THEN
        -- Mesma sessão chamando de novo (recarregou a página) — atualiza heartbeat
        IF v_existing.session_id = p_session_id THEN
            UPDATE public.active_sessions
            SET last_heartbeat_at = now(),
                device_label = COALESCE(p_device_label, device_label),
                ip = COALESCE(p_ip, ip)
            WHERE auth_user_id = v_uid;
            RETURN jsonb_build_object('acquired', true, 'reason', 'same_session');
        END IF;

        -- Sessão diferente. Stale (>2min sem heartbeat)?
        IF v_existing.last_heartbeat_at < (now() - v_stale_threshold) THEN
            UPDATE public.active_sessions
            SET session_id = p_session_id,
                device_label = p_device_label,
                ip = p_ip,
                last_heartbeat_at = now(),
                acquired_at = now()
            WHERE auth_user_id = v_uid;
            RETURN jsonb_build_object('acquired', true, 'reason', 'replaced_stale');
        END IF;

        -- Outra sessão ATIVA ocupa a conta
        RETURN jsonb_build_object(
            'acquired', false,
            'reason', 'active_elsewhere',
            'device_label', v_existing.device_label,
            'ip', v_existing.ip,
            'last_heartbeat_at', v_existing.last_heartbeat_at,
            'acquired_at', v_existing.acquired_at
        );
    END IF;

    -- Não existe entrada — cria
    INSERT INTO public.active_sessions (auth_user_id, session_id, device_label, ip)
    VALUES (v_uid, p_session_id, p_device_label, p_ip);
    RETURN jsonb_build_object('acquired', true, 'reason', 'new');
END;
$$;

GRANT EXECUTE ON FUNCTION public.acquire_session(TEXT, TEXT, TEXT) TO authenticated;

-- =====================================================
-- RPC: heartbeat_session
-- =====================================================
-- Atualiza last_heartbeat_at se a sessão atual é válida.
-- Retorna { valid: bool }. Se valid=false, frontend deve forçar logout.
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
BEGIN
    IF v_uid IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'reason', 'not_authenticated');
    END IF;

    UPDATE public.active_sessions
    SET last_heartbeat_at = now()
    WHERE auth_user_id = v_uid
      AND session_id = p_session_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated = 0 THEN
        -- Minha session_id não corresponde — outra sessão tomou o slot
        RETURN jsonb_build_object('valid', false, 'reason', 'session_lost');
    END IF;

    RETURN jsonb_build_object('valid', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.heartbeat_session(TEXT) TO authenticated;

-- =====================================================
-- RPC: release_session
-- =====================================================
-- Limpa a entrada no logout. Idempotente.
-- =====================================================
CREATE OR REPLACE FUNCTION public.release_session(p_session_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RETURN;
    END IF;
    DELETE FROM public.active_sessions
    WHERE auth_user_id = v_uid
      AND session_id = p_session_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_session(TEXT) TO authenticated;
