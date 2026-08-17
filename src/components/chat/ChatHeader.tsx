import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CheckCircle, Star, Files, CircleCheck, ArrowRightLeft } from "lucide-react";
import { TransferAtendimentoModal } from "@/components/queues/TransferAtendimentoModal";
import { useState } from "react";
import { FavoriteMessagesModal } from "./FavoriteMessagesModal";
import { ConversationMediaModal } from "./ConversationMediaModal";
import { CloseNegotiationModal } from "./CloseNegotiationModal";
import { cn } from "@/lib/utils";
import { CLIENT_STAGE_BADGE, CLIENT_STAGE_LABEL, normalizeClientStage } from "@/lib/clientStage";

interface ChatHeaderProps {
    isMobile?: boolean;
    displayName: string;
    profilePic: string | null;
    contact: any;
    instanceName?: string;
    instance?: any;
    isGroup: boolean;
    conversationId: string;
    conversation: any;
    updateStatus: any;
    resolveConversation: any;
    handleResolve: () => void;
    onJumpToMessage?: (messageId: string) => void;
}

/** Botão que expande ao hover para mostrar o label */
const ExpandButton = ({
    icon,
    label,
    onClick,
    disabled,
    className,
    dataTour,
}: {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
    dataTour?: string;
}) => (
    <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={disabled}
        data-tour={dataTour}
        className={cn(
            "group flex items-center gap-0 overflow-hidden px-2 transition-all duration-200 hover:px-3",
            className
        )}
    >
        <span className="flex-shrink-0">{icon}</span>
        <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm transition-[max-width,margin] duration-200 group-hover:max-w-[180px] group-hover:ml-1.5">
            {label}
        </span>
    </Button>
);

export const ChatHeader = ({
    isMobile,
    displayName,
    profilePic,
    contact,
    instanceName,
    isGroup,
    conversationId,
    conversation,
    updateStatus,
    resolveConversation,
    handleResolve,
    onJumpToMessage,
}: ChatHeaderProps) => {
    const [isFavoritesModalOpen, setIsFavoritesModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isCloseNegotiationOpen, setIsCloseNegotiationOpen] = useState(false);
    const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);

    if (isMobile) return null;

    const isOpen     = (conversation?.status as string) === "open";
    const isResolved = (conversation?.status as string) === "resolved";

    return (
        <div className="px-3 py-2 border-b border-[#1E2229]/20 dark:border-border bg-white dark:bg-transparent flex items-center justify-between gap-2 min-w-0">

            {/* Lado esquerdo — contato + instância */}
            <div className="flex items-center gap-2.5 min-w-0 flex-shrink-0">
                <Avatar className="w-9 h-9 flex-shrink-0">
                    <AvatarImage src={profilePic || undefined} />
                    <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <h3 className="font-semibold text-sm leading-tight truncate max-w-[120px] sm:max-w-[160px] xl:max-w-[240px]">
                            {displayName}
                        </h3>
                        {!isGroup && contact && (
                            <span
                                className={cn(
                                    "px-1.5 py-0 rounded text-[9px] font-bold uppercase tracking-wider border flex-shrink-0",
                                    CLIENT_STAGE_BADGE[normalizeClientStage(contact.client_stage)]
                                )}
                            >
                                {CLIENT_STAGE_LABEL[normalizeClientStage(contact.client_stage)]}
                            </span>
                        )}
                    </div>
                    {instanceName && (
                        <span className="text-xs text-muted-foreground truncate block max-w-[120px] sm:max-w-[160px] xl:max-w-[240px]">
                            {instanceName}
                        </span>
                    )}
                </div>
            </div>

            {/* Lado direito — ações */}
            <div className="flex items-center gap-1.5">

                {!isGroup && (
                    <>
                        {/* Transferir Atendimento (fila + responsável) */}
                        <ExpandButton
                            icon={<ArrowRightLeft className="w-4 h-4" />}
                            label="Transferir Atendimento"
                            onClick={() => setIsTransferModalOpen(true)}
                            dataTour="chat-transfer"
                        />

                        {/* Atender / Ticket Aberto */}
                        <ExpandButton
                            icon={<CheckCircle className="w-4 h-4" />}
                            label={isOpen ? "Ticket Aberto" : "Atender Ticket"}
                            onClick={() => updateStatus.mutate({ conversationId, status: "open" })}
                            disabled={isOpen || updateStatus.isPending}
                            className={isOpen ? "opacity-50 cursor-not-allowed" : ""}
                        />

                        {/* Resolver Ticket */}
                        <ExpandButton
                            icon={<CircleCheck className="w-4 h-4" />}
                            label={isResolved ? "Resolvido" : "Resolver Ticket"}
                            onClick={() => !isGroup && contact ? setIsCloseNegotiationOpen(true) : handleResolve()}
                            disabled={resolveConversation.isPending || isResolved}
                            className={isResolved ? "opacity-50 cursor-not-allowed" : ""}
                        />
                    </>
                )}

                {/* Mídia */}
                <ExpandButton
                    icon={<Files className="w-4 h-4" />}
                    label="Mídia"
                    onClick={() => setIsMediaModalOpen(true)}
                />

                {/* Favoritos */}
                <ExpandButton
                    icon={<Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />}
                    label="Favoritos"
                    onClick={() => setIsFavoritesModalOpen(true)}
                />
            </div>

            <TransferAtendimentoModal
                open={isTransferModalOpen}
                onOpenChange={setIsTransferModalOpen}
                conversationId={conversationId}
                conversation={conversation}
            />
            <FavoriteMessagesModal
                open={isFavoritesModalOpen}
                onOpenChange={setIsFavoritesModalOpen}
                conversationId={conversationId}
            />
            <ConversationMediaModal
                open={isMediaModalOpen}
                onOpenChange={setIsMediaModalOpen}
                conversationId={conversationId}
                onJumpToMessage={onJumpToMessage}
            />
            {contact && !isGroup && (
                <CloseNegotiationModal
                    open={isCloseNegotiationOpen}
                    onOpenChange={setIsCloseNegotiationOpen}
                    contactId={contact.id}
                    onConfirm={handleResolve}
                />
            )}
        </div>
    );
};
