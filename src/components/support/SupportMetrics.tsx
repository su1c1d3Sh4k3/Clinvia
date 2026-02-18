import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, AlertTriangle, CheckCircle2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface SupportMetricsProps {
    total: number;
    open: number;
    urgent: number;
    resolved: number;
}

export function SupportMetrics({ total, open, urgent, resolved }: SupportMetricsProps) {
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                        Total de Tickets
                    </CardTitle>
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold">{total}</div>
                    <p className="text-xs text-muted-foreground">
                        Registrados no sistema
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                        Em Aberto
                    </CardTitle>
                    <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{open}</div>
                    <p className="text-xs text-muted-foreground">
                        Aguardando resolução
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                        Urgentes
                    </CardTitle>
                    <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">{urgent}</div>
                    <p className="text-xs text-muted-foreground">
                        Precisam de atenção
                    </p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">
                        Resolvidos
                    </CardTitle>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </CardHeader>
                <CardContent>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{resolved}</div>
                    <p className="text-xs text-muted-foreground">
                        Tickets concluídos
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
