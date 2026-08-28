import { useMemo, useState } from "react";
import { ArrowLeft, Headphones, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { chatDateTime } from "@/lib/chatDates";
import { SupportThread } from "./SupportThread";
import { NewTicketForm } from "./NewTicketForm";
import {
    useMyTickets,
    useSupportSenderName,
    useSupportUnread,
} from "@/hooks/useSupportChat";
import { SUPPORT_PRIORITY_CONFIG, SUPPORT_STATUS_CONFIG } from "@/types/support";

type View = "list" | "thread" | "new";

/**
 * Botão flutuante de suporte + painel de chat com o atendimento da Clinvia.
 * Fica ancorado no canto inferior esquerdo do CONTEÚDO (irmão do menu lateral),
 * então acompanha a largura do menu quando ele expande.
 */
export function SupportWidget() {
    const [open, setOpen] = useState(false);
    const [view, setView] = useState<View>("list");
    const [ticketId, setTicketId] = useState<string | null>(null);
    const isMobile = useIsMobile();

    const senderName = useSupportSenderName();
    const { data: tickets = [], isLoading } = useMyTickets();
    const { unread, markSeen } = useSupportUnread(tickets);

    const ticket = useMemo(() => tickets.find((t) => t.id === ticketId) || null, [tickets, ticketId]);

    const handleOpen = () => {
        setOpen(true);
        markSeen();
    };

    const handleClose = () => {
        setOpen(false);
        setView("list");
        setTicketId(null);
    };

    const openThread = (id: string) => {
        setTicketId(id);
        setView("thread");
        markSeen();
    };

    const panel = (
        <div className="flex flex-col h-full min-h-0">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b shrink-0 bg-[#0175EC] text-white rounded-t-xl">
                {view !== "list" ? (
                    <button
                        onClick={() => {
                            setView("list");
                            setTicketId(null);
                        }}
                        className="p-1 rounded hover:bg-white/15"
                        aria-label="Voltar"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                ) : (
                    <Headphones className="w-4 h-4" />
                )}
                <span className="font-medium text-sm truncate flex-1">
                    {view === "new"
                        ? "Novo chamado"
                        : view === "thread"
                          ? ticket?.title || "Chamado"
                          : "Suporte Clinvia"}
                </span>
                <button onClick={handleClose} className="p-1 rounded hover:bg-white/15" aria-label="Fechar">
                    <X className="w-4 h-4" />
                </button>
            </div>

            {view === "list" && (
                <>
                    <div className="flex-1 overflow-y-auto">
                        {isLoading ? (
                            <p className="text-center text-sm text-muted-foreground py-8">Carregando...</p>
                        ) : tickets.length === 0 ? (
                            <div className="text-center text-sm text-muted-foreground py-10 px-4">
                                <Headphones className="w-10 h-10 mx-auto mb-2 opacity-40" />
                                <p>Você ainda não abriu nenhum chamado.</p>
                                <p className="text-xs mt-1">
                                    Clique em "Novo chamado" e fale direto com nosso time.
                                </p>
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
                                            {t.last_sender_type === "support" && t.status !== "resolved" && (
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
                            onClick={() => setView("new")}
                            className="w-full bg-[#0175EC] hover:bg-[#0165cc] text-white"
                        >
                            <Plus className="w-4 h-4 mr-1.5" />
                            Novo chamado
                        </Button>
                    </div>
                </>
            )}

            {view === "new" && (
                <div className="flex-1 overflow-y-auto">
                    <NewTicketForm
                        senderName={senderName}
                        onCreated={(id) => openThread(id)}
                        onCancel={() => setView("list")}
                    />
                </div>
            )}

            {view === "thread" && ticket && <SupportThread ticket={ticket} senderName={senderName} />}
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
                    {unread > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center animate-pulse">
                            {unread}
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
