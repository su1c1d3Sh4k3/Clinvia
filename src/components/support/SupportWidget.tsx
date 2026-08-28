import { useMemo, useState } from "react";
import { ArrowLeft, Headphones, History, Megaphone, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { chatDateTime } from "@/lib/chatDates";
import { SupportThread } from "./SupportThread";
import { NewSupportChat } from "./NewSupportChat";
import { UpdatesTab } from "./UpdatesTab";
import { useMyTickets, useSupportSenderName, useSupportUnread } from "@/hooks/useSupportChat";
import { useUnreadUpdates } from "@/hooks/useSystemUpdates";
import { SUPPORT_PRIORITY_CONFIG, SUPPORT_STATUS_CONFIG } from "@/types/support";

type Tab = "suporte" | "avisos";
/** Dentro da aba Suporte: conversa ativa, histórico de chamados ou chamado antigo. */
type SupportView = "chat" | "list" | "thread";

/**
 * Botão flutuante de suporte + painel com duas abas: Suporte (chat atendido
 * primeiro pela IA) e Avisos (atualizações publicadas no painel admin).
 * Fica ancorado no canto inferior esquerdo do CONTEÚDO (irmão do menu lateral),
 * então acompanha a largura do menu quando ele expande.
 */
export function SupportWidget() {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<Tab>("suporte");
    const [view, setView] = useState<SupportView>("chat");
    const [ticketId, setTicketId] = useState<string | null>(null);
    const isMobile = useIsMobile();

    const senderName = useSupportSenderName();
    const { data: tickets = [], isLoading } = useMyTickets();
    const { unread: unreadMessages, markSeen } = useSupportUnread(tickets);
    const { unread: unreadUpdates } = useUnreadUpdates();

    const totalUnread = unreadMessages + unreadUpdates;

    // O chamado ativo abre direto na conversa; sem chamado ativo, tela do assistente.
    const activeTicket = useMemo(
        () => tickets.find((t) => t.status !== "resolved") || null,
        [tickets]
    );
    const openedTicket = useMemo(
        () => tickets.find((t) => t.id === ticketId) || null,
        [tickets, ticketId]
    );
    const currentTicket = view === "thread" ? openedTicket : activeTicket;

    const handleOpen = () => {
        setOpen(true);
        markSeen();
    };

    const handleClose = () => {
        setOpen(false);
        setTab("suporte");
        setView("chat");
        setTicketId(null);
    };

    const openThread = (id: string) => {
        setTicketId(id);
        setView("thread");
        markSeen();
    };

    const headerTitle =
        tab === "avisos"
            ? "Avisos"
            : view === "list"
              ? "Chamados antigos"
              : currentTicket?.title || "Suporte Clinvia";

    const panel = (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex items-center gap-2 px-3 py-2.5 shrink-0 bg-[#0175EC] text-white rounded-t-xl">
                {tab === "suporte" && view !== "chat" ? (
                    <button
                        onClick={() => {
                            setView(view === "thread" ? "list" : "chat");
                            setTicketId(null);
                        }}
                        className="p-1 rounded hover:bg-white/15"
                        aria-label="Voltar"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                ) : tab === "avisos" ? (
                    <Megaphone className="w-4 h-4" />
                ) : (
                    <Headphones className="w-4 h-4" />
                )}
                <span className="font-medium text-sm truncate flex-1">{headerTitle}</span>
                {tab === "suporte" && view === "chat" && (
                    <button
                        onClick={() => setView("list")}
                        title="Ver chamados antigos"
                        className="p-1 rounded hover:bg-white/15"
                        aria-label="Ver chamados antigos"
                    >
                        <History className="w-4 h-4" />
                    </button>
                )}
                <button onClick={handleClose} className="p-1 rounded hover:bg-white/15" aria-label="Fechar">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="flex border-b shrink-0">
                {(
                    [
                        { id: "suporte" as const, label: "Suporte", badge: unreadMessages },
                        { id: "avisos" as const, label: "Avisos", badge: unreadUpdates },
                    ]
                ).map((t) => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={cn(
                            "flex-1 py-2 text-sm font-medium transition-colors relative",
                            tab === t.id
                                ? "text-[#0175EC] border-b-2 border-[#0175EC]"
                                : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {t.label}
                        {t.badge > 0 && (
                            <span className="ml-1.5 inline-flex min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold items-center justify-center align-middle">
                                {t.badge}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {tab === "avisos" ? (
                <div className="flex-1 overflow-y-auto">
                    <UpdatesTab />
                </div>
            ) : view === "list" ? (
                <>
                    <div className="flex-1 overflow-y-auto">
                        {isLoading ? (
                            <p className="text-center text-sm text-muted-foreground py-8">Carregando...</p>
                        ) : tickets.length === 0 ? (
                            <div className="text-center text-sm text-muted-foreground py-10 px-4">
                                <Headphones className="w-10 h-10 mx-auto mb-2 opacity-40" />
                                <p>Você ainda não abriu nenhum chamado.</p>
                            </div>
                        ) : (
                            tickets.map((t) => {
                                const st = SUPPORT_STATUS_CONFIG[t.status] || SUPPORT_STATUS_CONFIG.open;
                                const pr =
                                    SUPPORT_PRIORITY_CONFIG[t.priority] || SUPPORT_PRIORITY_CONFIG.medium;
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => openThread(t.id)}
                                        className="w-full text-left px-3 py-2.5 border-b hover:bg-muted/60 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={cn("w-2 h-2 rounded-full shrink-0", st.dot)} />
                                            <span className="text-sm font-medium truncate flex-1">
                                                {t.title}
                                            </span>
                                            {(t.last_sender_type === "support" ||
                                                t.last_sender_type === "ai") &&
                                                t.status !== "resolved" && (
                                                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                                                        respondido
                                                    </span>
                                                )}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded", st.bg, st.color)}>
                                                {st.label}
                                            </span>
                                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded", pr.bg, pr.color)}>
                                                {pr.label}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground ml-auto">
                                                {chatDateTime(t.last_message_at || t.created_at)}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                    <div className="p-2.5 border-t shrink-0">
                        <Button
                            onClick={() => {
                                setTicketId(null);
                                setView("chat");
                            }}
                            className="w-full bg-[#0175EC] hover:bg-[#0165cc] text-white"
                        >
                            <Plus className="w-4 h-4 mr-1.5" />
                            Voltar ao atendimento
                        </Button>
                    </div>
                </>
            ) : currentTicket ? (
                <SupportThread ticket={currentTicket} senderName={senderName} />
            ) : (
                <NewSupportChat onCreated={(id) => openThread(id)} />
            )}
        </div>
    );

    return (
        <>
            {!open && (
                <button
                    onClick={handleOpen}
                    data-tour="support-widget"
                    title="Falar com o suporte"
                    className={cn(
                        "absolute bottom-4 left-4 z-40 w-10 h-10 rounded-full flex items-center justify-center",
                        "bg-[#0175EC] text-white shadow-[0_0_20px_rgba(1,117,236,0.55)]",
                        "hover:scale-105 transition-transform"
                    )}
                >
                    <Headphones className="h-5 w-5" />
                    {totalUnread > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center animate-pulse">
                            {totalUnread}
                        </span>
                    )}
                </button>
            )}

            {open &&
                (isMobile ? (
                    <Sheet open onOpenChange={(v) => !v && handleClose()}>
                        <SheetContent side="bottom" className="h-[92vh] p-0 rounded-t-xl overflow-hidden">
                            {panel}
                        </SheetContent>
                    </Sheet>
                ) : (
                    <div className="absolute bottom-4 left-4 z-40 w-[380px] h-[520px] bg-background border rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
                        {panel}
                    </div>
                ))}
        </>
    );
}
