import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CheckCircle, Star, Files, CircleCheck, ArrowRightLeft, EyeOff, Radar } from "lucide-react";
import { TransferAtendimentoModal } from "@/components/queues/TransferAtendimentoModal";
import { useState } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { FavoriteMessagesModal } from "./FavoriteMessagesModal";
import { ConversationMediaModal } from "./ConversationMediaModal";
import { RestrictGroupModal } from "./RestrictGroupModal";
import { GroupInfoModal } from "./GroupInfoModal";
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
    /** Monitoramento de Grupo: mostra o botão de filtro das mensagens-gatilho */
    showMonitorFilter?: boolean;
    monitorFilterActive?: boolean;
    onToggleMonitorFilter?: () => void;
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
    instance,
    isGroup,
    conversationId,
    conversation,
    updateStatus,
    resolveConversation,
    handleResolve,
    onJumpToMessage,
    showMonitorFilter,
    monitorFilterActive,
    onToggleMonitorFilter,
}: ChatHeaderProps) => {
    const [isFavoritesModalOpen, setIsFavoritesModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isCloseNegotiationOpen, setIsCloseNegotiationOpen] = useState(false);
    const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
    const [isRestrictGroupOpen, setIsRestrictGroupOpen] = useState(false);
    const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
    const { data: userRole } = useUserRole();

    if (isMobile) return null;

    const isOpen     = (conversation?.status as string) === "open";
    const isResolved = (conversation?.status as string) === "resolved";

    return (
        <div className="px-3 py-2 border-b border-[#1E2229]/20 dark:border-border bg-white dark:bg-transparent flex items-center justify-between gap-2 min-w-0">

            {/* Lado esquerdo — contato + instância (grupo: clique abre informações) */}
            <div
                className={cn(
                    "flex items-center gap-2.5 min-w-0 flex-shrink-0",
                    isGroup && conversation?.group_id && "cursor-pointer group/gname"
                )}
                onClick={isGroup && conversation?.group_id ? () => setIsGroupInfoOpen(true) : undefined}
                title={isGroup && conversation?.group_id ? "Ver informações do grupo" : undefined}
            >
                <Avatar className="w-9 h-9 flex-shrink-0">
                    <AvatarImage src={profilePic || undefined} />
                    <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <h3 className="font-semibold text-sm leading-tight truncate max-w-[120px] sm:max-w-[160px] xl:max-w-[240px] group-hover/gname:underline">
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

                {/* Monitoramento — filtra só as mensagens-gatilho dos leads (todos veem) */}
                {isGroup && showMonitorFilter && onToggleMonitorFilter && (
                    <ExpandButton
                        icon={<Radar className={cn("w-4 h-4", monitorFilterActive && "text-violet-500")} />}
                        label={monitorFilterActive ? "Ver todas as mensagens" : "Monitoramento"}
                        onClick={onToggleMonitorFilter}
                        className={monitorFilterActive ? "border-violet-400 bg-violet-50 dark:bg-violet-950/30" : ""}
                    />
                )}

                {/* Restringir Grupo — admin restringe atendentes+supervisores,
                    supervisor só atendentes; agents não veem o botão */}
                {isGroup && conversation?.group_id && userRole && userRole !== "agent" && (
                    <ExpandButton
                        icon={<EyeOff className="w-4 h-4" />}
                        label="Restringir Grupo"
                        onClick={() => setIsRestrictGroupOpen(true)}
                    />
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
            {isGroup && conversation?.group_id && (
                <GroupInfoModal
                    open={isGroupInfoOpen}
                    onOpenChange={setIsGroupInfoOpen}
                    groupId={conversation.group_id}
                    conversationId={conversationId}
                    instance={instance}
                    onJumpToMessage={onJumpToMessage}
                />
            )}
            {isGroup && conversation?.group_id && (
                <RestrictGroupModal
                    open={isRestrictGroupOpen}
                    onOpenChange={setIsRestrictGroupOpen}
                    groupId={conversation.group_id}
                    groupName={displayName}
                />
            )}
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
                    conversationId={conversationId}
                    onConfirm={handleResolve}
                />
            )}
        </div>
    );
};
