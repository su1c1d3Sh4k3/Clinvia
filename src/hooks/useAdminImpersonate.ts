import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const IMPERSONATION_KEY = 'clinvia_impersonation';
const ADMIN_SESSION_KEY = 'clinvia_admin_session';

interface ImpersonationData {
    targetUserId: string;
    targetUserName: string;
    targetCompanyName: string | null;
    targetEmail: string;
    startedAt: string;
}

interface AdminSession {
    access_token: string;
    refresh_token: string;
}

export function useAdminImpersonate() {
    const navigate = useNavigate();
    const [isImpersonating, setIsImpersonating] = useState(false);
    const [impersonationData, setImpersonationData] = useState<ImpersonationData | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // Check impersonation state on mount — validate against current auth user
    useEffect(() => {
        const storedData = localStorage.getItem(IMPERSONATION_KEY);
        if (!storedData) return;

        try {
            const data = JSON.parse(storedData) as ImpersonationData;
            // CRITICAL: Only show the banner if the currently authenticated user
            // IS the impersonated target. Prevents stale localStorage from leaking
            // the banner to unrelated users logging in on the same browser.
            supabase.auth.getUser().then(({ data: userData }) => {
                if (userData.user?.id === data.targetUserId) {
                    setImpersonationData(data);
                    setIsImpersonating(true);
                } else {
                    // Stale impersonation data — clean up silently
                    localStorage.removeItem(IMPERSONATION_KEY);
                    localStorage.removeItem(ADMIN_SESSION_KEY);
                }
            });
        } catch {
            localStorage.removeItem(IMPERSONATION_KEY);
            localStorage.removeItem(ADMIN_SESSION_KEY);
        }
    }, []);

    // Also clear impersonation on auth state changes (logout, session change)
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_OUT') {
                localStorage.removeItem(IMPERSONATION_KEY);
                localStorage.removeItem(ADMIN_SESSION_KEY);
                setImpersonationData(null);
                setIsImpersonating(false);
            }
        });
        return () => subscription.unsubscribe();
    }, []);

    /**
     * Start impersonating a user via magic link redirect
     */
    const impersonate = useCallback(async (targetUserId: string) => {
        setIsLoading(true);

        try {
            // 1. Save current admin session
            const { data: currentSession } = await supabase.auth.getSession();
            if (!currentSession.session) {
                toast.error('Sessão expirada. Faça login novamente.');
                return false;
            }

            const adminSession: AdminSession = {
                access_token: currentSession.session.access_token,
                refresh_token: currentSession.session.refresh_token,
            };
            localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(adminSession));

            // 2. Call Edge Function to get magic link
            const { data, error } = await supabase.functions.invoke('admin-impersonate', {
                body: { target_user_id: targetUserId }
            });

            if (error || !data?.success) {
                toast.error(data?.error || 'Erro ao acessar como cliente');
                localStorage.removeItem(ADMIN_SESSION_KEY);
                return false;
            }

            const { magic_link, target_user } = data.data;

            // 3. Store impersonation data before redirect
            const impersonation: ImpersonationData = {
                targetUserId: target_user.id,
                targetUserName: target_user.full_name || 'Cliente',
                targetCompanyName: target_user.company_name,
                targetEmail: target_user.email,
                startedAt: new Date().toISOString()
            };
            localStorage.setItem(IMPERSONATION_KEY, JSON.stringify(impersonation));

            toast.success(`Redirecionando para ${impersonation.targetUserName}...`);

            // 4. Redirect to magic link URL
            // This will authenticate as the target user and redirect back to the app
            window.location.href = magic_link;
            return true;

        } catch (error: any) {
            toast.error('Erro: ' + error.message);
            localStorage.removeItem(ADMIN_SESSION_KEY);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Exit impersonation and return to admin
     */
    const exitImpersonation = useCallback(async () => {
        setIsLoading(true);

        try {
            // 1. Get saved admin session
            const adminSessionStr = localStorage.getItem(ADMIN_SESSION_KEY);
            if (!adminSessionStr) {
                toast.error('Sessão de admin não encontrada. Faça login novamente.');
                navigate('/admin-oath');
                return false;
            }

            const adminSession: AdminSession = JSON.parse(adminSessionStr);

            // 2. Restore admin session
            const { error } = await supabase.auth.setSession({
                access_token: adminSession.access_token,
                refresh_token: adminSession.refresh_token
            });

            if (error) {
                toast.error('Erro ao restaurar sessão: ' + error.message);
                navigate('/admin-oath');
                return false;
            }

            // 3. Clear impersonation data
            localStorage.removeItem(IMPERSONATION_KEY);
            localStorage.removeItem(ADMIN_SESSION_KEY);
            setImpersonationData(null);
            setIsImpersonating(false);

            toast.success('Voltou ao painel de admin');

            // 4. Navigate back to admin
            navigate('/admin');
            return true;

        } catch (error: any) {
            toast.error('Erro: ' + error.message);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [navigate]);

    return {
        isImpersonating,
        impersonationData,
        isLoading,
        impersonate,
        exitImpersonation
    };
}
