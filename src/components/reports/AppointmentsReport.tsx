import { ReportCard } from "./ReportCard";
import { AppointmentMetrics, calcEvolution } from "@/hooks/useReportData";
import { Calendar, CheckCircle, Clock, RefreshCw, XCircle, Users, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppointmentsReportProps {
    data: AppointmentMetrics;
    comparison?: AppointmentMetrics | null;
}

export function AppointmentsReport({ data, comparison }: AppointmentsReportProps) {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <ReportCard
                    label="Total"
                    value={data.total}
                    icon={<Calendar className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.total, comparison.total) : undefined}
                />
                <ReportCard
                    label="Pendentes"
                    value={data.pending}
                    icon={<Clock className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.pending, comparison.pending) : undefined}
                />
                <ReportCard
                    label="Confirmados"
                    value={data.confirmed}
                    icon={<CheckCircle className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.confirmed, comparison.confirmed) : undefined}
                />
                <ReportCard
                    label="Concluídos"
                    value={data.completed}
                    evolution={comparison ? calcEvolution(data.completed, comparison.completed) : undefined}
                />
                <ReportCard
                    label="Reagendados"
                    value={data.rescheduled}
                    icon={<RefreshCw className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.rescheduled, comparison.rescheduled) : undefined}
                />
                <ReportCard
                    label="Cancelados"
                    value={data.canceled}
                    icon={<XCircle className="w-4 h-4" />}
                    evolution={comparison ? calcEvolution(data.canceled, comparison.canceled) : undefined}
                />
            </div>

            {/* By Professional Table */}
            {data.byProfessional.length > 0 && (
                <div className="rounded-xl border bg-card">
                    <div className="p-4 border-b">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Agendamentos por Profissional
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-muted-foreground">
                                    <th className="text-left p-3 font-medium">Profissional</th>
                                    <th className="text-right p-3 font-medium">Agendamentos</th>
                                    <th className="text-right p-3 font-medium">% do Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.byProfessional.map((prof) => (
                                    <tr key={prof.professional_id} className="border-b last:border-0 hover:bg-muted/50">
                                        <td className="p-3">{prof.professional_name}</td>
                                        <td className="p-3 text-right font-medium">{prof.count}</td>
                                        <td className="p-3 text-right text-muted-foreground">
                                            {data.total > 0 ? ((prof.count / data.total) * 100).toFixed(1) : 0}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Occupancy Table */}
            {data.occupancyByProfessional.length > 0 && (
                <div className="rounded-xl border bg-card">
                    <div className="p-4 border-b">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" />
                            Ocupação da Agenda por Profissional
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-muted-foreground">
                                    <th className="text-left p-3 font-medium">Profissional</th>
                                    <th className="text-right p-3 font-medium">Horas Disponíveis</th>
                                    <th className="text-right p-3 font-medium">Horas Agendadas</th>
                                    <th className="text-right p-3 font-medium">Ocupação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.occupancyByProfessional.map((prof) => (
                                    <tr key={prof.professional_id} className="border-b last:border-0 hover:bg-muted/50">
                                        <td className="p-3">{prof.professional_name}</td>
                                        <td className="p-3 text-right">{prof.totalHours}h</td>
                                        <td className="p-3 text-right">{prof.bookedHours}h</td>
                                        <td className="p-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <div className="w-20 h-2 bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className={cn(
                                                            "h-full rounded-full transition-all",
                                                            prof.occupancy >= 80 ? "bg-green-500" :
                                                            prof.occupancy >= 50 ? "bg-yellow-500" : "bg-red-500"
                                                        )}
                                                        style={{ width: `${Math.min(prof.occupancy, 100)}%` }}
                                                    />
                                                </div>
                                                <span className="font-medium min-w-[3rem] text-right">{prof.occupancy}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
