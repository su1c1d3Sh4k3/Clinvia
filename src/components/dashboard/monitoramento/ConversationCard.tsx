import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Eye } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { MonitorCard, lastMsgFromClient, windowRemainingMs } from "@/hooks/useMonitoramento";

interface ConversationCardProps {
    card: MonitorCard;
    attendantName: string;
    canOpenChat: boolean;
    onOpenChat: (card: MonitorCard) => void;
    onOpenProfile: (card: MonitorCard) => void;
    /** re-render tick (1/min) for time-based labels */
    nowTick: number;
}

function borderClass(card: MonitorCard): string {
    const ref = card.lastMessageAt || card.createdAt;
    const hours = (Date.now() - new Date(ref).getTime()) / 36e5;
    if (hours < 12) return "border-blue-500/70";
    if (hours < 24) return "border-orange-500/70";
    return "border-red-500/70";
}

export function ConversationCard({
    card,
    attendantName,
    canOpenChat,
    onOpenChat,
    onOpenProfile,
    nowTick: _nowTick,
}: ConversationCardProps) {
    const name = card.contact.push_name || "Sem nome";
    const phone = card.contact.phone || card.contact.number || "—";
    const fromClient = lastMsgFromClient(card);

    const winMs = windowRemainingMs(card);
    let windowLabel: string | null = null;
    if (winMs !== null) {
        if (winMs <= 0) {
            windowLabel = "Janela Encerrada";
        } else {
            const h = Math.floor(winMs / 36e5);
            const m = Math.floor((winMs / 60000) % 60);
            windowLabel = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} restante`;
        }
    }

    const lastMsgAgo = card.lastMessageAt
        ? formatDistanceToNow(new Date(card.lastMessageAt), { locale: ptBR }).replace(
              "aproximadamente ",
              ""
          )
        : "—";

    return (
        <div
            className={cn(
                "relative rounded-xl border-2 bg-card p-2.5 shadow-sm transition-shadow",
                borderClass(card),
                canOpenChat && "cursor-pointer hover:shadow-md"
            )}
            onClick={() => canOpenChat && onOpenChat(card)}
        >
            {/* last-message dot */}
            <span
                className={cn(
                    "absolute top-2 right-2 h-2.5 w-2.5 rounded-full",
                    fromClient ? "bg-orange-500" : "bg-emerald-500"
                )}
                title={fromClient ? "Última mensagem do cliente" : "Última mensagem do atendente"}
            />

            <div className="flex items-start gap-2 pr-4">
                <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={card.contact.profile_pic_url || undefined} alt={name} />
                    <AvatarFallback className="text-xs">
                        {name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <HoverCard openDelay={300}>
                    <HoverCardTrigger asChild>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold truncate">{name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{phone}</p>
                            <p className="text-[11px] text-muted-foreground/80 truncate">
                                {card.instanceName}
                            </p>
                        </div>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-auto max-w-xs p-3" side="top">
                        <p className="text-sm font-semibold break-words">{name}</p>
                        <p className="text-xs text-muted-foreground">{phone}</p>
                    </HoverCardContent>
                </HoverCard>
            </div>

            <div className="mt-2 border-t border-border/50 pt-1.5 flex items-end justify-between gap-1">
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium truncate">{attendantName}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                        {format(new Date(card.createdAt), "dd/MM/yy")} · {lastMsgAgo}
                        {windowLabel && (
                            <>
                                {" · "}
                                <span
                                    className={cn(
                                        winMs !== null && winMs <= 0
                                            ? "text-red-500 font-medium"
                                            : "text-emerald-600 font-medium"
                                    )}
                                >
                                    {windowLabel}
                                </span>
                            </>
                        )}
                    </p>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                    title="Ver dados do cliente"
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenProfile(card);
                    }}
                >
                    <Eye className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );
}
