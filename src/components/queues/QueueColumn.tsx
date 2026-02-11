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

    const confirmResolve = () => {
        if (selectedConversation) {
            resolveConversation.mutate(selectedConversation.id);
            setResolveDialogOpen(false);
            setSelectedConversation(null);
        }
    };

    const confirmTransfer = (newQueueId: string, newQueueName: string) => {
        if (selectedConversation) {
            transferQueue.mutate({
                conversationId: selectedConversation.id,
                newQueueId
            });
            setTransferModalOpen(false);
            setSelectedConversation(null);
        }
    };

    return (
        <>
            <div className="flex flex-col h-full min-w-[340px] max-w-[340px] rounded-xl bg-[#F5F6F8] dark:bg-muted/20">
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
        </>
    );
}
