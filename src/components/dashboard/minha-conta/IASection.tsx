import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, Building2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMyIAStatus } from "@/hooks/useMinhaConta";

export function IASection() {
    const { data: ia, isLoading } = useMyIAStatus();

    return (
        <Card className="rounded-2xl border border-border/50 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                    <Bot className="w-4 h-4 text-teal-500" />
                    IA
                </CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <p className="text-sm text-muted-foreground">Carregando...</p>
                ) : (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">
                                    {ia?.agentName || "Sem nome configurado"}
                                </p>
                                <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                                    <Building2 className="w-3 h-3 shrink-0" />
                                    {ia?.companyName || "Empresa não configurada"}
                                </p>
                            </div>
                            <Badge
                                className={cn(
                                    "text-[10px] shrink-0",
                                    ia?.iaOn
                                        ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15"
                                        : "bg-red-500/15 text-red-600 hover:bg-red-500/15"
                                )}
                            >
                                {ia?.iaOn ? "Ligada" : "Desligada"}
                            </Badge>
                        </div>

                        <div>
                            <p className="text-[11px] text-muted-foreground mb-1.5">
                                Instâncias com IA ativa
                            </p>
                            {ia?.iaOn && ia.activeInstances.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                    {ia.activeInstances.map((i) => (
                                        <Badge key={i.id} variant="outline" className="text-[10px] gap-1">
                                            <MessageSquare className="w-3 h-3 text-emerald-500" />
                                            {i.name}
                                        </Badge>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    {ia?.iaOn ? "Nenhuma instância com IA ativa" : "IA desligada — nenhuma instância ativa"}
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
