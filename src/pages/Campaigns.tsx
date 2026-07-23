import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Megaphone, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks/useUserRole";
import { useCampaigns, Campaign } from "@/hooks/useCampaigns";
import { CampaignWizard } from "@/components/campaigns/CampaignWizard";
import { CampaignCard } from "@/components/campaigns/CampaignCard";

export default function Campaigns() {
    const navigate = useNavigate();
    const { data: userRole } = useUserRole();
    const { data: campaigns, isLoading } = useCampaigns();
    const [wizardOpen, setWizardOpen] = useState(false);
    const [editing, setEditing] = useState<Campaign | null>(null);

    // Agentes não acessam campanhas
    useEffect(() => {
        if (userRole === "agent") {
            navigate("/", { replace: true });
        }
    }, [userRole, navigate]);

    const openCreate = () => {
        setEditing(null);
        setWizardOpen(true);
    };

    const openEdit = (campaign: Campaign) => {
        setEditing(campaign);
        setWizardOpen(true);
    };

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-4 md:space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <Megaphone className="w-5 h-5 text-primary" /> Campanhas
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Disparos em massa de templates Meta com atendimento por IA
                    </p>
                </div>
                <Button onClick={openCreate}>
                    <Plus className="w-4 h-4 mr-1.5" /> Nova campanha
                </Button>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> Carregando campanhas...
                </div>
            ) : (campaigns || []).length === 0 ? (
                <div className="border-2 border-dashed rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
                    <Megaphone className="w-10 h-10 text-muted-foreground/50" />
                    <div>
                        <p className="font-medium">Nenhuma campanha ainda</p>
                        <p className="text-sm text-muted-foreground max-w-sm">
                            Crie sua primeira campanha: escolha a audiência, escreva a mensagem e agende o
                            disparo em massa via WhatsApp API (Meta).
                        </p>
                    </div>
                    <Button onClick={openCreate}>
                        <Plus className="w-4 h-4 mr-1.5" /> Criar campanha
                    </Button>
                </div>
            ) : (
                <div className="space-y-3">
                    {(campaigns || []).map((c) => (
                        <CampaignCard key={c.id} campaign={c} onEdit={openEdit} />
                    ))}
                </div>
            )}

            <CampaignWizard open={wizardOpen} onOpenChange={setWizardOpen} campaign={editing} />
        </div>
    );
}
