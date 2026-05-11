import { useState, useEffect } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getOrCreateSessionId, clearSessionId, detectDeviceLabel, isImpersonating } from "@/hooks/useSessionLock";
import { clearInstanceValidationCache } from "@/hooks/useInitialInstanceValidation";

function formatLastHeartbeat(iso: string | null | undefined): string {
    if (!iso) return "agora há pouco";
    try {
        const dt = new Date(iso);
        const ago = Math.floor((Date.now() - dt.getTime()) / 1000);
        if (ago < 60) return `${ago}s atrás`;
        if (ago < 3600) return `${Math.floor(ago / 60)}min atrás`;
        return dt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    } catch {
        return iso;
    }
}

/**
 * Lê a sessão Supabase SINCRONAMENTE do localStorage para evitar o flash
 * de "user=null" durante o reload. Sem isso, o useAuth começa com user=null
 * e só popula ~50-500ms depois quando getSession() resolve — o que faz a
 * UI "piscar" mostrando estado deslogado, depois logado.
 *
 * Formato do storage do Supabase: `sb-<projectRef>-auth-token` contendo
 * JSON com { access_token, refresh_token, user, expires_at, ... }.
 * Se o token estiver expirado, retorna null (deixa o getSession lidar).
 */
const SUPABASE_PROJECT_REF = "swfshqvvbohnahdyndch";
const SUPABASE_AUTH_STORAGE_KEY = `sb-${SUPABASE_PROJECT_REF}-auth-token`;

function readSessionFromStorage(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Token expirado → vai precisar de refresh, deixa o caminho assíncrono cuidar
    if (parsed?.expires_at && Number(parsed.expires_at) * 1000 < Date.now()) {
      return null;
    }
    if (!parsed?.user || !parsed?.access_token) return null;
    return parsed as Session;
  } catch {
    return null;
  }
}

export const useAuth = () => {
  // Bootstrap SÍNCRONO: inicializa com a sessão do localStorage (se houver).
  // Componentes que dependem de `user` renderizam imediatamente com o estado
  // correto, sem flash de "deslogado". O getSession() abaixo revalida em
  // background e atualiza caso o token tenha expirado / sido revogado.
  const [session, setSession] = useState<Session | null>(() => readSessionFromStorage());
  const [user, setUser] = useState<User | null>(() => readSessionFromStorage()?.user ?? null);
  const [loading, setLoading] = useState<boolean>(() => readSessionFromStorage() === null);
  const { toast } = useToast();

  useEffect(() => {
    // Listener para mudanças (login, logout, refresh de token, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // Revalida sessão em background. Se o token bootstrap do localStorage
    // estiver inválido, o supabase faz signOut automaticamente e o listener
    // acima atualiza para null.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
          }
        }
      });

      if (error) throw error;

      toast({
        title: "Cadastro realizado!",
        description: "Verifique seu email para confirmar a conta.",
      });

      return { error: null, data };
    } catch (error: any) {
      toast({
        title: "Erro no cadastro",
        description: error.message,
        variant: "destructive",
      });
      return { error, data: null };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error, data } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // ─── Bloqueio pós-login para contas desativadas ────────────────────
      // A conta foi marcada como "desativada" pelo admin (falta de pagamento).
      // O signInWithPassword devolve sessão válida, mas precisamos derrubar
      // imediatamente e mostrar a mensagem de bloqueio com os dias restantes.
      try {
        const { data: deactData, error: deactErr } = await (supabase.rpc as any)(
          "check_account_deactivation",
        );
        if (!deactErr && deactData?.is_deactivated) {
          const daysRemaining: number = deactData.days_remaining ?? 0;
          const isExpired: boolean = !!deactData.is_expired;

          // Derruba a sessão antes de qualquer navegação
          await supabase.auth.signOut();

          const message = isExpired
            ? "Sua conta está bloqueada por falta de pagamento e o prazo de 30 dias foi encerrado. Entre em contato com nosso time urgentemente para evitar a exclusão definitiva dos dados."
            : `Sua conta está bloqueada por falta de pagamento, entre em contato com nosso time para reativar sua conta. Em ${daysRemaining} ${daysRemaining === 1 ? "dia" : "dias"} sua conta será excluída em definitivo, para evitar a perda dos dados regularize sua situação.`;

          // Toast longo para dar tempo de ler
          toast({
            title: "Conta bloqueada",
            description: message,
            variant: "destructive",
            duration: 15000,
          });

          return { error: new Error(message), data: null };
        }
      } catch (checkErr) {
        // Se a RPC falhar (ex: migration ainda não aplicada), não bloqueia
        // o login para não quebrar contas ativas por erro transiente.
        console.warn("[useAuth] check_account_deactivation failed:", checkErr);
      }
      // ─── Fim do bloqueio ───────────────────────────────────────────────

      // ─── Single-session enforcement ────────────────────────────────────
      // Bloqueia login se já existe outra sessão ATIVA na mesma conta em
      // outro dispositivo (heartbeat < 2 min). Mesmo browser/PC compartilha
      // o session_id no localStorage e passa direto.
      // Skip durante impersonação (admin "Acessar como cliente") — a sessão
      // muda via magic link e a verificação não se aplica.
      if (isImpersonating()) {
        return { error: null, data };
      }
      try {
        const sessionId = getOrCreateSessionId();
        const deviceLabel = detectDeviceLabel();

        const { data: lockData, error: lockErr } = await (supabase.rpc as any)(
          "acquire_session",
          {
            p_session_id: sessionId,
            p_device_label: deviceLabel,
            p_ip: null,
          },
        );

        if (lockErr) {
          // Falha de RPC não bloqueia login (não quebra usuários por erro transiente).
          console.warn("[useAuth] acquire_session failed:", lockErr);
        } else if (lockData && (lockData as any).acquired === false) {
          const otherDevice = (lockData as any).device_label || "outro dispositivo";
          const lastSeen = formatLastHeartbeat((lockData as any).last_heartbeat_at);

          // Outra sessão ATIVA — derruba este login imediatamente
          await supabase.auth.signOut();

          const message =
            `Esta conta já está em uso em ${otherDevice} (atividade ${lastSeen}). ` +
            `Faça logout no outro dispositivo ou aguarde 2 minutos sem atividade para liberar o acesso.`;

          toast({
            title: "Conta em uso",
            description: message,
            variant: "destructive",
            duration: 15000,
          });

          return { error: new Error(message), data: null };
        }
      } catch (lockExc) {
        console.warn("[useAuth] single-session check exception:", lockExc);
      }
      // ─── Fim do single-session ─────────────────────────────────────────

      toast({
        title: "Login realizado!",
        description: "Bem-vindo de volta.",
      });

      return { error: null, data };
    } catch (error: any) {
      toast({
        title: "Erro no login",
        description: error.message,
        variant: "destructive",
      });
      return { error, data: null };
    }
  };

  const signOut = async () => {
    try {
      // Libera o slot single-session ANTES do signOut para que outro device
      // possa logar imediatamente sem precisar esperar os 2min de stale.
      try {
        const sid = getOrCreateSessionId();
        await (supabase.rpc as any)("release_session", { p_session_id: sid });
      } catch (releaseErr) {
        console.warn("[useAuth] release_session failed:", releaseErr);
      }
      clearSessionId();
      // Força nova validação de instâncias no próximo login
      clearInstanceValidationCache();

      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      toast({
        title: "Logout realizado",
        description: "Até logo!",
      });
    } catch (error: any) {
      toast({
        title: "Erro no logout",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
  };
};
