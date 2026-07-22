import { useEffect, useMemo, useState } from "react";
import { FaWhatsapp, FaInstagram } from "react-icons/fa";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ConversationChatModal } from "@/components/queues/ConversationChatModal";
import { ClientProfileModal } from "@/components/contacts/ClientProfileModal";
import { useUserRole } from "@/hooks/useUserRole";
import { useStaff, useCurrentTeamMember } from "@/hooks/useStaff";
import {
    MONITOR_STAGES,
    MonitorCard,
    lastMsgFromClient,
    useMonitorConversations,
    useMonitorInstances,
} from "@/hooks/useMonitoramento";
import { StageBoard } from "./StageBoard";
import { AtendentesSection } from "./AtendentesSection";

const UNASSIGNED_STAGES = ["Em Atendimento Humano", "Suporte", "Financeiro", "Pós-Venda"];

export function MonitoramentoTab() {
    const { data: userRole } = useUserRole();
    const { data: currentTeamMember } = useCurrentTeamMember();
    const { data: staff } = useStaff();
    const { data: monitorData, isLoading } = useMonitorConversations();
    const { data: instances } = useMonitorInstances();

    const [channel, setChannel] = useState<"whatsapp" | "instagram">("whatsapp");
    const [attendantFilter, setAttendantFilter] = useState("all"); // all | ia | unassigned | <team_member_id>
    const [responseFilter, setResponseFilter] = useState("all"); // all | sem_resposta | respondido
    const [instanceFilter, setInstanceFilter] = useState("all");
    const [search, setSearch] = useState("");

    // Re-render every minute to keep time labels / window countdown fresh
    const [nowTick, setNowTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setNowTick((v) => v + 1), 60_000);
        return () => clearInterval(t);
    }, []);

    // Reset instance filter when switching channel
    useEffect(() => {
        setInstanceFilter("all");
    }, [channel]);

    const staffById = useMemo(() => {
        const map = new Map<string, string>();
        (staff || []).forEach((m) => map.set(m.id, m.name));
        return map;
    }, [staff]);

    const filteredCards = useMemo(() => {
        let cards = (monitorData?.cards || []).filter((c) => c.channel === channel);

        if (attendantFilter === "ia") {
            cards = cards.filter((c) => c.stage === "Em Atendimento IA");
        } else if (attendantFilter === "unassigned") {
            cards = cards.filter(
                (c) => UNASSIGNED_STAGES.includes(c.stage) && !c.assignedAgentId
            );
        } else if (attendantFilter !== "all") {
            cards = cards.filter((c) => c.assignedAgentId === attendantFilter);
        }

        if (responseFilter === "sem_resposta") {
            cards = cards.filter((c) => lastMsgFromClient(c));
        } else if (responseFilter === "respondido") {
            cards = cards.filter((c) => !lastMsgFromClient(c));
        }

        if (instanceFilter !== "all") {
            cards = cards.filter((c) => c.instanceId === instanceFilter);
        }

        const term = search.trim().toLowerCase();
        if (term) {
            const digits = term.replace(/\D/g, "");
            cards = cards.filter((c) => {
                const name = (c.contact.push_name || "").toLowerCase();
                if (name.includes(term)) return true;
                if (!digits) return false;
                const phone = (c.contact.phone || c.contact.number || "").replace(/\D/g, "");
                return phone.includes(digits);
            });
        }

        return cards;
    }, [monitorData, channel, attendantFilter, responseFilter, instanceFilter, search]);

    const cardsByStage = useMemo(() => {
        const map = new Map<string, MonitorCard[]>();
        MONITOR_STAGES.forEach((s) => map.set(s, []));
        filteredCards.forEach((c) => {
            map.get(c.stage)?.push(c);
        });
        return map;
    }, [filteredCards]);

    const attendantNameOf = (card: MonitorCard): string => {
        if (card.stage === "Em Atendimento IA") return "Atendimento IA";
        if (!card.assignedAgentId) return "Pendente";
        return staffById.get(card.assignedAgentId) || "Pendente";
    };

    const canOpenChat = (card: MonitorCard): boolean => {
        if (userRole === "admin" || userRole === "supervisor") return true;
        return !!currentTeamMember && card.assignedAgentId === currentTeamMember.id;
    };

    const [chatCard, setChatCard] = useState<MonitorCard | null>(null);
    const [profileCard, setProfileCard] = useState<MonitorCard | null>(null);

    const instanceOptions =
        channel === "whatsapp"
            ? (instances?.whatsapp || []).map((i) => ({ id: i.id, name: i.name }))
            : instances?.instagram || [];

    return (
        <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* ── Filter bar ── */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5 shrink-0">
                    <Button
                        variant={channel === "whatsapp" ? "secondary" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setChannel("whatsapp")}
                        title="WhatsApp"
                    >
                        <FaWhatsapp
                            className={`h-4 w-4 ${channel === "whatsapp" ? "text-green-500" : "text-muted-foreground"}`}
                        />
                    </Button>
                    <Button
                        variant={channel === "instagram" ? "secondary" : "ghost"}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setChannel("instagram")}
                        title="Instagram"
                    >
                        <FaInstagram
                            className={`h-4 w-4 ${channel === "instagram" ? "text-pink-500" : "text-muted-foreground"}`}
                        />
                    </Button>
                </div>

                <Select value={attendantFilter} onValueChange={setAttendantFilter}>
                    <SelectTrigger className="h-8 w-[190px] text-xs">
                        <SelectValue placeholder="Atendente" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos os atendentes</SelectItem>
                        <SelectItem value="ia">Atendimento IA</SelectItem>
                        <SelectItem value="unassigned">Não atribuídos</SelectItem>
                        {(staff || []).map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                                {m.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={responseFilter} onValueChange={setResponseFilter}>
                    <SelectTrigger className="h-8 w-[150px] text-xs">
                        <SelectValue placeholder="Resposta" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todas as respostas</SelectItem>
                        <SelectItem value="sem_resposta">Sem Resposta</SelectItem>
                        <SelectItem value="respondido">Respondido</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={instanceFilter} onValueChange={setInstanceFilter}>
                    <SelectTrigger className="h-8 w-[170px] text-xs">
                        <SelectValue placeholder="Instância" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todas as instâncias</SelectItem>
                        {instanceOptions.map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                                {i.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por nome ou telefone..."
                        className="h-8 pl-8 text-xs"
                    />
                </div>
            </div>

            {/* ── Stage boards ── */}
            {isLoading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-24 w-full rounded-2xl" />
                    ))}
                </div>
            ) : (
                <div className="space-y-3">
                    {MONITOR_STAGES.map((stage) => (
                        <StageBoard
                            key={stage}
                            stage={stage}
                            cards={cardsByStage.get(stage) || []}
                            attendantNameOf={attendantNameOf}
                            canOpenChat={canOpenChat}
                            onOpenChat={setChatCard}
                            onOpenProfile={setProfileCard}
                            nowTick={nowTick}
                        />
                    ))}
                </div>
            )}

            {/* ── Atendentes ── */}
            <AtendentesSection agentCounts={monitorData?.agentCounts} />

            {/* ── Modals ── */}
            {chatCard && (
                <ConversationChatModal
                    open={!!chatCard}
                    onOpenChange={(o) => !o && setChatCard(null)}
                    contactId={chatCard.contactId}
                    contactName={chatCard.contact.push_name || "Sem nome"}
                />
            )}
            <ClientProfileModal
                open={!!profileCard}
                onOpenChange={(o) => !o && setProfileCard(null)}
                contact={profileCard?.contact || null}
            />
        </div>
    );
}
