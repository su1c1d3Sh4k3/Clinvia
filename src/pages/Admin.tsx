// @ts-nocheck - tabelas do painel admin ainda não estão nos types gerados
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUrlTab } from "@/hooks/useUrlTab";
import { useAdminUser } from "@/hooks/useAdminUser";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { ADMIN_PAGES, type AdminPage } from "@/lib/adminPermissions";
import AdminDashboard from "@/components/admin/sections/AdminDashboard";
import AdminClients from "@/components/admin/sections/AdminClients";
import AdminMonitoring from "@/components/admin/sections/AdminMonitoring";
import AdminTeam from "@/components/admin/sections/AdminTeam";
import AdminSupport from "@/components/admin/sections/AdminSupport";
import AdminUpdates from "@/components/admin/sections/AdminUpdates";

export default function Admin() {
    const navigate = useNavigate();
    const [tab, setTab] = useUrlTab("dashboard");
    const { identity, can, isLoading } = useAdminUser();

    // guard: super-admin OU admin_users ativo
    useEffect(() => {
        if (isLoading) return;
        if (!identity) {
            toast.error("Acesso negado");
            supabase.auth.signOut().finally(() => navigate("/admin-oath"));
        }
    }, [identity, isLoading, navigate]);

    const visiblePages = useMemo<AdminPage[]>(
        () => ADMIN_PAGES.map((p) => p.value).filter((p) => can(p, "view")),
        [can]
    );

    // chamados aguardando resposta do suporte (badge do menu)
    const { data: supportBadge = 0 } = useQuery({
        queryKey: ["admin-support-badge"],
        enabled: !!identity && visiblePages.includes("suporte"),
        refetchInterval: 60_000,
        queryFn: async () => {
            const { count, error } = await supabase
                .from("support_tickets")
                .select("id", { count: "exact", head: true })
                .in("status", ["open", "viewed"]);
            if (error) throw error;
            return count || 0;
        },
    });

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate("/admin-oath");
    };

    if (isLoading || !identity) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500" />
            </div>
        );
    }

    // aba pedida na URL sem permissão → cai na primeira permitida
    const activePage = (visiblePages.includes(tab as AdminPage)
        ? tab
        : visiblePages[0] || "dashboard") as AdminPage;

    const renderSection = () => {
        switch (activePage) {
            case "dashboard":
                return <AdminDashboard />;
            case "clientes":
                return <AdminClients canEdit={can("clientes", "edit")} />;
            case "monitoramento":
                return <AdminMonitoring canEdit={can("monitoramento", "edit")} />;
            case "equipe":
                return <AdminTeam canEdit={can("equipe", "edit")} />;
            case "suporte":
                return (
                    <AdminSupport
                        canEdit={can("suporte", "edit")}
                        agentName={identity.name}
                        adminUserId={identity.adminUser?.id ?? null}
                    />
                );
            case "atualizacoes":
                return <AdminUpdates canEdit={can("atualizacoes", "edit")} />;
            default:
                return null;
        }
    };

    if (visiblePages.length === 0) {
        return (
            <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-3 text-gray-300">
                <p>Seu usuário não tem acesso a nenhuma seção do painel.</p>
                <button onClick={handleLogout} className="text-sm text-red-400 hover:underline">
                    Sair
                </button>
            </div>
        );
    }

    return (
        <div className="h-screen flex bg-gray-900 overflow-hidden">
            <AdminSidebar
                active={activePage}
                onSelect={setTab}
                visiblePages={visiblePages}
                userName={identity.name}
                userEmail={identity.email}
                isSuperAdmin={identity.isSuperAdmin}
                supportBadge={supportBadge}
                onLogout={handleLogout}
            />
            <main className="flex-1 min-w-0 overflow-y-auto">
                <div className="p-4 sm:p-6">{renderSection()}</div>
            </main>
        </div>
    );
}
