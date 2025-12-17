import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CRMDeal } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Plus, ArrowRight, Edit, StickyNote, DollarSign, Tag, Calendar, ChevronUp, User, AlertCircle, CalendarPlus } from "lucide-react";
import { CreateDealModal } from "./CreateDealModal";
import { EditDealModal } from "./EditDealModal";
import { DealNotesModal } from "./DealNotesModal";
import { TaskModal } from "@/components/tasks/TaskModal";
import { formatCurrency } from "@/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface CRMIntegrationSidebarProps {
    contactId: string;
    contactName: string;
    contactPhone?: string;
}

export function CRMIntegrationSidebar({ contactId, contactName, contactPhone }: CRMIntegrationSidebarProps) {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [selectedDeal, setSelectedDeal] = useState<CRMDeal | null>(null);
    const [selectedPreviousDealId, setSelectedPreviousDealId] = useState<string | null>(null);

    // Fetch ALL deals for this contact (not just the most recent)
    const { data: allDeals, isLoading, refetch } = useQuery({
        queryKey: ["crm-deals-contact", contactId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("crm_deals" as any)
                .select(`
                    *, 
                    contacts(push_name, number, profile_pic_url, contact_tags(tags(id, name, color))),
                    stage:crm_stages(id, name, color)
                `)
                .eq("contact_id", contactId)
                .order("created_at", { ascending: false });

            if (error && error.code !== 'PGRST116') throw error;
            return (data || []) as unknown as (CRMDeal & { stage?: { id: string; name: string; color: string } })[];
        },
        enabled: !!contactId,
    });

    // Separate deals into active and finished (Ganho/Perdido)
    const finishedDeals = allDeals?.filter(d =>
        d.stage?.name === 'Ganho' || d.stage?.name === 'Perdido'
    ) || [];

    const activeDeals = allDeals?.filter(d =>
        d.stage?.name !== 'Ganho' && d.stage?.name !== 'Perdido'
    ) || [];

    // Current deal: active deal if exists, otherwise null (show create option)
    const deal = activeDeals[0] || null;

    // Get the selected previous deal for display
    const selectedPreviousDeal = finishedDeals.find(d => d.id === selectedPreviousDealId) || null;

    // Fetch stages for quick move
    const { data: stages } = useQuery({
        queryKey: ["crm-stages", deal?.funnel_id],
        queryFn: async () => {
            if (!deal?.funnel_id) return [];
            const { data, error } = await supabase
                .from("crm_stages" as any)
                .select("*")
                .eq("funnel_id", deal.funnel_id)
                .order("position", { ascending: true });

            if (error) throw error;
            return data;
        },
        enabled: !!deal?.funnel_id,
    });

    const handleStageChange = async (stageId: string) => {
        if (!deal) return;
        try {
            const { error } = await supabase
                .from("crm_deals" as any)
                .update({ stage_id: stageId })
                .eq("id", deal.id);

            if (error) throw error;
            toast.success("Estágio atualizado!");
            refetch();
        } catch (error) {
            toast.error("Erro ao atualizar estágio");
        }
    };

    const [isOpen, setIsOpen] = useState(() => {
        const saved = localStorage.getItem("ai-sidebar-crm-open");
        return saved !== null ? JSON.parse(saved) : true;
    });

    useEffect(() => {
        localStorage.setItem("ai-sidebar-crm-open", JSON.stringify(isOpen));
    }, [isOpen]);

    const { data: session } = useQuery({
        queryKey: ["auth-session"],
        queryFn: async () => {
            const { data } = await supabase.auth.getSession();
            return data.session;
        },
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const priorityColor = {
        low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
        medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
        high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    };

    const priorityLabel = {
        low: "Baixa",
        medium: "Média",
        high: "Alta",
    };

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <Card className="bg-background/80">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            CRM

                        </CardTitle>
                        <CollapsibleTrigger asChild>
                            <Button variant="ghost" size="sm" className="w-9 p-0">
                                <ChevronUp className={`h-4 w-4 transition-transform ${isOpen ? "" : "rotate-180"}`} />
                            </Button>
                        </CollapsibleTrigger>
                    </div>
                </CardHeader>
                <CollapsibleContent>
                    <CardContent>
                        {deal ? (
                            <div className="space-y-4">
                                {/* Contact Info */}
                                <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                                    {deal.contacts?.profile_pic_url ? (
                                        <img
                                            src={deal.contacts.profile_pic_url}
                                            alt={deal.contacts.push_name}
                                            className="w-10 h-10 rounded-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                                            <User className="h-5 w-5" />
                                        </div>
                                    )}
                                    <div className="overflow-hidden">
                                        <p className="font-semibold text-sm truncate">{deal.contacts?.push_name || "Sem contato"}</p>
                                        <p className="text-xs text-muted-foreground truncate">{deal.contacts?.remote_jid?.split('@')[0]}</p>
                                    </div>
                                </div>

                                {/* Previous Deals Select - When active deal exists */}
                                {finishedDeals.length > 0 && (
                                    <div className="space-y-1">
                                        <label className="text-[10px] text-muted-foreground uppercase font-bold">
                                            Negociações Anteriores
                                        </label>
                                        <Select
                                            value={selectedPreviousDealId || ""}
                                            onValueChange={(val) => setSelectedPreviousDealId(val || null)}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue placeholder="Selecionar negociação" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {finishedDeals.map(d => (
                                                    <SelectItem key={d.id} value={d.id}>
                                                        <div className="flex items-center gap-2">
                                                            <div
                                                                className="w-2 h-2 rounded-full"
                                                                style={{ backgroundColor: d.stage?.color || '#888' }}
                                                            />
                                                            {d.title} - {formatCurrency(d.value)}
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {/* Display selected previous deal info (read-only) */}
                                        {selectedPreviousDeal && (
                                            <div className="mt-2 p-2 bg-muted/20 rounded-md border border-dashed space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-medium">{selectedPreviousDeal.title}</span>
                                                    <Badge variant="outline" className="text-[10px] h-5">
                                                        {selectedPreviousDeal.stage?.name}
                                                    </Badge>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                                    <span>Valor: {formatCurrency(selectedPreviousDeal.value)}</span>
                                                    <span>Prioridade: {selectedPreviousDeal.priority ? priorityLabel[selectedPreviousDeal.priority] : 'N/A'}</span>
                                                </div>
                                                <DealNotesModal
                                                    deal={selectedPreviousDeal as CRMDeal}
                                                    trigger={
                                                        <Button variant="ghost" size="sm" className="w-full h-6 text-xs gap-1">
                                                            <StickyNote className="h-3 w-3" />
                                                            Ver Notas
                                                        </Button>
                                                    }
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Key Details Grid */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                                            <DollarSign className="h-3 w-3" />
                                            Valor
                                        </div>
                                        <p className="text-sm font-semibold">{formatCurrency(deal.value)}</p>
                                    </div>

                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-1.5 text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                                            <AlertCircle className="h-3 w-3" />
                                            Prioridade
                                        </div>
                                        <Badge variant="outline" className={`border-0 px-1.5 py-0 text-[10px] h-5 ${deal.priority ? priorityColor[deal.priority] : ''}`}>
                                            {deal.priority ? priorityLabel[deal.priority] : "N/A"}
                                        </Badge>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] text-muted-foreground uppercase font-bold">Estágio</label>
                                    <Select value={deal.stage_id} onValueChange={handleStageChange}>
                                        <SelectTrigger className="h-8 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {stages?.map((stage: any) => (
                                                <SelectItem key={stage.id} value={stage.id}>
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                                                        {stage.name}
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full h-8 text-xs gap-2"
                                    onClick={() => setShowTaskModal(true)}
                                >
                                    <CalendarPlus className="h-3 w-3" />
                                    Criar Tarefa
                                </Button>

                                <div className="flex gap-2 pt-1">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="flex-1 h-8 text-xs gap-1"
                                        onClick={() => {
                                            setSelectedDeal(deal);
                                            setShowEditModal(true);
                                        }}
                                    >
                                        <Edit className="h-3 w-3" />
                                        Editar
                                    </Button>

                                    <DealNotesModal
                                        deal={deal}
                                        trigger={
                                            <Button variant="outline" size="sm" className="flex-1 h-8 text-xs gap-1">
                                                <StickyNote className="h-3 w-3" />
                                                Notas
                                            </Button>
                                        }
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg bg-muted/10 gap-3 text-center">
                                <div className="p-2 bg-primary/10 rounded-full">
                                    <Tag className="h-4 w-4 text-primary" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-xs font-medium">Nenhuma negociação</p>
                                    <p className="text-[10px] text-muted-foreground">Crie uma negociação para acompanhar.</p>
                                </div>
                                <Button size="sm" className="w-full gap-2 h-8 text-xs" onClick={() => setShowCreateModal(true)}>
                                    <Plus className="h-3 w-3" />
                                    Criar Negociação
                                </Button>

                                {/* Previous Deals Select - When no active deal */}
                                {finishedDeals.length > 0 && (
                                    <div className="space-y-1 mt-3 w-full">
                                        <label className="text-[10px] text-muted-foreground uppercase font-bold">
                                            Negociações Anteriores
                                        </label>
                                        <Select
                                            value={selectedPreviousDealId || ""}
                                            onValueChange={(val) => setSelectedPreviousDealId(val || null)}
                                        >
                                            <SelectTrigger className="h-8 text-xs w-full">
                                                <SelectValue placeholder="Selecionar negociação" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {finishedDeals.map(d => (
                                                    <SelectItem key={d.id} value={d.id}>
                                                        <div className="flex items-center gap-2">
                                                            <div
                                                                className="w-2 h-2 rounded-full"
                                                                style={{ backgroundColor: d.stage?.color || '#888' }}
                                                            />
                                                            {d.title} - {formatCurrency(d.value)}
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        {/* Display selected previous deal info (read-only) */}
                                        {selectedPreviousDeal && (
                                            <div className="mt-2 p-2 bg-muted/20 rounded-md border border-dashed space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-medium">{selectedPreviousDeal.title}</span>
                                                    <Badge variant="outline" className="text-[10px] h-5">
                                                        {selectedPreviousDeal.stage?.name}
                                                    </Badge>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                                    <span>Valor: {formatCurrency(selectedPreviousDeal.value)}</span>
                                                    <span>Prioridade: {selectedPreviousDeal.priority ? priorityLabel[selectedPreviousDeal.priority] : 'N/A'}</span>
                                                </div>
                                                <DealNotesModal
                                                    deal={selectedPreviousDeal as CRMDeal}
                                                    trigger={
                                                        <Button variant="ghost" size="sm" className="w-full h-6 text-xs gap-1">
                                                            <StickyNote className="h-3 w-3" />
                                                            Ver Notas
                                                        </Button>
                                                    }
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </CollapsibleContent>
            </Card>

            {/* Modals */}
            <CreateDealModal
                open={showCreateModal}
                onOpenChange={setShowCreateModal}
                defaultContact={{
                    id: contactId,
                    push_name: contactName,
                    remote_jid: contactPhone
                }}
                defaultResponsibleId={session?.user?.id}
            />

            {selectedDeal && (
                <EditDealModal
                    deal={selectedDeal}
                    open={showEditModal}
                    onOpenChange={setShowEditModal}
                />
            )}

            {deal && (
                <TaskModal
                    open={showTaskModal}
                    onOpenChange={setShowTaskModal}
                    initialDealId={deal.id}
                    initialContactId={deal.contact_id}
                />
            )}
        </Collapsible>
    );
}
