import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { startSuporteTour } from "@/lib/suporteTours";
import { Megaphone, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks/useUserRole";
import { usePermissions } from "@/hooks/usePermissions";
import { useCampaigns, Campaign } from "@/hooks/useCampaigns";
import { filterOutRecurrence } from "@/lib/recurrenceCampaigns";
import { useCampaignDashboardStats } from "@/hooks/useCampaignDashboard";
import { CampaignWizard } from "@/components/campaigns/CampaignWizard";
import { CampaignCard } from "@/components/campaigns/CampaignCard";
import { MetaQualityPanel } from "@/components/campaigns/MetaQualityPanel";

export default function Campaigns() {
    const navigate = useNavigate();
    const { data: userRole } = useUserRole();
    const { hasAnyAccess, canCreate, isReady } = usePermissions();
    const { data: allCampaigns, isLoading } = useCampaigns();
    // Campanhas de recorrência ficam FORA desta página (aba Recorrência da dash)
    const campaigns = filterOutRecurrence(allCampaigns || []);
    const { data: stats } = useCampaignDashboardStats({ mode: "all" });
    const [wizardOpen, setWizardOpen] = useState(false);
    const [editing, setEditing] = useState<Campaign | null>(null);
    const [resending, setResending] = useState<Campaign | null>(null);
    const [searchParams, setSearchParams] = useSearchParams();

    // Tour guiado vindo da página Suporte (?tour=nova-campanha)
    const tourId = searchParams.get("tour");
    useEffect(() => {
        if (!tourId || isLoading) return;
        // Aguarda a renderização dos alvos antes de iniciar o destaque
        const t = setTimeout(() => {
            startSuporteTour(tourId);
            setSearchParams({}, { replace: true });
        }, 400);
        return () => clearTimeout(t);
    }, [tourId, isLoading, setSearchParams]);

    // Acesso via matriz de permissões (admin sempre; supervisor liberado por padrão)
    useEffect(() => {
        if (userRole !== "admin" && isReady && !hasAnyAccess("campaigns")) {
            navigate("/", { replace: true });
        }
    }, [userRole, isReady, hasAnyAccess, navigate]);

    const openCreate = () => {
        setEditing(null);
        setResending(null);
        setWizardOpen(true);
    };

    const openEdit = (campaign: Campaign) => {
        setEditing(campaign);
        setResending(null);
        setWizardOpen(true);
    };

    const openResend = (campaign: Campaign) => {
        setEditing(null);
        setResending(campaign);
        setWizardOpen(true);
    };

    return (
        <div className="w-full p-4 md:p-8 space-y-4 md:space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div data-tour="campaigns-title">
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <Megaphone className="w-5 h-5 text-primary" /> Campanhas
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Disparos em massa de templates Meta com atendimento por IA
                    </p>
                </div>
                {(userRole === "admin" || canCreate("campaigns")) && (
                    <Button onClick={openCreate} data-tour="new-campaign">
                        <Plus className="w-4 h-4 mr-1.5" /> Nova campanha
                    </Button>
                )}
            </div>

            <div data-tour="meta-quality">
                <MetaQualityPanel />
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> Carregando campanhas...
                </div>
            ) : (campaigns || []).length === 0 ? (
                <div data-tour="campaign-list" className="border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
                    <Megaphone className="w-10 h-10 text-muted-foreground/50" />
                    <div>
                        <p className="font-medium">Nenhuma campanha ainda</p>
                        <p className="text-sm text-muted-foreground max-w-sm">
                            Crie sua primeira campanha: escolha a audiência, escreva a mensagem e agende o
                            disparo em massa via WhatsApp API (Meta).
                        </p>
                    </div>
                    {(userRole === "admin" || canCreate("campaigns")) && (
                        <Button onClick={openCreate}>
                            <Plus className="w-4 h-4 mr-1.5" /> Criar campanha
                        </Button>
                    )}
                </div>
            ) : (
                <div data-tour="campaign-list" className="space-y-3">
                    {(campaigns || []).map((c) => (
                        <CampaignCard
                            key={c.id}
                            campaign={c}
                            stats={(stats || []).find((s) => s.campaign_id === c.id)}
                            onEdit={openEdit}
                            onResend={openResend}
                        />
                    ))}
                </div>
            )}

            <CampaignWizard
                open={wizardOpen}
                onOpenChange={(o) => {
                    setWizardOpen(o);
                    if (!o) setResending(null);
                }}
                campaign={editing}
                resendFrom={resending}
            />
        </div>
    );
}
