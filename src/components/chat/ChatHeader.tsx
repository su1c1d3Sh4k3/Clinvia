
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Star } from "lucide-react";
import { QueueSelector } from "@/components/QueueSelector";
import { useState } from "react";
import { FavoriteMessagesModal } from "./FavoriteMessagesModal";

interface ChatHeaderProps {
    isMobile?: boolean;
    displayName: string;
    profilePic: string | null;
    contact: any; // Type properly
    instanceName?: string;
    instance?: any;
    isGroup: boolean;
    conversationId: string;
    conversation: any;
    updateStatus: any; // Mutation
    resolveConversation: any; // Mutation
    handleResolve: () => void;
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
    handleResolve
}: ChatHeaderProps) => {
    const [isFavoritesModalOpen, setIsFavoritesModalOpen] = useState(false);

    if (isMobile) return null;

    return (
        <div className="p-4 border-b border-[#1E2229]/20 dark:border-border bg-white dark:bg-transparent flex items-center justify-between">
            <div className="flex items-center gap-3">
                <Avatar>
                    <AvatarImage src={profilePic || undefined} />
                    <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                    <h3 className="font-semibold">{displayName}</h3>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                            {(contact as any)?.instagram_id ? (
                                <>
                                    <div className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: '#F05D57' }} /> Instagram
                                </>
                            ) : (
                                <>
                                    <div className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: '#22C55E' }} /> WhatsApp
                                </>
                            )}
                        </Badge>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-3">
                {instanceName && (
                    <div className="flex items-center gap-2">
                        <Avatar className="w-8 h-8">
                            <AvatarImage src={instance?.profile_pic_url || undefined} />
                            <AvatarFallback>{instanceName[0]?.toUpperCase() || 'A'}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm text-muted-foreground">{instanceName}</span>
                    </div>
                )}

                {!isGroup && (
                    <>
                        <QueueSelector conversationId={conversationId} currentQueueId={(conversation as any)?.queue_id} />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateStatus.mutate({ conversationId, status: 'open' })}
                            disabled={(conversation?.status as string) === 'open' || updateStatus.isPending}
                            className={(conversation?.status as string) === 'open' ? "opacity-50 cursor-not-allowed" : ""}
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            {(conversation?.status as string) === 'open' ? "Ticket Aberto" : "Atender Ticket"}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleResolve}
                            disabled={resolveConversation.isPending || (conversation?.status as any) === "resolved"}
                        >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            {(conversation?.status as any) === "resolved" ? "Resolvido" : "Resolver Ticket"}
                        </Button>
                    </>
                )}

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsFavoritesModalOpen(true)}
                    title="Mensagens Favoritas"
                    className="ml-auto"
                >
                    <Star className="w-4 h-4 fill-yellow-500 text-yellow-500" />
                </Button>
            </div>

            <FavoriteMessagesModal
                open={isFavoritesModalOpen}
                onOpenChange={setIsFavoritesModalOpen}
                conversationId={conversationId}
            />
        </div>
    );
};
