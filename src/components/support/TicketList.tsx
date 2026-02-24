import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Clock, Eye, Wrench, CheckCircle2, ChevronDown, ChevronUp, MessageSquare, AlertTriangle, Headphones } from "lucide-react";
import { cn } from "@/lib/utils";

// Reusing types again - should be refactored
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

interface TicketListProps {
    tickets: SupportTicket[];
    onSelectTicket: (ticket: SupportTicket) => void;
    isLoading: boolean;
}

const statusConfig: Record<Status, { label: string; icon: typeof Clock; color: string; bg: string }> = {
    open: { label: 'Aberto', icon: Clock, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/40' },
    viewed: { label: 'Visualizado', icon: Eye, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950/40' },
    in_progress: { label: 'Em Atendimento', icon: Wrench, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    resolved: { label: 'Concluído', icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/40' },
};

const priorityConfig: Record<Priority, { label: string; color: string; bg: string }> = {
    low: { label: 'Baixa', color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-800' },
    medium: { label: 'Média', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40' },
    high: { label: 'Alta', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/40' },
    urgent: { label: 'Urgente', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40' },
};

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function getInitials(name: string) {
    return name
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

function calculateDaysOpen(createdAt: string, status: Status, updatedAt: string): number {
    const start = new Date(createdAt);
    const end = status === 'resolved' ? new Date(updatedAt) : new Date();

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

export function TicketList({ tickets, isLoading }: { tickets: SupportTicket[], isLoading: boolean }) {
    const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

    const toggleExpand = (ticketId: string) => {
        setExpandedTicketId(current => current === ticketId ? null : ticketId);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8 bg-card rounded-lg border">
                <div className="flex flex-col items-center gap-2">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    <p className="text-sm text-muted-foreground">Carregando tickets...</p>
                </div>
            </div>
        );
    }

    if (tickets.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 bg-card rounded-lg border text-center">
                <div className="bg-muted p-3 rounded-full mb-4">
                    <div className="h-6 w-6 text-muted-foreground opacity-50" />
                    <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium">Nenhum ticket encontrado</h3>
                <p className="text-muted-foreground text-sm mt-1 max-w-sm">
                    Não há tickets de suporte correspondentes aos filtros selecionados.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-md border bg-card overflow-hidden">
            <Table>
                <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="w-[300px] text-[#005AA8] dark:text-muted-foreground">Assunto</TableHead>
                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Status</TableHead>
                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Prioridade</TableHead>
                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Dias em Aberto</TableHead>
                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Solicitante</TableHead>
                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Relato</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {tickets.map((ticket) => {
                        const status = statusConfig[ticket.status];
                        const priority = priorityConfig[ticket.priority];
                        const StatusIcon = status.icon;
                        const isExpanded = expandedTicketId === ticket.id;

                        if (isExpanded) {
                            return (
                                <TableRow key={ticket.id} className="hover:bg-transparent bg-muted/30 border-b">
                                    <TableCell colSpan={7} className="p-4">
                                        <div className="bg-card border rounded-xl shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                            {/* Header Section of the Card */}
                                            <div className="p-6 border-b flex flex-col md:flex-row gap-6 md:items-start justify-between bg-muted/10">
                                                <div className="space-y-4 flex-1">
                                                    <div className="flex items-center gap-3">
                                                        <Badge variant="outline" className={cn("gap-1.5 py-1 px-3 text-sm font-medium", status.color, status.bg, "border-transparent")}>
                                                            <StatusIcon className="h-4 w-4" />
                                                            {status.label}
                                                        </Badge>
                                                        <Badge variant="outline" className={cn("py-1 px-3 text-sm font-medium", priority.color, priority.bg, "border-transparent")}>
                                                            {priority.label}
                                                        </Badge>
                                                        <span className="text-xs text-muted-foreground flex items-center gap-1 bg-background px-2 py-1 rounded-md border">
                                                            <Clock className="h-3 w-3" />
                                                            {calculateDaysOpen(ticket.created_at, ticket.status, ticket.updated_at)} dias
                                                        </span>
                                                    </div>

                                                    <div>
                                                        <h3 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                                                            {ticket.title}
                                                        </h3>
                                                        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                                                            Criado em {formatDate(ticket.created_at)}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex flex-col items-end gap-3 min-w-[200px]">
                                                    <div className="flex items-center gap-3 bg-background p-2 rounded-lg border shadow-sm">
                                                        <Avatar className="h-10 w-10 border-2 border-border/50">
                                                            <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
                                                                {getInitials(ticket.creator_name)}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className="flex flex-col text-right mr-1">
                                                            <span className="text-sm font-semibold">{ticket.creator_name}</span>
                                                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Solicitante</span>
                                                        </div>
                                                    </div>

                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleExpand(ticket.id);
                                                        }}
                                                        className="text-muted-foreground hover:text-foreground"
                                                    >
                                                        Fechar detalhes <ChevronUp className="ml-2 h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Content Body */}
                                            <div className="grid md:grid-cols-2 gap-6 p-6">
                                                {/* Left Column: Client Context */}
                                                <div className="space-y-6">
                                                    <div className="space-y-3">
                                                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                                            <MessageSquare className="h-4 w-4" />
                                                            Relato do Cliente
                                                        </h4>
                                                        <div className="bg-muted/30 p-4 rounded-lg border-l-4 border-l-primary/20 text-sm italic text-muted-foreground leading-relaxed">
                                                            "{ticket.client_summary}"
                                                        </div>
                                                    </div>

                                                    <div className="space-y-3">
                                                        <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                                            <AlertTriangle className="h-4 w-4" />
                                                            Descrição Técnica
                                                        </h4>
                                                        <div className="text-sm leading-relaxed whitespace-pre-wrap bg-background p-4 rounded-lg border">
                                                            {ticket.description}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Right Column: Support Response */}
                                                <div className="space-y-3 flex flex-col h-full">
                                                    <h4 className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                                                        <Headphones className="h-4 w-4" />
                                                        Resposta do Suporte
                                                    </h4>

                                                    <div className={cn(
                                                        "flex-1 rounded-xl p-5 border relative transition-all",
                                                        ticket.support_response
                                                            ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900"
                                                            : "bg-muted/20 border-dashed"
                                                    )}>
                                                        {ticket.support_response ? (
                                                            <>
                                                                <div className="absolute top-4 right-4 text-emerald-600 dark:text-emerald-400">
                                                                    <CheckCircle2 className="h-5 w-5" />
                                                                </div>
                                                                <div className="prose prose-sm dark:prose-invert max-w-none">
                                                                    <p className="text-sm text-emerald-950 dark:text-emerald-100 whitespace-pre-wrap leading-relaxed">
                                                                        {ticket.support_response}
                                                                    </p>
                                                                </div>
                                                                <div className="mt-4 pt-4 border-t border-emerald-200/50 dark:border-emerald-800/50 text-right">
                                                                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                                                        Respondido em {formatDate(ticket.updated_at)}
                                                                    </span>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <div className="h-full flex flex-col items-center justify-center text-center gap-3 p-4">
                                                                <div className="bg-background p-3 rounded-full shadow-sm">
                                                                    <Clock className="h-6 w-6 text-muted-foreground/40" />
                                                                </div>
                                                                <div className="space-y-1">
                                                                    <p className="text-sm font-medium text-muted-foreground">Aguardando análise</p>
                                                                    <p className="text-xs text-muted-foreground/60 max-w-[200px] mx-auto">
                                                                        Nossa equipe técnica está analisando este chamado.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        }

                        // Standard Collapsed Row
                        return (
                            <TableRow
                                key={ticket.id}
                                className="cursor-pointer hover:bg-muted/50 transition-colors group"
                                onClick={() => toggleExpand(ticket.id)}
                            >
                                <TableCell className="font-medium">
                                    <div className="flex flex-col">
                                        <span className="truncate max-w-[280px] font-semibold text-foreground group-hover:text-primary transition-colors">
                                            {ticket.title}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                            {formatDate(ticket.created_at)}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className={cn("gap-1.5 font-normal", status.color, status.bg, "border-transparent")}>
                                        <StatusIcon className="h-3 w-3" />
                                        {status.label}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline" className={cn("font-normal", priority.color, priority.bg, "border-transparent")}>
                                        {priority.label}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                        <Clock className="h-3.5 w-3.5" />
                                        <span>
                                            {calculateDaysOpen(ticket.created_at, ticket.status, ticket.updated_at)} dias
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <Avatar className="h-6 w-6">
                                            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                                {getInitials(ticket.creator_name)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span className="text-sm text-muted-foreground truncate max-w-[120px]">
                                            {ticket.creator_name}
                                        </span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap max-w-[400px] line-clamp-3" title={ticket.client_summary}>
                                        {ticket.client_summary}
                                    </p>
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
