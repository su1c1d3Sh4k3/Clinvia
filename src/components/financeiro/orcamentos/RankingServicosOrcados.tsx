import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy } from "lucide-react";
import { PeriodFilter, PERIOD_OPTIONS, resolvePeriod, type PeriodKey } from "@/components/financeiro/PeriodFilter";
import { useRankingServicosOrcados } from "@/hooks/useFinanceiro";

const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const OPTIONS = PERIOD_OPTIONS.filter((o) => o.value !== "todo");

export function RankingServicosOrcados() {
    const [period, setPeriod] = useState<PeriodKey>("30d");
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const range = resolvePeriod(period, customStart, customEnd);
    const { data = [], isLoading } = useRankingServicosOrcados(range.start, range.end);

    return (
        <Card className="relative group overflow-hidden rounded-2xl bg-background/80 backdrop-blur-xl border-border/50 shadow-sm transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-bl from-emerald-500/5 via-transparent to-background/5 opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none blur-xl" />
            <div className="relative z-10">
                <CardHeader className="pb-3 space-y-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Trophy className="w-5 h-5 text-emerald-500" />
                        Ranking de serviços orçados
                    </CardTitle>
                    <PeriodFilter
                        period={period}
                        onPeriodChange={setPeriod}
                        customStart={customStart}
                        customEnd={customEnd}
                        onCustomStartChange={setCustomStart}
                        onCustomEndChange={setCustomEnd}
                        options={OPTIONS}
                    />
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <Skeleton className="h-64 w-full" />
                    ) : data.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8 text-sm">
                            Nenhum serviço orçado neste período.
                        </p>
                    ) : (
                        <div className="max-h-[380px] overflow-auto rounded-lg border nav-scrollbar">
                            <Table>
                                <TableHeader className="sticky top-0 z-10 bg-background">
                                    <TableRow>
                                        <TableHead className="w-10 text-center">#</TableHead>
                                        <TableHead>Serviço</TableHead>
                                        <TableHead className="text-center">Orçados</TableHead>
                                        <TableHead className="text-center">Vendidos</TableHead>
                                        <TableHead className="text-right">Valor</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.map((s, i) => (
                                        <TableRow key={s.name} className="hover:bg-muted/50">
                                            <TableCell className="text-center text-muted-foreground font-bold">{i + 1}</TableCell>
                                            <TableCell className="font-medium truncate max-w-[200px]">{s.name}</TableCell>
                                            <TableCell className="text-center font-bold">{s.itens}</TableCell>
                                            <TableCell className="text-center text-emerald-500 font-semibold">{s.vendidos}</TableCell>
                                            <TableCell className="text-right whitespace-nowrap">{fmt(s.valor)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </div>
        </Card>
    );
}
