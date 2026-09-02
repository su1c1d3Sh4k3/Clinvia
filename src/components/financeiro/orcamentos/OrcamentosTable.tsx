import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText } from "lucide-react";
import { format } from "date-fns";
import { useOrcamentosTable } from "@/hooks/useFinanceiro";

const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const dt = (iso: string) => format(new Date(iso), "dd/MM/yyyy HH:mm");

interface Props {
    onOpenContact: (contact: { id: string; push_name: string }) => void;
}

export function OrcamentosTable({ onOpenContact }: Props) {
    const { data = [], isLoading } = useOrcamentosTable();

    return (
        <Card className="relative group overflow-hidden rounded-2xl bg-background/80 backdrop-blur-xl border-border/50 shadow-sm transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-background/5 opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none blur-xl" />
            <div className="relative z-10">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <FileText className="w-5 h-5 text-blue-500" />
                        Orçamentos realizados
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Mais recentes no topo. Clique no nome do cliente para abrir a ficha na aba Orçamentos.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <Skeleton className="h-80 w-full" />
                    ) : data.length === 0 ? (
                        <p className="text-center text-muted-foreground py-10 text-sm">
                            Nenhum orçamento registrado ainda.
                        </p>
                    ) : (
                        <div className="max-h-[520px] overflow-auto rounded-lg border nav-scrollbar">
                            <Table>
                                <TableHeader className="sticky top-0 z-10 bg-background">
                                    <TableRow>
                                        <TableHead className="whitespace-nowrap">Data</TableHead>
                                        <TableHead className="whitespace-nowrap">Cliente</TableHead>
                                        <TableHead className="whitespace-nowrap">Profissional</TableHead>
                                        <TableHead className="whitespace-nowrap text-center">Itens</TableHead>
                                        <TableHead className="whitespace-nowrap text-right">Orçado</TableHead>
                                        <TableHead className="whitespace-nowrap text-right">Vendido</TableHead>
                                        <TableHead className="whitespace-nowrap">Situação</TableHead>
                                        <TableHead className="whitespace-nowrap">Indicação</TableHead>
                                        <TableHead className="whitespace-nowrap">Validade</TableHead>
                                        <TableHead className="whitespace-nowrap">Criado por</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.map((o) => (
                                        <TableRow key={o.id} className="hover:bg-muted/50">
                                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                                {dt(o.created_at)}
                                            </TableCell>
                                            <TableCell>
                                                {o.contact_id ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => onOpenContact({ id: o.contact_id!, push_name: o.contact_name || "Cliente" })}
                                                        className="font-medium text-primary hover:underline text-left truncate max-w-[180px]"
                                                    >
                                                        {o.contact_name || "Sem nome"}
                                                    </button>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="truncate max-w-[150px]">
                                                {o.responsavel_name || "—"}
                                            </TableCell>
                                            <TableCell className="text-center">{o.itens}</TableCell>
                                            <TableCell className="text-right whitespace-nowrap">{fmt(o.valor_total)}</TableCell>
                                            <TableCell className="text-right whitespace-nowrap font-semibold text-emerald-500">
                                                {Number(o.valor_vendido) > 0 ? fmt(o.valor_vendido) : "—"}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {o.pendentes > 0 && (
                                                        <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
                                                            {o.pendentes} pendente{o.pendentes > 1 ? "s" : ""}
                                                        </Badge>
                                                    )}
                                                    {o.vendidos > 0 && (
                                                        <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
                                                            {o.vendidos} vendido{o.vendidos > 1 ? "s" : ""}
                                                        </Badge>
                                                    )}
                                                    {o.recusados > 0 && (
                                                        <Badge variant="outline" className="border-rose-500/50 text-rose-600 dark:text-rose-400">
                                                            {o.recusados} recusado{o.recusados > 1 ? "s" : ""}
                                                        </Badge>
                                                    )}
                                                    {o.expirados > 0 && (
                                                        <Badge variant="outline" className="border-muted-foreground/40 text-muted-foreground">
                                                            {o.expirados} expirado{o.expirados > 1 ? "s" : ""}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="truncate max-w-[140px] text-xs">
                                                {o.indicacao || "—"}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap text-xs">
                                                {o.validade ? format(new Date(`${o.validade}T00:00:00`), "dd/MM/yyyy") : "—"}
                                            </TableCell>
                                            <TableCell className="truncate max-w-[130px] text-xs text-muted-foreground">
                                                {o.criado_por || "—"}
                                            </TableCell>
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
