import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "clinvia_session_id";
const IMPERSONATION_KEY = "clinvia_impersonation";
const HEARTBEAT_INTERVAL_MS = 30_000; // 30s — banco considera stale após 2min

/**
 * Verdadeiro quando o admin está em modo "Acessar como cliente".
 * Durante a impersonação, a sessão Supabase atual é a do CLIENTE, mas o
 * session_id no localStorage é o que foi gerado quando o ADMIN logou. O
 * heartbeat com `auth.uid()` = cliente + session_id = admin sempre retorna
 * valid:false e derruba a sessão. Por isso pulamos a checagem nesse modo.
 */
export function isImpersonating(): boolean {
    return !!localStorage.getItem(IMPERSONATION_KEY);
}

/**
 * Gera/recupera o session_id deste tab/browser. Persiste em localStorage para
 * sobreviver a F5 e múltiplas abas no mesmo PC (todas dividem o mesmo slot
 * de sessão). Outro PC = outro localStorage = outro session_id.
 */
export function getOrCreateSessionId(): string {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
        id = (crypto as any)?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(SESSION_KEY, id);
    }
    return id;
}

export function clearSessionId(): void {
    localStorage.removeItem(SESSION_KEY);
}

/** Detecta um label legível do device (browser + OS) a partir do User-Agent. */
export function detectDeviceLabel(): string {
    const ua = navigator.userAgent || "";
    const browser = /Edg\//.test(ua)
        ? "Edge"
        : /Chrome\//.test(ua)
            ? "Chrome"
            : /Firefox\//.test(ua)
                ? "Firefox"
                : /Safari\//.test(ua)
                    ? "Safari"
                    : "Browser";
    const os = /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
            ? "macOS"
            : /Linux/.test(ua)
                ? "Linux"
                : /Android/.test(ua)
                    ? "Android"
                    : /iPhone|iPad|iOS/.test(ua)
                        ? "iOS"
                        : "Desconhecido";
    return `${browser} / ${os}`;
}

/**
 * Mantém heartbeat ativo enquanto o user está logado. Se a RPC `heartbeat_session`
 * retornar `valid:false`, significa que outra sessão tomou o slot — força logout
 * imediato e chama o callback `onSessionLost`.
 *
 * Deve ser montado em um lugar único da árvore (ex: AuthCacheManager no App.tsx).
 */
export function useSessionLock(onSessionLost: (reason: string) => void): void {
    const intervalRef = useRef<number | null>(null);
    const userIdRef = useRef<string | null>(null);

    useEffect(() => {
        const stop = () => {
            if (intervalRef.current !== null) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };

        const start = () => {
            stop();
            intervalRef.current = window.setInterval(async () => {
                // Pula heartbeat durante impersonação — auth.uid() é do cliente
                // e o session_id é do admin; o RPC sempre retornaria valid:false.
                if (isImpersonating()) return;

                const sid = getOrCreateSessionId();
                try {
                    const { data, error } = await supabase.rpc("heartbeat_session", {
                        p_session_id: sid,
                    });
                    if (error) {
                        console.warn("[useSessionLock] heartbeat error:", error);
                        return;
                    }
                    if (data && (data as any).valid === false) {
                        const reason = (data as any).reason ?? "session_lost";
                        console.warn("[useSessionLock] session invalid, forcing logout:", reason);
                        onSessionLost(reason);
                    }
                } catch (err) {
                    console.warn("[useSessionLock] heartbeat exception:", err);
                }
            }, HEARTBEAT_INTERVAL_MS);
        };

        // Acompanha mudanças de auth: liga/desliga heartbeat quando há user
        supabase.auth.getSession().then(({ data: { session } }) => {
            userIdRef.current = session?.user?.id ?? null;
            if (userIdRef.current) start();
            else stop();
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            const newId = session?.user?.id ?? null;
            userIdRef.current = newId;
            if (newId) start();
            else stop();
        });

        // Nota: não tentamos `release` em beforeunload. Ao fechar abruptamente
        // (crash, kill aba), o slot fica ocupado até o heartbeat ficar stale
        // (>2min) — daí a próxima tentativa de login do mesmo user é liberada
        // automaticamente pelo `acquire_session` (replaced_stale).
        // Para logout limpo, useAuth.signOut() chama release_session diretamente.

        return () => {
            stop();
            subscription.unsubscribe();
        };
    }, [onSessionLost]);
}
