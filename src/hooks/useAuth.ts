import { useState, useEffect } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
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
