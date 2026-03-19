import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CheckCircle, Star, Files, CircleCheck } from "lucide-react";
import { QueueSelector } from "@/components/QueueSelector";
import { useState } from "react";
import { FavoriteMessagesModal } from "./FavoriteMessagesModal";
import { ConversationMediaModal } from "./ConversationMediaModal";
import { cn } from "@/lib/utils";

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
}: {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
}) => (
    <Button
        variant="outline"
        size="sm"
        onClick={onClick}
        disabled={disabled}
        className={cn(
            "group flex items-center gap-0 overflow-hidden px-2 transition-all duration-200 hover:px-3",
            className
        )}
    >
        <span className="flex-shrink-0">{icon}</span>
        <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm transition-[max-width,margin] duration-200 group-hover:max-w-[140px] group-hover:ml-1.5">
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
                    <h3 className="font-semibold text-sm leading-tight truncate max-w-[160px] xl:max-w-[240px]">
                        {displayName}
                    </h3>
                    {instanceName && (
                        <span className="text-xs text-muted-foreground truncate block max-w-[160px] xl:max-w-[240px]">
                            {instanceName}
                        </span>
                    )}
                </div>
            </div>

            {/* Lado direito — ações */}
            <div className="flex items-center gap-1.5">

                {!isGroup && (
                    <>
                        {/* Seletor de fila */}
                        <QueueSelector
                            conversationId={conversationId}
                            currentQueueId={(conversation as any)?.queue_id}
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
                            onClick={handleResolve}
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
        </div>
    );
};
