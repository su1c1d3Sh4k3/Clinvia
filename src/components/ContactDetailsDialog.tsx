import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useClientDeals, useClientAppointment, useClientTask } from '@/hooks/useQueueConversations';
import { Briefcase, Calendar, CheckSquare, Star, User, ListOrdered } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';

// CRM Modals
import { ViewDealModal } from '@/components/crm/ViewDealModal';
import { EditDealModal } from '@/components/crm/EditDealModal';
import { DealSelectorModal } from '@/components/crm/DealSelectorModal';
import { AppointmentModal } from '@/components/scheduling/AppointmentModal';
import { ViewAppointmentModal } from '@/components/scheduling/ViewAppointmentModal';
import { TaskDetailsModal } from '@/components/tasks/TaskDetailsModal';
import { CRMDeal } from '@/types/crm';
import { TaskModal } from '@/components/tasks/TaskModal';
import { AppointmentSelectorModal } from '@/components/scheduling/AppointmentSelectorModal';
import { TaskSelectorModal } from '@/components/tasks/TaskSelectorModal';

interface ContactDetailsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contact: any;
    conversation?: any;
    onEdit: (contact: any) => void;
}

export const ContactDetailsDialog = ({ open, onOpenChange, contact, conversation, onEdit }: ContactDetailsDialogProps) => {
    // Hooks from useQueueConversations for counts
    const { data: deals = [] } = useClientDeals(contact?.id);
    const { data: appointment = [] } = useClientAppointment(contact?.id);
    const { data: taskId = [] } = useClientTask(contact?.id);

    // Fetch queue name if conversation is provided
    const { data: queueName } = useQuery({
        queryKey: ['queue-name', conversation?.queue_id],
        queryFn: async () => {
            if (!conversation?.queue_id) return null;
            const { data } = await supabase.from('queues').select('name').eq('id', conversation.queue_id).single();
            return data?.name;
        },
        enabled: !!conversation?.queue_id
    });

    // Fetch assigned agent name if conversation is provided
    const { data: agentName } = useQuery({
        queryKey: ['agent-name', conversation?.assigned_agent_id],
        queryFn: async () => {
            if (!conversation?.assigned_agent_id) return null;
            const { data } = await supabase.from('profiles').select('name').eq('id', conversation.assigned_agent_id).single();
            return data?.name;
        },
        enabled: !!conversation?.assigned_agent_id
    });

    // DEALS STATE
    const [selectedDeals, setSelectedDeals] = useState<CRMDeal[]>([]);
    const [selectedDeal, setSelectedDeal] = useState<CRMDeal | null>(null);
    const [dealSelectorOpen, setDealSelectorOpen] = useState(false);
    const [viewDealOpen, setViewDealOpen] = useState(false);
    const [editDealOpen, setEditDealOpen] = useState(false);

    // APPOINTMENTS STATE
    const [selectedAppointments, setSelectedAppointments] = useState<any[]>([]);
    const [selectedAppointment, setSelectedAppointment] = useState<any | null>(null);
    const [appointmentSelectorOpen, setAppointmentSelectorOpen] = useState(false);
    const [viewAppointmentOpen, setViewAppointmentOpen] = useState(false);
    const [editAppointmentOpen, setEditAppointmentOpen] = useState(false);

    // TASKS STATE
    const [selectedTasks, setSelectedTasks] = useState<any[]>([]);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [taskSelectorOpen, setTaskSelectorOpen] = useState(false);
    const [taskDetailsOpen, setTaskDetailsOpen] = useState(false);
    const [editTaskOpen, setEditTaskOpen] = useState(false);

    // --- HANDLERS ---
    const handleViewDeals = (deals: CRMDeal[]) => {
        if (deals.length === 1) {
            setSelectedDeal(deals[0]);
            setViewDealOpen(true);
        } else if (deals.length > 1) {
            setSelectedDeals(deals);
            setDealSelectorOpen(true);
        }
    };

    const handleSelectDeal = (deal: CRMDeal) => {
        setSelectedDeal(deal);
        setViewDealOpen(true);
    };

    const handleEditDeal = (deal: CRMDeal) => {
        setSelectedDeal(deal);
        setTimeout(() => setEditDealOpen(true), 100);
    };

    const handleViewAppointment = (appointments: any[]) => {
        if (appointments.length === 1) {
            setSelectedAppointment(appointments[0]);
            setViewAppointmentOpen(true);
        } else if (appointments.length > 1) {
            setSelectedAppointments(appointments);
            setAppointmentSelectorOpen(true);
        }
    };

    const handleSelectAppointment = (appointment: any) => {
        setSelectedAppointment(appointment);
        setViewAppointmentOpen(true);
    };

    const handleEditAppointment = (appointment: any) => {
        setTimeout(() => setEditAppointmentOpen(true), 100);
    };

    const handleViewTask = (tasks: any[]) => {
        if (tasks.length === 1) {
            setSelectedTaskId(tasks[0].id);
            setTaskDetailsOpen(true);
        } else if (tasks.length > 1) {
            setSelectedTasks(tasks);
            setTaskSelectorOpen(true);
        }
    };

    const handleSelectTask = (taskId: string) => {
        setSelectedTaskId(taskId);
        setTaskDetailsOpen(true);
    };

    const handleEditTask = (taskId: string) => {
        setTaskDetailsOpen(false);
        setTimeout(() => setEditTaskOpen(true), 100);
    };

    if (!contact) return null;

    // NPS
    const npsScore = conversation?.sentiment_score;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[420px] bg-white dark:bg-card border-border/50 shadow-xl overflow-hidden p-0">
                <DialogHeader className="pt-6 pb-4 px-6 border-b border-border/50 bg-muted/20">
                    <DialogTitle className="text-center text-lg font-semibold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
                        Detalhes do Contato
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col items-center space-y-5 px-6 pb-6 pt-4">
                    {/* Header: Avatar */}
                    <div className="relative group">
                        <Avatar className="w-24 h-24 border-4 border-background shadow-md group-hover:shadow-[0_0_15px_3px_rgba(0,177,242,0.3)] transition-all duration-300">
                            <AvatarImage src={contact.profile_pic_url} />
                            <AvatarFallback className="text-3xl bg-secondary/10 text-secondary font-bold">
                                {contact.push_name?.[0]?.toUpperCase() || "?"}
                            </AvatarFallback>
                        </Avatar>
                        {npsScore && (
                            <div className="absolute -bottom-2 -right-2 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400 font-bold px-2 py-0.5 rounded-full text-xs flex items-center shadow-sm border border-yellow-200 dark:border-yellow-700/50" title="NPS / Satisfação">
                                <Star className="w-3 h-3 mr-1 fill-current" />
                                {npsScore}
                            </div>
                        )}
                    </div>

                    {/* Fila & Atendente (Se houver contexto de conversa) */}
                    {(queueName || agentName) && (
                        <div className="flex flex-wrap justify-center items-center gap-2 w-full pt-1">
                            {queueName && (
                                <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold">
                                    <ListOrdered className="w-3.5 h-3.5" />
                                    {queueName}
                                </Badge>
                            )}
                            {agentName && (
                                <Badge variant="secondary" className="bg-secondary/10 text-secondary hover:bg-secondary/20 border border-secondary/20 flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold">
                                    <User className="w-3.5 h-3.5" />
                                    {agentName.split(' ')[0]}
                                </Badge>
                            )}
                        </div>
                    )}

                    {/* Tags */}
                    {contact.contact_tags && contact.contact_tags.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-1.5 w-full">
                            {contact.contact_tags.map((ct: any) => ct.tags && (
                                <Badge
                                    key={ct.tags.id}
                                    style={{ backgroundColor: `${ct.tags.color}15`, color: ct.tags.color, borderColor: `${ct.tags.color}30` }}
                                    className="text-[10px] px-2 py-0.5 border"
                                >
                                    {ct.tags.name}
                                </Badge>
                            ))}
                        </div>
                    )}

                    {/* Informações Pessoais */}
                    <div className="w-full bg-muted/40 rounded-xl p-4 space-y-3.5 border border-border/40">
                        <div className="flex justify-between items-center pb-2 border-b border-border/50 last:border-0 last:pb-0">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome</span>
                            <span className="font-medium text-[13px] text-foreground/90 text-right">{contact.push_name}</span>
                        </div>
                        <div className="flex justify-between items-center pb-2 border-b border-border/50 last:border-0 last:pb-0">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Telefone</span>
                            <span className="font-medium text-[13px] text-foreground/90 font-mono">{contact.phone || contact.number?.split('@')[0]}</span>
                        </div>
                        {contact.company && (
                            <div className="flex justify-between items-center pb-2 border-b border-border/50 last:border-0 last:pb-0">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Empresa</span>
                                <span className="font-medium text-[13px] text-foreground/90 text-right">{contact.company}</span>
                            </div>
                        )}
                        {contact.email && (
                            <div className="flex justify-between items-center pb-2 border-b border-border/50 last:border-0 last:pb-0">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email</span>
                                <span className="font-medium text-[13px] text-foreground/90 text-right break-all max-w-[200px]">{contact.email}</span>
                            </div>
                        )}
                        {contact.cpf && (
                            <div className="flex justify-between items-center pb-2 border-b border-border/50 last:border-0 last:pb-0">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">CPF</span>
                                <span className="font-medium text-[13px] text-foreground/90 font-mono">{contact.cpf}</span>
                            </div>
                        )}
                    </div>

                    {/* Ações/Indicadores (Negociações, Agendamentos, Tarefas) */}
                    {(deals.length > 0 || appointment.length > 0 || taskId.length > 0) && (
                        <div className="flex justify-center gap-5 w-full pt-1 pb-1">
                            {deals.length > 0 && (
                                <button onClick={() => handleViewDeals(deals)} className="flex flex-col items-center gap-1.5 group cursor-pointer border-none bg-transparent p-0">
                                    <div className="w-11 h-11 rounded-full bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center relative transition-transform group-hover:scale-110 shadow-sm border border-blue-100/50 dark:border-blue-800/50">
                                        <Briefcase className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                        <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] w-4.5 h-4.5 px-1.5 flex items-center justify-center rounded-full font-bold shadow-sm">
                                            {deals.length}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Negócios</span>
                                </button>
                            )}
                            {appointment.length > 0 && (
                                <button onClick={() => handleViewAppointment(appointment)} className="flex flex-col items-center gap-1.5 group cursor-pointer border-none bg-transparent p-0">
                                    <div className="w-11 h-11 rounded-full bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center relative transition-transform group-hover:scale-110 shadow-sm border border-purple-100/50 dark:border-purple-800/50">
                                        <Calendar className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                                        <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-[10px] w-4.5 h-4.5 px-1.5 flex items-center justify-center rounded-full font-bold shadow-sm">
                                            {appointment.length}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">Agendas</span>
                                </button>
                            )}
                            {taskId.length > 0 && (
                                <button onClick={() => handleViewTask(taskId)} className="flex flex-col items-center gap-1.5 group cursor-pointer border-none bg-transparent p-0">
                                    <div className="w-11 h-11 rounded-full bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center relative transition-transform group-hover:scale-110 shadow-sm border border-orange-100/50 dark:border-orange-800/50">
                                        <CheckSquare className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                        <span className="absolute -top-1 -right-1 bg-orange-600 text-white text-[10px] w-4.5 h-4.5 px-1.5 flex items-center justify-center rounded-full font-bold shadow-sm">
                                            {taskId.length}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">Tarefas</span>
                                </button>
                            )}
                        </div>
                    )}

                    <Button
                        className="w-full bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/20 transition-all font-semibold rounded-xl mt-2"
                        onClick={() => {
                            onOpenChange(false);
                            onEdit(contact);
                        }}
                    >
                        Editar Informações
                    </Button>
                </div>
            </DialogContent>

            {/* --- DEALS MODALS --- */}
            <DealSelectorModal
                deals={selectedDeals}
                open={dealSelectorOpen}
                onOpenChange={setDealSelectorOpen}
                onSelect={handleSelectDeal}
            />
            {selectedDeal && (
                <ViewDealModal
                    deal={selectedDeal}
                    open={viewDealOpen}
                    onOpenChange={setViewDealOpen}
                    onEdit={handleEditDeal}
                />
            )}
            {selectedDeal && (
                <EditDealModal
                    deal={selectedDeal}
                    open={editDealOpen}
                    onOpenChange={setEditDealOpen}
                />
            )}

            {/* --- APPOINTMENT MODALS --- */}
            <AppointmentSelectorModal
                appointments={selectedAppointments}
                open={appointmentSelectorOpen}
                onOpenChange={setAppointmentSelectorOpen}
                onSelect={handleSelectAppointment}
            />
            <ViewAppointmentModal
                appointment={selectedAppointment}
                open={viewAppointmentOpen}
                onOpenChange={setViewAppointmentOpen}
                onEdit={handleEditAppointment}
            />
            <AppointmentModal
                open={editAppointmentOpen}
                onOpenChange={setEditAppointmentOpen}
                appointmentToEdit={selectedAppointment}
            />

            {/* --- TASK MODALS --- */}
            <TaskSelectorModal
                tasks={selectedTasks}
                open={taskSelectorOpen}
                onOpenChange={setTaskSelectorOpen}
                onSelect={handleSelectTask}
            />
            <TaskDetailsModal
                taskId={selectedTaskId}
                open={taskDetailsOpen}
                onOpenChange={setTaskDetailsOpen}
                onEdit={handleEditTask}
            />
            {selectedTaskId && (
                <TaskModal
                    open={editTaskOpen}
                    onOpenChange={setEditTaskOpen}
                    taskToEdit={{ id: selectedTaskId }}
                    onSuccess={() => setEditTaskOpen(false)}
                />
            )}
        </Dialog>
    );
};
