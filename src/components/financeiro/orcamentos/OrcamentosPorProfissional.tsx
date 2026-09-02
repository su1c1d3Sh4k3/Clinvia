import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Briefcase } from "lucide-react";
import { PeriodFilter, PERIOD_OPTIONS, resolvePeriod, type PeriodKey } from "@/components/financeiro/PeriodFilter";
import { useOrcamentosByResponsavel } from "@/hooks/useFinanceiro";

const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const OPTIONS = PERIOD_OPTIONS.filter((o) => o.value !== "todo");

export function OrcamentosPorProfissional() {
    const [period, setPeriod] = useState<PeriodKey>("30d");
    const [customStart, setCustomStart] = useState("");
    const [customEnd, setCustomEnd] = useState("");
    const range = resolvePeriod(period, customStart, customEnd);
    const { data = [], isLoading } = useOrcamentosByResponsavel(range.start, range.end);

    return (
        <Card className="relative group overflow-hidden rounded-2xl bg-background/80 backdrop-blur-xl border-border/50 shadow-sm transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-background/5 opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none blur-xl" />
            <div className="relative z-10">
                <CardHeader className="pb-3 space-y-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Briefcase className="w-5 h-5 text-purple-500" />
                        Orçamentos por profissional
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
                            Nenhum profissional cadastrado.
                        </p>
                    ) : (
                        <div className="max-h-[380px] overflow-auto rounded-lg border nav-scrollbar">
                            <Table>
                                <TableHeader className="sticky top-0 z-10 bg-background">
                                    <TableRow>
                                        <TableHead>Profissional</TableHead>
                                        <TableHead className="text-center whitespace-nowrap">Orçamentos</TableHead>
                                        <TableHead className="text-center">Itens</TableHead>
                                        <TableHead className="text-right">Valor</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.map((r) => (
                                        <TableRow key={r.id} className="hover:bg-muted/50">
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarImage src={r.photo_url || undefined} />
                                                        <AvatarFallback className="text-xs">
                                                            {r.name?.[0]?.toUpperCase() || "P"}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="min-w-0">
                                                        <p className="font-medium truncate max-w-[140px]">{r.name}</p>
                                                        {r.role && (
                                                            <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">{r.role}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center font-bold">{r.orcamentos}</TableCell>
                                            <TableCell className="text-center text-muted-foreground">{r.itens}</TableCell>
                                            <TableCell className="text-right whitespace-nowrap">{fmt(r.valor)}</TableCell>
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
