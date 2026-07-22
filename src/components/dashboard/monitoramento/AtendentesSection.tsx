import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStaff } from "@/hooks/useStaff";
import { AgentTicketCounts, useTeamOnlineStatus } from "@/hooks/useMonitoramento";

interface AtendentesSectionProps {
    agentCounts: Map<string, AgentTicketCounts> | undefined;
}

export function AtendentesSection({ agentCounts }: AtendentesSectionProps) {
    const { data: staff } = useStaff();
    const { data: onlineSet } = useTeamOnlineStatus();

    return (
        <Card className="rounded-2xl border border-border/50 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="w-4 h-4 text-violet-500" />
                    Atendentes
                </CardTitle>
            </CardHeader>
            <CardContent>
                {!staff || staff.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum atendente cadastrado</p>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {staff.map((m) => {
                            const online = onlineSet?.has(m.id) ?? false;
                            const counts = agentCounts?.get(m.id) || { open: 0, pending: 0 };
                            return (
                                <div
                                    key={m.id}
                                    className="flex items-center gap-3 p-2.5 rounded-lg border border-border/40 bg-muted/20"
                                >
                                    <Avatar className="h-9 w-9 shrink-0">
                                        <AvatarImage src={m.avatar_url || undefined} alt={m.name} />
                                        <AvatarFallback className="text-xs">
                                            {m.name.slice(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium truncate">{m.name}</p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {counts.open} abertos · {counts.pending} pendentes
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span
                                            className={cn(
                                                "h-2 w-2 rounded-full",
                                                online ? "bg-emerald-500" : "bg-muted-foreground/40"
                                            )}
                                        />
                                        <span className="text-[11px] text-muted-foreground">
                                            {online ? "Online" : "Offline"}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
