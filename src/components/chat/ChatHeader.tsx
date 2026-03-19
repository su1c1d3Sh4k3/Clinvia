
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Star, Files } from "lucide-react";
import { QueueSelector } from "@/components/QueueSelector";
import { useState } from "react";
import { FavoriteMessagesModal } from "./FavoriteMessagesModal";
import { ConversationMediaModal } from "./ConversationMediaModal";

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
    onJumpToMessage
}: ChatHeaderProps) => {
    const [isFavoritesModalOpen, setIsFavoritesModalOpen] = useState(false);
    const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);

    if (isMobile) return null;

    const isOpen = (conversation?.status as string) === 'open';
    const isResolved = (conversation?.status as string) === 'resolved';

    return (
        <div className="px-3 py-2 border-b border-[#1E2229]/20 dark:border-border bg-white dark:bg-transparent flex items-center justify-between gap-2 min-w-0">

            {/* Lado esquerdo — info do contato */}
            <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
                <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarImage src={profilePic || undefined} />
                    <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                    <h3 className="font-semibold text-sm truncate max-w-[120px] lg:max-w-[200px]">
                        {displayName}
                    </h3>
                    <Badge variant="outline" className="text-xs px-1.5 py-0">
                        {(contact as any)?.instagram_id ? (
                            <>
                                <div className="w-1.5 h-1.5 rounded-full mr-1 flex-shrink-0" style={{ backgroundColor: '#F05D57' }} />
                                <span className="hidden sm:inline">Instagram</span>
                            </>
                        ) : (
                            <>
                                <div className="w-1.5 h-1.5 rounded-full mr-1 flex-shrink-0" style={{ backgroundColor: '#22C55E' }} />
                                <span className="hidden sm:inline">WhatsApp</span>
                            </>
                        )}
                    </Badge>
                </div>
            </div>

            {/* Lado direito — ações */}
            <div className="flex items-center gap-1.5 lg:gap-2 min-w-0 flex-shrink">

                {/* Avatar + nome da instância */}
                {instanceName && (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Avatar className="w-7 h-7 flex-shrink-0">
                            <AvatarImage src={instance?.profile_pic_url || undefined} />
                            <AvatarFallback className="text-xs">{instanceName[0]?.toUpperCase() || 'A'}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground hidden xl:inline truncate max-w-[100px]">
                            {instanceName}
                        </span>
                    </div>
                )}

                {!isGroup && (
                    <>
                        {/* Queue selector */}
                        <div className="flex-shrink min-w-0">
                            <QueueSelector
                                conversationId={conversationId}
                                currentQueueId={(conversation as any)?.queue_id}
                            />
                        </div>

                        {/* Ticket Aberto / Atender Ticket */}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateStatus.mutate({ conversationId, status: 'open' })}
                            disabled={isOpen || updateStatus.isPending}
                            className={`flex-shrink-0 px-2 lg:px-3 ${isOpen ? "opacity-50 cursor-not-allowed" : ""}`}
                            title={isOpen ? "Ticket Aberto" : "Atender Ticket"}
                        >
                            <CheckCircle className="w-4 h-4 flex-shrink-0" />
                            <span className="hidden lg:inline ml-1.5 whitespace-nowrap">
                                {isOpen ? "Ticket Aberto" : "Atender Ticket"}
                            </span>
                        </Button>

                        {/* Resolver Ticket */}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleResolve}
                            disabled={resolveConversation.isPending || isResolved}
                            className="flex-shrink-0 px-2 lg:px-3"
                            title={isResolved ? "Resolvido" : "Resolver Ticket"}
                        >
                            <CheckCircle className="w-4 h-4 flex-shrink-0" />
                            <span className="hidden lg:inline ml-1.5 whitespace-nowrap">
                                {isResolved ? "Resolvido" : "Resolver Ticket"}
                            </span>
                        </Button>
                    </>
                )}

                {/* Mídia */}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsMediaModalOpen(true)}
                    title="Mídia da Conversa"
                    className="flex-shrink-0 px-2"
                >
                    <Files className="w-4 h-4" />
                </Button>

                {/* Favoritos */}
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsFavoritesModalOpen(true)}
                    title="Mensagens Favoritas"
                    className="flex-shrink-0 px-2"
                >
                    <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                </Button>
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
