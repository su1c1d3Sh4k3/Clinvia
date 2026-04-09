import { ReportCard } from "./ReportCard";
import { TicketMetrics, QueueMetrics, calcEvolution } from "@/hooks/useReportData";
import { MessageSquare, Clock, CheckCircle, AlertCircle, Users, Layers } from "lucide-react";

interface AttendanceReportProps {
    data: TicketMetrics;
    queues: QueueMetrics;
    comparison?: TicketMetrics | null;
    comparisonQueues?: QueueMetrics | null;
}

export function AttendanceReport({ data, queues, comparison, comparisonQueues }: AttendanceReportProps) {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <ReportCard
                    label="Total de Tickets"
                    value={data.total}
                    icon={<MessageSquare className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.total, comparison.total) : undefined}
                />
                <ReportCard
                    label="Abertos"
                    value={data.open}
                    icon={<AlertCircle className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.open, comparison.open) : undefined}
                />
                <ReportCard
                    label="Pendentes"
                    value={data.pending}
                    evolution={comparison ? calcEvolution(data.pending, comparison.pending) : undefined}
                />
                <ReportCard
                    label="Resolvidos"
                    value={data.resolved}
                    icon={<CheckCircle className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.resolved, comparison.resolved) : undefined}
                />
                <ReportCard
                    label="Fechados"
                    value={data.closed}
                    evolution={comparison ? calcEvolution(data.closed, comparison.closed) : undefined}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ReportCard
                    label="Tempo Médio de Resolução"
                    value={data.avgResolutionHours !== null ? `${data.avgResolutionHours}h` : "N/A"}
                    icon={<Clock className="w-4 h-4" />}
                    evolution={comparison?.avgResolutionHours !== null && data.avgResolutionHours !== null && comparison
                        ? calcEvolution(data.avgResolutionHours!, comparison.avgResolutionHours!)
                        : undefined}
                />
                <ReportCard
                    label="Taxa de Resolução"
                    value={data.total > 0 ? `${((data.resolved / data.total) * 100).toFixed(1)}` : "0"}
                    suffix="%"
                    icon={<CheckCircle className="w-4 h-4" />}
                />
            </div>

            {/* By Agent Table */}
            {data.byAgent.length > 0 && (
                <div className="rounded-xl border bg-card">
                    <div className="p-4 border-b">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Tickets por Atendente
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-muted-foreground">
                                    <th className="text-left p-3 font-medium">Atendente</th>
                                    <th className="text-right p-3 font-medium">Tickets</th>
                                    <th className="text-right p-3 font-medium">% do Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.byAgent.map((agent) => (
                                    <tr key={agent.agent_id} className="border-b last:border-0 hover:bg-muted/50">
                                        <td className="p-3">{agent.agent_name}</td>
                                        <td className="p-3 text-right font-medium">{agent.count}</td>
                                        <td className="p-3 text-right text-muted-foreground">
                                            {data.total > 0 ? ((agent.count / data.total) * 100).toFixed(1) : 0}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* By Queue Table */}
            {queues.byQueue.length > 0 && (
                <div className="rounded-xl border bg-card">
                    <div className="p-4 border-b">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Layers className="w-4 h-4" />
                            Conversas por Fila
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-muted-foreground">
                                    <th className="text-left p-3 font-medium">Fila</th>
                                    <th className="text-right p-3 font-medium">Conversas</th>
                                    <th className="text-right p-3 font-medium">% do Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {queues.byQueue.map((q, i) => {
                                    const total = queues.byQueue.reduce((s, q) => s + q.count, 0);
                                    return (
                                        <tr key={q.queue_id || i} className="border-b last:border-0 hover:bg-muted/50">
                                            <td className="p-3">{q.queue_name}</td>
                                            <td className="p-3 text-right font-medium">{q.count}</td>
                                            <td className="p-3 text-right text-muted-foreground">
                                                {total > 0 ? ((q.count / total) * 100).toFixed(1) : 0}%
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
