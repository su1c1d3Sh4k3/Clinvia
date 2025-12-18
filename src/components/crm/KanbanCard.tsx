import { CRMDeal } from "@/types/crm";
import { Draggable } from "@hello-pangea/dnd";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, MessageSquare, Tag, Calendar, User, Clock, CalendarPlus, Package } from "lucide-react";
import { differenceInCalendarDays } from "date-fns";
import { useStaff } from "@/hooks/useStaff";
import { DealConversationModal } from "./DealConversationModal";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EditDealModal } from "./EditDealModal";
import { ViewDealModal } from "./ViewDealModal";
import { TaskModal } from "../tasks/TaskModal";
import { toast } from "sonner";
import { useState } from "react";

interface KanbanCardProps {
    deal: CRMDeal;
    index: number;
    stagnationLimitDays?: number;
}



export function KanbanCard({ deal, index, stagnationLimitDays }: KanbanCardProps) {
    const navigate = useNavigate();
    const [showEditModal, setShowEditModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const queryClient = useQueryClient();
    const { data: staffMembers } = useStaff();

    const responsibleName = staffMembers?.find(s => s.id === deal.responsible_id)?.name;

    const { data: activeConversation } = useQuery({
        queryKey: ["active-conversation", deal.contact_id],
        queryFn: async () => {
            if (!deal.contact_id) return null;
            const { data, error } = await supabase
                .from("conversations")
                .select("id, unread_count")
                .eq("contact_id", deal.contact_id)
                .in("status", ["open", "pending"])
                .limit(1);

            if (error) return null;
            return data && data.length > 0 ? data[0] : null;
        },
        enabled: !!deal.contact_id,
    });

    const deleteDealMutation = useMutation({
        mutationFn: async () => {
            const { error } = await supabase
                .from("crm_deals" as any)
                .delete()
                .eq("id", deal.id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Negociação excluída");
            queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
        },
        onError: () => {
            toast.error("Erro ao excluir negociação");
        }
    });

    const priorityColor = {
        low: "bg-green-500",
        medium: "bg-yellow-500",
        high: "bg-red-500",
    };

    const priorityLabel = {
        low: "Baixa",
        medium: "Média",
        high: "Alta",
    };

    return (
        <>
            <Draggable draggableId={deal.id} index={index}>
                {(provided) => (
                    <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className="mb-3 group"
                    >
                        <Card className="hover:shadow-md transition-all cursor-grab active:cursor-grabbing border-l-4 overflow-hidden relative" style={{ borderLeftColor: deal.priority ? undefined : 'transparent' }}>
                            {deal.priority && (
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${priorityColor[deal.priority]}`} />
                            )}

                            <CardContent className="p-3">
                                {/* Title + Menu on same line */}
                                <div className="flex justify-between items-start mb-3">
                                    <h4 className="font-semibold text-sm line-clamp-2 leading-tight flex-1 pr-2">
                                        {deal.title}
                                    </h4>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                            <DropdownMenuItem onClick={() => setShowViewModal(true)}>
                                                Visualizar
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setShowEditModal(true)}>
                                                Editar
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                className="text-destructive"
                                                onClick={() => {
                                                    if (confirm("Tem certeza que deseja excluir esta negociação?")) {
                                                        deleteDealMutation.mutate();
                                                    }
                                                }}
                                            >
                                                Excluir
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                {/* Client + Value */}
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        {deal.contacts?.profile_pic_url ? (
                                            <img
                                                src={deal.contacts.profile_pic_url}
                                                alt={deal.contacts.push_name}
                                                className="w-6 h-6 rounded-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                                                {deal.contacts?.push_name?.[0]?.toUpperCase() || "?"}
                                            </div>
                                        )}
                                        <span className="text-xs text-black dark:text-muted-foreground truncate max-w-[100px]" title={deal.contacts?.push_name}>
                                            {deal.contacts?.push_name || "Sem contato"}
                                        </span>
                                        {activeConversation?.unread_count > 0 && (
                                            <span className="ml-1 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                                                {activeConversation.unread_count}
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1">
                                        {deal.value > 0 && (
                                            <Badge variant="secondary" className="text-[10px] px-1.5 h-5 font-normal bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deal.value)}
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                {/* Product and Professional Info */}
                                <div className="flex flex-col gap-1 mb-3">
                                    {deal.product_service && (
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <Package className="h-3 w-3" />
                                            {deal.product_service.name}
                                        </span>
                                    )}
                                    {deal.assigned_professional && (
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                            <User className="h-3 w-3" />
                                            {deal.assigned_professional.name}
                                        </span>
                                    )}
                                </div>

                                <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-border/50">
                                    {/* Tags */}
                                    {deal.contacts?.contact_tags && deal.contacts.contact_tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mb-1">
                                            {deal.contacts.contact_tags.map((ct, idx) => (
                                                <div key={idx} className="flex items-center gap-1 bg-muted/50 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground">
                                                    <Tag className="h-3 w-3" style={{ color: ct.tags.color }} />
                                                    <span>{ct.tags.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="flex justify-between items-center">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-1 text-[10px] text-black dark:text-muted-foreground" title="Data de criação">
                                                <Calendar className="h-3 w-3" />
                                                {new Date(deal.created_at).toLocaleDateString('pt-BR')}
                                            </div>
                                            {responsibleName && (
                                                <div className="flex items-center gap-1 text-[10px] text-black dark:text-muted-foreground" title="Responsável">
                                                    <User className="h-3 w-3" />
                                                    {responsibleName}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex gap-1">
                                            {deal.contact_id && deal.contacts && (
                                                <DealConversationModal
                                                    contactId={deal.contact_id}
                                                    contactName={deal.contacts.push_name}
                                                />
                                            )}
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-black dark:text-muted-foreground"
                                                title="Criar Tarefa"
                                                onClick={() => setShowTaskModal(true)}
                                            >
                                                <CalendarPlus className="h-3 w-3" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-black dark:text-muted-foreground"
                                                title="Ir para Conversa"
                                                onClick={() => navigate(`/?conversationId=${activeConversation?.id}`)}
                                                disabled={!activeConversation?.id}
                                            >
                                                <MessageSquare className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 mt-1 items-center">
                                        {deal.priority && (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-sm bg-opacity-10 ${priorityColor[deal.priority].replace('bg-', 'text-')} bg-gray-100 dark:bg-gray-800`}>
                                                {priorityLabel[deal.priority]}
                                            </span>
                                        )}

                                        {stagnationLimitDays && stagnationLimitDays > 0 && (() => {
                                            const lastUpdate = new Date(deal.stage_changed_at || deal.updated_at);
                                            const daysInStage = differenceInCalendarDays(new Date(), lastUpdate);
                                            const remaining = stagnationLimitDays - daysInStage;

                                            if (remaining <= 0) {
                                                return (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-red-100 text-red-600 font-bold flex items-center gap-1" title="Estagnado">
                                                        <Clock className="w-3 h-3" />
                                                        +{Math.abs(remaining)}d
                                                    </span>
                                                );
                                            } else if (remaining <= 3) {
                                                return (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-yellow-100 text-yellow-600 font-bold flex items-center gap-1" title="Próximo de estagnar">
                                                        <Clock className="w-3 h-3" />
                                                        {remaining}d
                                                    </span>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </Draggable>

            <EditDealModal
                deal={deal}
                open={showEditModal}
                onOpenChange={setShowEditModal}
            />

            <ViewDealModal
                deal={deal}
                open={showViewModal}
                onOpenChange={setShowViewModal}
            />

            <TaskModal
                open={showTaskModal}
                onOpenChange={setShowTaskModal}
                initialDealId={deal.id}
                initialContactId={deal.contact_id}
            />
        </>
    );
}
