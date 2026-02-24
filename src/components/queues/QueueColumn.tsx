import { Draggable, Droppable } from '@hello-pangea/dnd';
import { ConversationQueueCard } from './ConversationQueueCard';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { QueueConversation } from '@/hooks/useQueueConversations';
import { useState } from 'react';
import { ConversationChatModal } from './ConversationChatModal';
import { TransferQueueModal } from './TransferQueueModal';
import { TagAssignment } from '@/components/TagAssignment';
import { useConversationActions } from '@/hooks/useConversationActions';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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

interface QueueColumnProps {
    queueId: string;
    queueName: string;
    conversations: QueueConversation[];
    index: number;
}

export function QueueColumn({ queueId, queueName, conversations, index }: QueueColumnProps) {
    const [selectedConversation, setSelectedConversation] = useState<QueueConversation | null>(null);
    const [chatModalOpen, setChatModalOpen] = useState(false);
    const [transferModalOpen, setTransferModalOpen] = useState(false);
    const [tagModalOpen, setTagModalOpen] = useState(false);
    const [resolveDialogOpen, setResolveDialogOpen] = useState(false);

    // DEALS STATE
    const [selectedDeals, setSelectedDeals] = useState<CRMDeal[]>([]); // List of deals to select from
    const [selectedDeal, setSelectedDeal] = useState<CRMDeal | null>(null); // Single deal to view/edit
    const [dealSelectorOpen, setDealSelectorOpen] = useState(false);
    const [viewDealOpen, setViewDealOpen] = useState(false);
    const [editDealOpen, setEditDealOpen] = useState(false);

    // APPOINTMENTS STATE
    const [selectedAppointments, setSelectedAppointments] = useState<any[]>([]); // List of appointments
    const [selectedAppointment, setSelectedAppointment] = useState<any | null>(null);
    const [appointmentSelectorOpen, setAppointmentSelectorOpen] = useState(false);
    const [viewAppointmentOpen, setViewAppointmentOpen] = useState(false);
    const [editAppointmentOpen, setEditAppointmentOpen] = useState(false);

    // TASKS STATE
    const [selectedTasks, setSelectedTasks] = useState<any[]>([]); // List of tasks
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [taskSelectorOpen, setTaskSelectorOpen] = useState(false);
    const [taskDetailsOpen, setTaskDetailsOpen] = useState(false);
    const [editTaskOpen, setEditTaskOpen] = useState(false);

    const { transferQueue, resolveConversation } = useConversationActions();

    const handleOpenChat = (conversation: QueueConversation) => {
        setSelectedConversation(conversation);
        setChatModalOpen(true);
    };

    const handleTransfer = (conversation: QueueConversation) => {
        setSelectedConversation(conversation);
        setTransferModalOpen(true);
    };

    const handleTag = (conversation: QueueConversation) => {
        setSelectedConversation(conversation);
        setTagModalOpen(true);
    };

    const handleResolve = (conversation: QueueConversation) => {
        setSelectedConversation(conversation);
        setResolveDialogOpen(true);
    };

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
        // setSelectedDeal já deve estar setado, mas garantimos
        setSelectedDeal(deal);
        // Pequeno delay para transição suave entre modais
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
        // setSelectedAppointment já setado
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

    const confirmResolve = () => {
        if (selectedConversation) {
            resolveConversation.mutate(selectedConversation.id);
            setResolveDialogOpen(false);
            setSelectedConversation(null);
        }
    };

    const confirmTransfer = (newQueueId: string, assignedAgentId: string | null) => {
        if (selectedConversation) {
            transferQueue.mutate({
                conversationId: selectedConversation.id,
                newQueueId,
                assignedAgentId
            });
            setTransferModalOpen(false);
            setSelectedConversation(null);
        }
    };

    return (
        <>
            <div className="flex-shrink-0 flex flex-col h-full min-w-[340px] max-w-[340px] rounded-xl bg-[#F5F6F8] dark:bg-muted/20 border border-border/50">
                {/* Column Header */}
                <div className="p-4 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                        <h3 className="font-semibold text-sm text-foreground/90">{queueName}</h3>
                        <span className="text-xs font-medium text-muted-foreground bg-background/50 px-2 py-0.5 rounded-full border border-border/50">
                            {conversations.length}
                        </span>
                    </div>
                </div>

                {/* Scrollable Area with conversations */}
                <ScrollArea className="flex-1 px-2 pb-2">
                    <div className="h-full min-h-[100px]">
                        <Droppable droppableId={queueId}>
                            {(provided, snapshot) => (
                                <div
                                    {...provided.droppableProps}
                                    ref={provided.innerRef}
                                    className={`flex flex-col h-full min-h-[100px] transition-colors rounded-lg ${snapshot.isDraggingOver ? 'bg-muted/30 ring-2 ring-primary/10' : ''
                                        }`}
                                >
                                    {conversations.length === 0 ? (
                                        <div className="text-center py-8 text-muted-foreground text-sm">
                                            Nenhuma conversa nesta fila
                                        </div>
                                    ) : (
                                        conversations.map((conversation, index) => (
                                            <Draggable
                                                key={conversation.id}
                                                draggableId={conversation.id}
                                                index={index}
                                            >
                                                {(provided, snapshot) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        {...provided.dragHandleProps}
                                                        className={`mb-3 ${snapshot.isDragging ? 'rotate-2 shadow-lg' : ''}`}
                                                    >
                                                        <ConversationQueueCard
                                                            conversation={conversation}
                                                            onOpenChat={() => handleOpenChat(conversation)}
                                                            onTransfer={() => handleTransfer(conversation)}
                                                            onTag={() => handleTag(conversation)}
                                                            onResolve={() => handleResolve(conversation)}
                                                            onViewDeal={handleViewDeals}
                                                            onViewAppointment={handleViewAppointment}
                                                            onViewTask={handleViewTask}
                                                        />
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))
                                    )}
                                    {provided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </div>
                </ScrollArea>
            </div>

            {/* Modals */}
            {selectedConversation && (
                <>
                    <ConversationChatModal
                        open={chatModalOpen}
                        onOpenChange={setChatModalOpen}
                        contactId={selectedConversation.contact_id}
                        contactName={selectedConversation.contact.push_name}
                    />

                    <TransferQueueModal
                        open={transferModalOpen}
                        onOpenChange={setTransferModalOpen}
                        currentQueueId={selectedConversation.queue_id}
                        currentQueueName={queueName}
                        onConfirm={confirmTransfer}
                        isLoading={transferQueue.isPending}
                    />

                    {tagModalOpen && (
                        <TagAssignment
                            contactId={selectedConversation.contact_id}
                            open={tagModalOpen}
                            onClose={() => setTagModalOpen(false)}
                        />
                    )}

                    <AlertDialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Resolver Conversa</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Tem certeza que deseja resolver esta conversa com{' '}
                                    <strong>{selectedConversation.contact.push_name}</strong>?
                                    <br />
                                    A conversa será fechada e removida da visualização.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={confirmResolve}>
                                    Resolver
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </>
            )}

            {/* --- DEALS MODALS --- */}

            {/* Selector */}
            <DealSelectorModal
                deals={selectedDeals}
                open={dealSelectorOpen}
                onOpenChange={setDealSelectorOpen}
                onSelect={handleSelectDeal}
            />

            {/* View */}
            {selectedDeal && (
                <ViewDealModal
                    deal={selectedDeal}
                    open={viewDealOpen}
                    onOpenChange={setViewDealOpen}
                    onEdit={handleEditDeal}
                />
            )}

            {/* Edit */}
            {selectedDeal && (
                <EditDealModal
                    deal={selectedDeal}
                    open={editDealOpen}
                    onOpenChange={setEditDealOpen}
                />
            )}


            {/* --- APPOINTMENT MODALS --- */}

            {/* Selector */}
            <AppointmentSelectorModal
                appointments={selectedAppointments}
                open={appointmentSelectorOpen}
                onOpenChange={setAppointmentSelectorOpen}
                onSelect={handleSelectAppointment}
            />

            {/* View */}
            <ViewAppointmentModal
                appointment={selectedAppointment}
                open={viewAppointmentOpen}
                onOpenChange={setViewAppointmentOpen}
                onEdit={handleEditAppointment}
            />

            {/* Edit/Create */}
            <AppointmentModal
                open={editAppointmentOpen}
                onOpenChange={setEditAppointmentOpen}
                appointmentToEdit={selectedAppointment}
            />


            {/* --- TASK MODALS --- */}

            {/* Selector */}
            <TaskSelectorModal
                tasks={selectedTasks}
                open={taskSelectorOpen}
                onOpenChange={setTaskSelectorOpen}
                onSelect={handleSelectTask}
            />

            {/* Details (View) */}
            <TaskDetailsModal
                taskId={selectedTaskId}
                open={taskDetailsOpen}
                onOpenChange={setTaskDetailsOpen}
                onEdit={handleEditTask}
            />

            {/* Edit */}
            {selectedTaskId && (
                <TaskModal
                    open={editTaskOpen}
                    onOpenChange={setEditTaskOpen}
                    taskToEdit={{ id: selectedTaskId }}
                    onSuccess={() => {
                        setEditTaskOpen(false);
                    }}
                />
            )}
        </>
    );
}
