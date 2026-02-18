import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Headphones, Filter, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { SupportMetrics } from "@/components/support/SupportMetrics";
import { TicketList } from "@/components/support/TicketList";

// Types (should act as source of truth if not moved to types file)
type Priority = 'low' | 'medium' | 'high' | 'urgent';
type Status = 'open' | 'viewed' | 'in_progress' | 'resolved';

interface SupportTicket {
    id: string;
    title: string;
    description: string;
    client_summary: string;
    priority: Priority;
    status: Status;
    creator_name: string;
    support_response: string | null;
    created_at: string;
    updated_at: string;
}

export default function Support() {
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [priorityFilter, setPriorityFilter] = useState<string>("all");

    const { data: tickets, isLoading } = useQuery({
        queryKey: ["support-tickets"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("support_tickets" as any)
                .select("*")
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data as unknown as SupportTicket[];
        },
        refetchInterval: 30000,
    });

    const filteredTickets = (tickets || []).filter(t => {
        if (statusFilter !== "all" && t.status !== statusFilter) return false;
        if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
        return true;
    });

    // Metrics Calculation
    const totalCount = tickets?.length || 0;
    const openCount = (tickets || []).filter(t => t.status === 'open' || t.status === 'viewed').length;
    const urgentCount = (tickets || []).filter(t => t.priority === 'urgent' || t.priority === 'high').length;
    const resolvedCount = (tickets || []).filter(t => t.status === 'resolved').length;

    return (
        <div className="h-screen flex flex-col bg-background">
            {/* Header */}
            <div className="border-b p-4 md:p-6 bg-card flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Headphones className="h-6 w-6" />
                        Suporte
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Gerencie seus tickets de suporte e acompanhe as solicitações.
                    </p>
                </div>

            </div>

            <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
                {/* Metrics Section */}
                <SupportMetrics
                    total={totalCount}
                    open={openCount}
                    urgent={urgentCount}
                    resolved={resolvedCount}
                />

                {/* Filters Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">Filtros:</span>

                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-9 w-[150px] text-sm">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos Status</SelectItem>
                                <SelectItem value="open">Aberto</SelectItem>
                                <SelectItem value="viewed">Visualizado</SelectItem>
                                <SelectItem value="in_progress">Em Atendimento</SelectItem>
                                <SelectItem value="resolved">Concluído</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                            <SelectTrigger className="h-9 w-[150px] text-sm">
                                <SelectValue placeholder="Prioridade" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas Prioridades</SelectItem>
                                <SelectItem value="urgent">Urgente</SelectItem>
                                <SelectItem value="high">Alta</SelectItem>
                                <SelectItem value="medium">Média</SelectItem>
                                <SelectItem value="low">Baixa</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="text-sm text-muted-foreground">
                        Mostrando {filteredTickets.length} de {totalCount} tickets
                    </div>
                </div>

                {/* Ticket List Table */}
                <TicketList
                    tickets={filteredTickets}
                    isLoading={isLoading}
                />
            </main>
        </div>
    );
}
