// DealDetailModal.tsx — Painel completo de negociação CRM
// Layout: Dialog max-w-6xl com duas colunas scrolláveis
// Esquerda: conteúdo principal | Direita: barra de ações

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CRMDeal, CRMFunnel, CRMStage, CRMDealAttachment, CRMDealHistory } from "@/types/crm";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
    X, CheckCircle2, XCircle, StickyNote, Plus, User, Phone, Mail,
    Building2, Instagram, Tag, Calendar, Clock, Paperclip, Download,
    Trash2, ArrowRightLeft, MessageSquare, CalendarPlus,
    ChevronRight, ChevronDown, History, FileText, Briefcase,
    AlertCircle, CreditCard, Layers,
} from "lucide-react";
import { FaInstagram, FaWhatsapp } from "react-icons/fa";
import { format, formatDistanceToNow, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useStaff } from "@/hooks/useStaff";
import { ProductItem } from "./DealProductsForm";
import { DealProductsModal } from "./DealProductsModal";
import { DealConversationModal } from "./DealConversationModal";
import { TaskModal } from "../tasks/TaskModal";
import { PaymentTypeModal } from "./PaymentTypeModal";
import { LossReasonModal } from "./LossReasonModal";
import { MoveToCRMStageModal } from "./MoveToCRMStageModal";
import { DeliveryLaunchModal } from "@/components/delivery/DeliveryLaunchModal";

interface DealDetailModalProps {
    deal: CRMDeal;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
    low: "#22c55e",
    medium: "#eab308",
    high: "#ef4444",
};

const EVENT_LABELS: Record<string, string> = {
    stage_change: "Mudança de etapa",
    funnel_change: "Mudança de funil",
    field_update: "Campo atualizado",
    note_added: "Nota adicionada",
    attachment_added: "Anexo adicionado",
    created: "Negociação criada",
    won: "Negociação ganha",
    lost: "Negociação perdida",
};

// ────────────────────────────────────────────────────────────────────────────
// Hook para produtos do deal
// ────────────────────────────────────────────────────────────────────────────
function useDealProducts(dealId: string) {
    return useQuery({
        queryKey: ["deal-products", dealId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("crm_deal_products" as any)
                .select("*, product_service:products_services(id,name,type,price)")
                .eq("deal_id", dealId);
            if (error) throw error;
            return data as any[];
        },
        enabled: !!dealId,
    });
}

// ────────────────────────────────────────────────────────────────────────────
// Seção colapsável reutilizável
// ────────────────────────────────────────────────────────────────────────────
function Section({ icon: Icon, title, defaultOpen = true, children }: {
    icon: React.ElementType;
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border rounded-lg overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
            >
                <span className="flex items-center gap-2 font-medium text-sm">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {title}
                </span>
                {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
            {open && <div className="px-4 py-3">{children}</div>}
        </div>
    );
}

// ────────────────────────────────────────────────────────────────────────────
// Componente principal
// ────────────────────────────────────────────────────────────────────────────
export function DealDetailModal({ deal, open, onOpenChange }: DealDetailModalProps) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const { data: staffMembers = [] } = useStaff();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Local state (description with debounce)
    const [description, setDescription] = useState(deal.description || "");
    const [newNote, setNewNote] = useState("");
    const [expandedNote, setExpandedNote] = useState<number | null>(null);
    const [showMoveSelect, setShowMoveSelect] = useState(false);
    const [pendingTargetFunnel, setPendingTargetFunnel] = useState<CRMFunnel | null>(null);

    // Sub-modal states
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [lossReasonModalOpen, setLossReasonModalOpen] = useState(false);
    const [pendingWonDeal, setPendingWonDeal] = useState<any>(null);
    const [isCreatingSales, setIsCreatingSales] = useState(false);
    const [deliveryLaunchOpen, setDeliveryLaunchOpen] = useState(false);
    const [deliveryLaunchData, setDeliveryLaunchData] = useState<any>(null);
    const [moveStageModalOpen, setMoveStageModalOpen] = useState(false);

    // Reset description when deal changes
    useEffect(() => {
        setDescription(deal.description || "");
    }, [deal.id, deal.description]);

    // ── Queries ──────────────────────────────────────────────────────────────

    const { data: stages = [] } = useQuery({
        queryKey: ["crm-stages", deal.funnel_id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("crm_stages" as any)
                .select("*")
                .eq("funnel_id", deal.funnel_id)
                .order("position", { ascending: true });
            if (error) throw error;
            return data as unknown as CRMStage[];
        },
        enabled: open,
    });

    const { data: allStages = [] } = useQuery({
        queryKey: ["crm-all-stages"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("crm_stages" as any)
                .select("id,name,funnel_id");
            if (error) throw error;
            return data as unknown as { id: string; name: string; funnel_id: string }[];
        },
        enabled: open,
    });

    const { data: funnels = [] } = useQuery({
        queryKey: ["crm-funnels"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("crm_funnels" as any)
                .select("*")
                .eq("is_active", true)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data as unknown as CRMFunnel[];
        },
        enabled: open,
    });

    const { data: existingProducts } = useDealProducts(deal.id);

    const { data: professionals = [] } = useQuery({
        queryKey: ["professionals"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("professionals" as any)
                .select("id,name,role")
                .order("name", { ascending: true });
            if (error) throw error;
            return data as { id: string; name: string; role?: string }[];
        },
        enabled: open,
    });

    const { data: fullContact } = useQuery({
        queryKey: ["contact-full", deal.contact_id],
        queryFn: async () => {
            if (!deal.contact_id) return null;
            const { data, error } = await supabase
                .from("contacts" as any)
                .select("*, contact_tags(tags(id,name,color))")
                .eq("id", deal.contact_id)
                .single();
            if (error) return null;
            return data as any;
        },
        enabled: open && !!deal.contact_id,
    });

    const { data: tasks = [] } = useQuery({
        queryKey: ["deal-tasks", deal.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tasks" as any)
                .select("id,title,urgency,due_date,status,type,start_time")
                .eq("crm_deal_id", deal.id)
                .order("due_date", { ascending: true });
            if (error) throw error;
            return data as any[];
        },
        enabled: open,
    });

    const { data: appointments = [] } = useQuery({
        queryKey: ["contact-appointments", deal.contact_id],
        queryFn: async () => {
            if (!deal.contact_id) return [];
            const { data, error } = await supabase
                .from("appointments" as any)
                .select("id,start_time,end_time,status,service_id,professional_id,professionals(name),products_services(name)")
                .eq("contact_id", deal.contact_id)
                .order("start_time", { ascending: false })
                .limit(10);
            if (error) throw error;
            return data as any[];
        },
        enabled: open && !!deal.contact_id,
    });

    const { data: attachments = [], refetch: refetchAttachments } = useQuery({
        queryKey: ["deal-attachments", deal.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("crm_deal_attachments" as any)
                .select("*")
                .eq("deal_id", deal.id)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data as unknown as CRMDealAttachment[];
        },
        enabled: open,
    });

    const { data: history = [] } = useQuery({
        queryKey: ["deal-history", deal.id],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("crm_deal_history" as any)
                .select("*")
                .eq("deal_id", deal.id)
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data as unknown as CRMDealHistory[];
        },
        enabled: open,
    });

    const { data: otherDeals = [] } = useQuery({
        queryKey: ["contact-other-deals", deal.contact_id, deal.id],
        queryFn: async () => {
            if (!deal.contact_id) return [];
            const { data, error } = await supabase
                .from("crm_deals" as any)
                .select("id,title,value,stage_id,funnel_id")
                .eq("contact_id", deal.contact_id)
                .neq("id", deal.id)
                .order("created_at", { ascending: false })
                .limit(10);
            if (error) throw error;
            return data as any[];
        },
        enabled: open && !!deal.contact_id,
    });

    // Produtos derivados diretamente da query (fonte de verdade)
    const displayProducts: ProductItem[] = (existingProducts ?? []).map((p: any) => ({
        id: p.id,
        category: p.product_service?.type || "product",
        productServiceId: p.product_service_id,
        quantity: p.quantity,
        unitPrice: p.unit_price,
        name: p.product_service?.name,
    }));

    // ── Mutations ─────────────────────────────────────────────────────────────

    const updateDescriptionMutation = useMutation({
        mutationFn: async (desc: string) => {
            const { error } = await supabase
                .from("crm_deals" as any)
                .update({ description: desc, updated_at: new Date().toISOString() })
                .eq("id", deal.id);
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-deals"] }),
    });

    // Debounced description save
    const descTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handleDescriptionChange = useCallback((value: string) => {
        setDescription(value);
        if (descTimerRef.current) clearTimeout(descTimerRef.current);
        descTimerRef.current = setTimeout(() => {
            updateDescriptionMutation.mutate(value);
        }, 1200);
    }, []);

    const updateStageMutation = useMutation({
        mutationFn: async (stageId: string) => {
            const { error } = await supabase
                .from("crm_deals" as any)
                .update({ stage_id: stageId, stage_changed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
                .eq("id", deal.id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
            queryClient.invalidateQueries({ queryKey: ["deal-history", deal.id] });
        },
    });

    const updateResponsibleMutation = useMutation({
        mutationFn: async (responsibleId: string) => {
            const { error } = await supabase
                .from("crm_deals" as any)
                .update({ responsible_id: responsibleId || null, updated_at: new Date().toISOString() })
                .eq("id", deal.id);
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-deals"] }),
    });

    const updateProfessionalMutation = useMutation({
        mutationFn: async (profId: string) => {
            const { error } = await supabase
                .from("crm_deals" as any)
                .update({ assigned_professional_id: profId || null, updated_at: new Date().toISOString() })
                .eq("id", deal.id);
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["crm-deals"] }),
    });

    const [dealProductsModalOpen, setDealProductsModalOpen] = useState(false);

    const addNoteMutation = useMutation({
        mutationFn: async (noteText: string) => {
            if (!user) throw new Error("Não autenticado");
            let userName = user.email;
            const { data: tm } = await supabase.from("team_members").select("name").eq("user_id", user.id).single();
            if (tm?.name) userName = tm.name;

            const noteObj = { data: new Date().toISOString(), usuario: userName || "Usuário", nota: noteText.trim() };
            const currentNotes = Array.isArray(deal.notes) ? deal.notes : [];
            const updatedNotes = [...currentNotes, noteObj];

            const { error } = await supabase.from("crm_deals" as any).update({ notes: updatedNotes }).eq("id", deal.id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Nota adicionada!");
            setNewNote("");
            queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
        },
        onError: () => toast.error("Erro ao adicionar nota"),
    });

    // ── Ganho / Perdido ───────────────────────────────────────────────────────

    const handleWon = async () => {
        // Busca etapa "Ganho" no funil atual ou em qualquer funil do sistema
        const wonStageId = stages.find(s => s.name === "Ganho")?.id
            || allStages.find(s => s.name === "Ganho")?.id;

        if (wonStageId) {
            await updateStageMutation.mutateAsync(wonStageId);
        }

        const { data: fullDeal } = await supabase
            .from("crm_deals" as any)
            .select("*, product_service:products_services(id,name,type,price), assigned_professional:professionals(id,name,role), deal_products:crm_deal_products(*, product_service:products_services(id,name,type,price))")
            .eq("id", deal.id)
            .single();

        if (fullDeal) {
            const prods = (fullDeal as any).deal_products?.length > 0
                ? (fullDeal as any).deal_products
                : ((fullDeal as any).product_service_id ? [{ product_service_id: (fullDeal as any).product_service_id, quantity: (fullDeal as any).quantity || 1, unit_price: (fullDeal as any).product_service?.price || 0, product_service: (fullDeal as any).product_service }] : []);
            setPendingWonDeal({ deal: fullDeal, totalValue: (fullDeal as any).value || 0, productsCount: prods.length, products: prods });
            setPaymentModalOpen(true);
        }
    };

    const handleLost = () => setLossReasonModalOpen(true);

    const createSalesFromDeal = async (paymentType: 'cash' | 'installment' | 'pending', installments?: number, interestRate?: number) => {
        if (!pendingWonDeal) return;
        setIsCreatingSales(true);
        try {
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) throw new Error("Não autenticado");

            const { deal: d, products: prods } = pendingWonDeal;
            const saleDate = new Date().toISOString().split("T")[0];
            const validProds = prods.filter((p: any) => p.product_service_id);

            if (validProds.length === 0) { toast.warning("Sem produto/serviço vinculado"); return; }

            await supabase.from("sales" as any).insert(
                validProds.map((p: any) => ({
                    user_id: userData.user.id,
                    category: p.product_service?.type === "service" ? "service" : "product",
                    product_service_id: p.product_service_id,
                    quantity: p.quantity || 1,
                    unit_price: p.unit_price || 0,
                    total_amount: (p.unit_price || 0) * (p.quantity || 1),
                    payment_type: paymentType,
                    installments: paymentType === "installment" ? (installments || 1) : 1,
                    interest_rate: paymentType === "installment" ? (interestRate || 0) : 0,
                    sale_date: saleDate,
                    team_member_id: d.responsible_id || null,
                    professional_id: d.assigned_professional_id || null,
                    contact_id: d.contact_id || null,
                    notes: `Venda gerada da negociação: ${d.title}`,
                }))
            );

            toast.success("Negociação marcada como ganha!");
            queryClient.invalidateQueries({ queryKey: ["sales"] });
            queryClient.invalidateQueries({ queryKey: ["crm-deals"] });

            const serviceItems = validProds.filter((p: any) => p.product_service?.type === "service");
            if (serviceItems.length > 0 && d.contact_id) {
                setDeliveryLaunchData({ contactId: d.contact_id, dealProducts: serviceItems, dealTitle: d.title, saleDate });
                setDeliveryLaunchOpen(true);
            }
        } catch (err: any) {
            toast.error("Erro ao criar venda: " + err.message);
        } finally {
            setIsCreatingSales(false);
            setPaymentModalOpen(false);
            setPendingWonDeal(null);
        }
    };

    const handleLossConfirm = async (reason: string, otherDesc?: string) => {
        // Busca etapa "Perdido" no funil atual ou em qualquer funil do sistema
        const lostStageId = stages.find(s => s.name === "Perdido")?.id
            || allStages.find(s => s.name === "Perdido")?.id;

        const updateData: Record<string, any> = { loss_reason: reason, updated_at: new Date().toISOString() };
        if (lostStageId) updateData.stage_id = lostStageId;
        if (reason === "other" && otherDesc) updateData.loss_reason_other = otherDesc;

        const { error } = await supabase.from("crm_deals" as any).update(updateData).eq("id", deal.id);
        if (error) { toast.error("Erro ao registrar perda"); return; }

        toast.success("Negociação marcada como perdida");
        queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
        setLossReasonModalOpen(false);
    };

    // ── Attachments ───────────────────────────────────────────────────────────

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user) return;

        const path = `deal-attachments/${deal.id}/${Date.now()}_${file.name}`;
        const { error: uploadError } = await supabase.storage.from("deal-attachments").upload(path, file);
        if (uploadError) { toast.error("Erro no upload: " + uploadError.message); return; }

        const { data: { publicUrl } } = supabase.storage.from("deal-attachments").getPublicUrl(path);

        const { error: insertError } = await supabase.from("crm_deal_attachments" as any).insert({
            deal_id: deal.id,
            user_id: user.id,
            file_name: file.name,
            file_url: publicUrl,
            file_type: file.type,
            file_size: file.size,
        });

        if (insertError) { toast.error("Erro ao salvar anexo"); return; }

        toast.success("Arquivo anexado!");
        refetchAttachments();
        if (e.target) e.target.value = "";
    };

    const deleteAttachment = async (att: CRMDealAttachment) => {
        if (!confirm(`Remover "${att.file_name}"?`)) return;
        await supabase.from("crm_deal_attachments" as any).delete().eq("id", att.id);
        refetchAttachments();
        toast.success("Anexo removido");
    };

    // ── Helpers ───────────────────────────────────────────────────────────────

    const formatFileSize = (bytes?: number) => {
        if (!bytes) return "";
        if (bytes < 1024) return bytes + "B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + "KB";
        return (bytes / (1024 * 1024)).toFixed(1) + "MB";
    };

    const normalizedNotes = Array.isArray(deal.notes) ? deal.notes : [];
    const priorityColor = deal.priority ? PRIORITY_COLORS[deal.priority] : "#6366f1";

    const stagnationDays = (() => {
        if (!deal.stage_changed_at) return null;
        return differenceInCalendarDays(new Date(), new Date(deal.stage_changed_at));
    })();

    const getStageName = (stageId: string) => allStages.find(s => s.id === stageId)?.name || stageId;
    const getFunnelName = (funnelId: string) => funnels.find(f => f.id === funnelId)?.name || funnelId;

    const otherFunnels = funnels.filter(f => f.id !== deal.funnel_id);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className="max-w-6xl w-full p-0 gap-0 overflow-hidden"
                    style={{ height: "90vh", maxHeight: "90vh" }}
                >
                    <DialogTitle className="sr-only">{deal.title}</DialogTitle>
                    {/* ── Header ── */}
                    <div
                        className="flex items-center gap-3 px-5 py-3 border-b bg-card shrink-0"
                        style={{ borderTop: `4px solid ${priorityColor}` }}
                    >
                        {deal.contacts?.profile_pic_url ? (
                            <img src={deal.contacts.profile_pic_url} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                        ) : (
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                                {deal.contacts?.push_name?.[0]?.toUpperCase() || "?"}
                            </div>
                        )}

                        <div className="flex-1 min-w-0">
                            <h2 className="font-semibold text-base truncate">{deal.title}</h2>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    Criado {format(new Date(deal.created_at), "dd/MM/yyyy", { locale: ptBR })}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Atualizado {formatDistanceToNow(new Date(deal.updated_at), { locale: ptBR, addSuffix: true })}
                                </span>
                                {stagnationDays !== null && stagnationDays > 0 && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 h-4 bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400">
                                        <AlertCircle className="h-2.5 w-2.5 mr-1" />
                                        {stagnationDays}d na etapa
                                    </Badge>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* ── Body ── */}
                    <div className="flex flex-1 overflow-hidden">
                        {/* ── Main content (scroll) ── */}
                        <ScrollArea className="flex-1 h-full">
                            <div className="p-5 space-y-4">

                                {/* Descrição */}
                                <Section icon={FileText} title="Descrição">
                                    <Textarea
                                        placeholder="Adicione uma descrição, observações ou notas sobre esta negociação..."
                                        value={description}
                                        onChange={e => handleDescriptionChange(e.target.value)}
                                        className="min-h-[100px] resize-none text-sm"
                                    />
                                    {updateDescriptionMutation.isPending && (
                                        <p className="text-xs text-muted-foreground mt-1">Salvando...</p>
                                    )}
                                </Section>

                                {/* Notas */}
                                <Section icon={StickyNote} title={`Notas (${normalizedNotes.length})`}>
                                    <div className="space-y-3">
                                        {normalizedNotes.length === 0 && (
                                            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma nota adicionada</p>
                                        )}
                                        {[...normalizedNotes].reverse().map((note: any, idx) => (
                                            <div key={idx} className="border rounded-lg p-3 bg-muted/20 space-y-1 cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => setExpandedNote(expandedNote === idx ? null : idx)}>
                                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1 font-medium">
                                                        <User className="h-3 w-3" />{note.usuario}
                                                    </span>
                                                    <span>{note.data && !isNaN(new Date(note.data).getTime()) ? format(new Date(note.data), "dd/MM/yy HH:mm", { locale: ptBR }) : ""}</span>
                                                </div>
                                                <p className={`text-sm ${expandedNote === idx ? "whitespace-pre-wrap" : "line-clamp-2"}`}>{note.nota}</p>
                                            </div>
                                        ))}

                                        <div className="space-y-2 pt-2 border-t">
                                            <Textarea
                                                placeholder="Nova nota..."
                                                value={newNote}
                                                onChange={e => setNewNote(e.target.value)}
                                                className="min-h-[70px] resize-none text-sm"
                                            />
                                            <Button
                                                size="sm"
                                                disabled={!newNote.trim() || addNoteMutation.isPending}
                                                onClick={() => addNoteMutation.mutate(newNote)}
                                                className="h-7 text-xs"
                                            >
                                                <Plus className="h-3 w-3 mr-1" />
                                                Adicionar Nota
                                            </Button>
                                        </div>
                                    </div>
                                </Section>

                                {/* Informações do Contato */}
                                <Section icon={User} title="Informações do Contato">
                                    {!fullContact ? (
                                        <p className="text-sm text-muted-foreground">Nenhum contato vinculado</p>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                            <div className="col-span-2 flex items-center gap-3 pb-2 border-b">
                                                {fullContact.profile_pic_url ? (
                                                    <img src={fullContact.profile_pic_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                                                        {fullContact.push_name?.[0]?.toUpperCase() || "?"}
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="font-semibold">{fullContact.push_name}</p>
                                                    {fullContact.instagram_id ? (
                                                        <FaInstagram className="h-3.5 w-3.5 text-pink-500" />
                                                    ) : (
                                                        <FaWhatsapp className="h-3.5 w-3.5 text-green-500" />
                                                    )}
                                                </div>
                                            </div>

                                            {(fullContact.number || fullContact.phone) && (
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <Phone className="h-3.5 w-3.5 shrink-0" />
                                                    <span>{fullContact.number || fullContact.phone}</span>
                                                </div>
                                            )}
                                            {fullContact.email && (
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <Mail className="h-3.5 w-3.5 shrink-0" />
                                                    <span className="truncate">{fullContact.email}</span>
                                                </div>
                                            )}
                                            {fullContact.company && (
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                                                    <span>{fullContact.company}</span>
                                                </div>
                                            )}
                                            {fullContact.instagram && (
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <Instagram className="h-3.5 w-3.5 shrink-0" />
                                                    <span>{fullContact.instagram}</span>
                                                </div>
                                            )}
                                            {fullContact.cpf && (
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <CreditCard className="h-3.5 w-3.5 shrink-0" />
                                                    <span>{fullContact.cpf}</span>
                                                </div>
                                            )}
                                            {fullContact.contact_tags?.length > 0 && (
                                                <div className="col-span-2 flex flex-wrap gap-1 pt-1">
                                                    {fullContact.contact_tags.map((ct: any, i: number) => (
                                                        <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted">
                                                            <Tag className="h-2.5 w-2.5" style={{ color: ct.tags?.color }} />
                                                            {ct.tags?.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </Section>

                                {/* Tarefas */}
                                <Section icon={CheckCircle2} title={`Tarefas (${tasks.length})`}>
                                    <div className="space-y-2">
                                        {tasks.length === 0 ? (
                                            <p className="text-sm text-muted-foreground text-center py-2">Nenhuma tarefa</p>
                                        ) : (
                                            tasks.map((task: any) => (
                                                <div key={task.id} className="flex items-center gap-2 p-2 border rounded-lg text-sm">
                                                    <span className={`w-2 h-2 rounded-full shrink-0 ${task.urgency === "high" ? "bg-red-500" : task.urgency === "medium" ? "bg-yellow-500" : "bg-green-500"}`} />
                                                    <span className="flex-1 truncate">{task.title}</span>
                                                    {task.due_date && (
                                                        <span className="text-xs text-muted-foreground shrink-0">
                                                            {format(new Date(task.due_date), "dd/MM", { locale: ptBR })}
                                                        </span>
                                                    )}
                                                    <Badge variant="outline" className="text-[10px] h-4 shrink-0">
                                                        {task.status === "finished" ? "Concluída" : task.status === "open" ? "Aberta" : "Pendente"}
                                                    </Badge>
                                                </div>
                                            ))
                                        )}
                                        <Button size="sm" variant="outline" className="w-full h-7 text-xs border-dashed" onClick={() => setShowTaskModal(true)}>
                                            <Plus className="h-3 w-3 mr-1" />Nova Tarefa
                                        </Button>
                                    </div>
                                </Section>

                                {/* Agendamentos */}
                                <Section icon={Calendar} title={`Agendamentos (${appointments.length})`} defaultOpen={false}>
                                    <div className="space-y-2">
                                        {appointments.length === 0 ? (
                                            <p className="text-sm text-muted-foreground text-center py-2">Nenhum agendamento</p>
                                        ) : (
                                            appointments.map((apt: any) => (
                                                <div key={apt.id} className="flex items-center gap-2 p-2 border rounded-lg text-sm">
                                                    <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="truncate">{apt.products_services?.name || "Agendamento"}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {format(new Date(apt.start_time), "dd/MM/yy HH:mm", { locale: ptBR })}
                                                            {apt.professionals?.name && ` · ${apt.professionals.name}`}
                                                        </p>
                                                    </div>
                                                    <Badge variant="outline" className="text-[10px] h-4 shrink-0">{apt.status}</Badge>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </Section>

                                {/* Anexos */}
                                <Section icon={Paperclip} title={`Anexos (${attachments.length})`} defaultOpen={false}>
                                    <div className="space-y-3">
                                        <div
                                            className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <Paperclip className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                                            <p className="text-sm text-muted-foreground">Clique ou arraste para anexar</p>
                                            <p className="text-xs text-muted-foreground mt-1">Limite: 50MB por arquivo</p>
                                        </div>
                                        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />

                                        {attachments.map(att => (
                                            <div key={att.id} className="flex items-center gap-2 p-2 border rounded-lg">
                                                <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm truncate">{att.file_name}</p>
                                                    {att.file_size && <p className="text-xs text-muted-foreground">{formatFileSize(att.file_size)}</p>}
                                                </div>
                                                <a href={att.file_url} target="_blank" rel="noopener noreferrer">
                                                    <Button variant="ghost" size="icon" className="h-7 w-7"><Download className="h-3.5 w-3.5" /></Button>
                                                </a>
                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteAttachment(att)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </Section>

                                {/* Histórico */}
                                <Section icon={History} title="Histórico de Negociação" defaultOpen={false}>
                                    <div className="space-y-0">
                                        {history.length === 0 ? (
                                            <p className="text-sm text-muted-foreground text-center py-4">Nenhum evento registrado</p>
                                        ) : (
                                            history.map((evt, idx) => (
                                                <div key={evt.id} className="flex gap-3 pb-4">
                                                    <div className="flex flex-col items-center">
                                                        <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                                                        {idx < history.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
                                                    </div>
                                                    <div className="flex-1 pb-1">
                                                        <p className="text-sm font-medium">{EVENT_LABELS[evt.event_type] || evt.event_type}</p>
                                                        {evt.event_type === "stage_change" && (
                                                            <p className="text-xs text-muted-foreground">
                                                                {getStageName(evt.old_value || "")} → {getStageName(evt.new_value || "")}
                                                            </p>
                                                        )}
                                                        {evt.event_type === "funnel_change" && (
                                                            <p className="text-xs text-muted-foreground">
                                                                {getFunnelName(evt.old_value || "")} → {getFunnelName(evt.new_value || "")}
                                                            </p>
                                                        )}
                                                        {evt.event_type === "field_update" && (
                                                            <p className="text-xs text-muted-foreground">
                                                                {(evt.metadata as any)?.field}: {evt.old_value} → {evt.new_value}
                                                            </p>
                                                        )}
                                                        <p className="text-xs text-muted-foreground mt-0.5">
                                                            {format(new Date(evt.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </Section>

                                {/* Negociações do Cliente */}
                                {otherDeals.length > 0 && (
                                    <Section icon={Layers} title={`Outras Negociações do Cliente (${otherDeals.length})`} defaultOpen={false}>
                                        <div className="space-y-2">
                                            {otherDeals.map((od: any) => (
                                                <div key={od.id} className="flex items-center gap-2 p-2 border rounded-lg text-sm cursor-default">
                                                    <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" />
                                                    <span className="flex-1 truncate">{od.title}</span>
                                                    {od.value > 0 && (
                                                        <span className="text-xs text-muted-foreground shrink-0">
                                                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(od.value)}
                                                        </span>
                                                    )}
                                                    <Badge variant="outline" className="text-[10px] h-4 shrink-0">
                                                        {getStageName(od.stage_id)}
                                                    </Badge>
                                                </div>
                                            ))}
                                        </div>
                                    </Section>
                                )}
                            </div>
                        </ScrollArea>

                        {/* ── Right Sidebar ── */}
                        <div className="w-72 border-l shrink-0 flex flex-col overflow-hidden">
                            <ScrollArea className="flex-1 h-full">
                                <div className="p-4 space-y-4 min-w-0 overflow-hidden">

                                    {/* Container Finalizar */}
                                    <div className="space-y-2">
                                        <Label className="text-xs uppercase text-muted-foreground tracking-wider">Finalizar</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white h-8 text-xs" onClick={handleWon}>
                                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Ganho
                                            </Button>
                                            <Button size="sm" variant="outline" className="border-red-400 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 h-8 text-xs" onClick={handleLost}>
                                                <XCircle className="h-3.5 w-3.5 mr-1" />Perdido
                                            </Button>
                                        </div>
                                    </div>

                                    <Separator />

                                    {/* Container Etapa */}
                                    <div className="space-y-2">
                                        <Label className="text-xs uppercase text-muted-foreground tracking-wider">Etapa</Label>
                                        <Select
                                            value={deal.stage_id}
                                            onValueChange={val => updateStageMutation.mutate(val)}
                                        >
                                            <SelectTrigger className="h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {stages.map(s => (
                                                    <SelectItem key={s.id} value={s.id} className="text-xs">
                                                        <span className="flex items-center gap-1.5">
                                                            <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: s.color }} />
                                                            {s.name}
                                                        </span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <Separator />

                                    {/* Container Responsáveis */}
                                    <div className="space-y-2">
                                        <Label className="text-xs uppercase text-muted-foreground tracking-wider">Responsáveis</Label>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs text-muted-foreground">Responsável</Label>
                                            <Select
                                                value={deal.responsible_id || "_none"}
                                                onValueChange={val => updateResponsibleMutation.mutate(val === "_none" ? "" : val)}
                                            >
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="Nenhum" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="_none" className="text-xs">Nenhum</SelectItem>
                                                    {staffMembers.map((m: any) => (
                                                        <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs text-muted-foreground">Profissional</Label>
                                            <Select
                                                value={deal.assigned_professional_id || "_none"}
                                                onValueChange={val => updateProfessionalMutation.mutate(val === "_none" ? "" : val)}
                                            >
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="Nenhum" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="_none" className="text-xs">Nenhum</SelectItem>
                                                    {professionals.map(p => (
                                                        <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <Separator />

                                    {/* Container Negociação */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-xs uppercase text-muted-foreground tracking-wider">Negociação</Label>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="h-6 text-xs px-2"
                                                onClick={() => setDealProductsModalOpen(true)}
                                            >
                                                <Plus className="h-3 w-3 mr-1" />
                                                {displayProducts.length > 0 ? "Editar" : "Adicionar"}
                                            </Button>
                                        </div>
                                        {displayProducts.length === 0 ? (
                                            <p className="text-xs text-muted-foreground text-center py-2">
                                                {existingProducts === undefined ? "Carregando..." : "Nenhum item"}
                                            </p>
                                        ) : (
                                            <div className="space-y-1 w-full min-w-0">
                                                {displayProducts.filter(p => p.productServiceId).map((p) => (
                                                    <div key={p.id} className="py-1 border-b last:border-0 min-w-0">
                                                        <p className="text-xs text-foreground truncate w-full">{p.name || "Item"}</p>
                                                        <div className="flex justify-between items-center mt-0.5">
                                                            <span className="text-xs text-muted-foreground">×{p.quantity}</span>
                                                            <span className="text-xs font-medium">
                                                                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.quantity * p.unitPrice)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                                <div className="flex justify-between items-center text-xs font-semibold pt-1 text-green-600">
                                                    <span>Total</span>
                                                    <span>
                                                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                                                            displayProducts.filter(p => p.productServiceId).reduce((s, p) => s + p.quantity * p.unitPrice, 0)
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <Separator />

                                    {/* Container Ações */}
                                    <div className="space-y-2">
                                        <Label className="text-xs uppercase text-muted-foreground tracking-wider">Ações</Label>
                                        <div className="space-y-1.5">
                                            {deal.contact_id && deal.contacts && (
                                                <DealConversationModal
                                                    contactId={deal.contact_id}
                                                    contactName={deal.contacts.push_name}
                                                    trigger={
                                                        <Button variant="outline" size="sm" className="w-full h-8 text-xs justify-start">
                                                            <MessageSquare className="h-3.5 w-3.5 mr-2" />Enviar Mensagem
                                                        </Button>
                                                    }
                                                />
                                            )}

                                            <Button variant="outline" size="sm" className="w-full h-8 text-xs justify-start" onClick={() => setShowTaskModal(true)}>
                                                <CalendarPlus className="h-3.5 w-3.5 mr-2" />Criar Tarefa
                                            </Button>

                                            <div className="space-y-1.5">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="w-full h-8 text-xs justify-start"
                                                    onClick={() => setShowMoveSelect(!showMoveSelect)}
                                                >
                                                    <ArrowRightLeft className="h-3.5 w-3.5 mr-2" />Mover para Outro CRM
                                                    <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${showMoveSelect ? "rotate-180" : ""}`} />
                                                </Button>
                                                {showMoveSelect && (
                                                    <div className="pl-2">
                                                        {otherFunnels.length === 0 ? (
                                                            <p className="text-xs text-muted-foreground px-2 py-1">Nenhum outro funil disponível</p>
                                                        ) : (
                                                            <Select onValueChange={val => {
                                                                const funnel = funnels.find(f => f.id === val);
                                                                if (funnel) {
                                                                    setPendingTargetFunnel(funnel);
                                                                    setMoveStageModalOpen(true);
                                                                    setShowMoveSelect(false);
                                                                }
                                                            }}>
                                                                <SelectTrigger className="h-7 text-xs">
                                                                    <SelectValue placeholder="Selecionar funil..." />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    {otherFunnels.map(f => (
                                                                        <SelectItem key={f.id} value={f.id} className="text-xs">{f.name}</SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Info bottom */}
                                    <Separator />
                                    <div className="space-y-1 text-xs text-muted-foreground">
                                        <p>Criado: {format(new Date(deal.created_at), "dd/MM/yy HH:mm", { locale: ptBR })}</p>
                                        {deal.updated_at && <p>Atualizado: {formatDistanceToNow(new Date(deal.updated_at), { locale: ptBR, addSuffix: true })}</p>}
                                        {deal.value > 0 && (
                                            <p className="font-medium text-foreground">
                                                Valor: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(deal.value)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </ScrollArea>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Sub-modais ── */}
            <TaskModal
                open={showTaskModal}
                onOpenChange={setShowTaskModal}
                initialDealId={deal.id}
                initialContactId={deal.contact_id}
            />

            <PaymentTypeModal
                open={paymentModalOpen}
                onOpenChange={setPaymentModalOpen}
                dealTitle={deal.title}
                totalValue={pendingWonDeal?.totalValue || 0}
                productsCount={pendingWonDeal?.productsCount || 0}
                onConfirm={(pt, inst, rate) => createSalesFromDeal(pt, inst, rate)}
                onCancel={() => createSalesFromDeal("pending")}
                isLoading={isCreatingSales}
            />

            <LossReasonModal
                open={lossReasonModalOpen}
                onOpenChange={setLossReasonModalOpen}
                dealTitle={deal.title}
                onConfirm={handleLossConfirm}
                onCancel={() => setLossReasonModalOpen(false)}
            />

            {deliveryLaunchData && (
                <DeliveryLaunchModal
                    open={deliveryLaunchOpen}
                    onOpenChange={setDeliveryLaunchOpen}
                    contactId={deliveryLaunchData.contactId}
                    dealProducts={deliveryLaunchData.dealProducts}
                    dealTitle={deliveryLaunchData.dealTitle}
                    saleDate={deliveryLaunchData.saleDate}
                />
            )}

            {pendingTargetFunnel && (
                <MoveToCRMStageModal
                    open={moveStageModalOpen}
                    onOpenChange={setMoveStageModalOpen}
                    dealId={deal.id}
                    dealTitle={deal.title}
                    targetFunnelId={pendingTargetFunnel.id}
                    targetFunnelName={pendingTargetFunnel.name}
                    currentUserId={user?.id || ""}
                    onMoved={() => {
                        setPendingTargetFunnel(null);
                        onOpenChange(false);
                    }}
                />
            )}

            {/* Modal de produtos/serviços da negociação */}
            <DealProductsModal
                open={dealProductsModalOpen}
                onOpenChange={setDealProductsModalOpen}
                dealId={deal.id}
                dealTitle={deal.title}
                initialProducts={displayProducts}
                onSaved={() => {}}
            />
        </>
    );
}
