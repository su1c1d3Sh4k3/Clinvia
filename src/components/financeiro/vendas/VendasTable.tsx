import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShoppingCart } from "lucide-react";
import { format } from "date-fns";
import { useSalesTable } from "@/hooks/useFinanceiro";

const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const PAYMENT_LABEL: Record<string, string> = {
    pending: "Pendente",
    cash: "À vista",
    installment: "Parcelado",
    mixed: "Misto",
};

interface Props {
    onOpenContact: (contact: { id: string; push_name: string }) => void;
}

export function VendasTable({ onOpenContact }: Props) {
    const { data = [], isLoading } = useSalesTable();

    return (
        <Card className="relative group overflow-hidden rounded-2xl bg-background/80 backdrop-blur-xl border-border/50 shadow-sm transition-all duration-300">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-background/5 opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none blur-xl" />
            <div className="relative z-10">
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <ShoppingCart className="w-5 h-5 text-emerald-500" />
                        Vendas realizadas
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Mais recentes no topo. Clique no nome do cliente para abrir a ficha na aba Vendas.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <Skeleton className="h-80 w-full" />
                    ) : data.length === 0 ? (
                        <p className="text-center text-muted-foreground py-10 text-sm">
                            Nenhuma venda registrada ainda.
                        </p>
                    ) : (
                        <div className="max-h-[520px] overflow-auto rounded-lg border nav-scrollbar">
                            <Table>
                                <TableHeader className="sticky top-0 z-10 bg-background">
                                    <TableRow>
                                        <TableHead className="whitespace-nowrap">Data</TableHead>
                                        <TableHead className="whitespace-nowrap">Cliente</TableHead>
                                        <TableHead className="whitespace-nowrap">Item</TableHead>
                                        <TableHead className="whitespace-nowrap text-center">Qtd</TableHead>
                                        <TableHead className="whitespace-nowrap text-right">Valor</TableHead>
                                        <TableHead className="whitespace-nowrap">Pagamento</TableHead>
                                        <TableHead className="whitespace-nowrap">Agendamento</TableHead>
                                        <TableHead className="whitespace-nowrap">Profissional</TableHead>
                                        <TableHead className="whitespace-nowrap">Sala</TableHead>
                                        <TableHead className="whitespace-nowrap">Atendente</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.map((s) => (
                                        <TableRow key={s.id} className="hover:bg-muted/50">
                                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                                {format(new Date(`${s.sale_date}T00:00:00`), "dd/MM/yyyy")}
                                            </TableCell>
                                            <TableCell>
                                                {s.contact_id ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => onOpenContact({ id: s.contact_id!, push_name: s.contact_name || "Cliente" })}
                                                        className="font-medium text-primary hover:underline text-left truncate max-w-[180px]"
                                                    >
                                                        {s.contact_name || "Sem nome"}
                                                    </button>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="truncate max-w-[200px]">
                                                {s.product_name || "—"}
                                            </TableCell>
                                            <TableCell className="text-center">{s.quantity}</TableCell>
                                            <TableCell className="text-right whitespace-nowrap font-semibold text-emerald-500">
                                                {fmt(s.total_amount)}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap text-xs">
                                                {s.payment_type === "installment" && s.parcelas_total > 0 ? (
                                                    <Badge variant="outline" className="border-blue-500/50 text-blue-600 dark:text-blue-400">
                                                        {s.parcelas_pagas}/{s.parcelas_total} pagas
                                                    </Badge>
                                                ) : s.payment_type === "pending" ? (
                                                    <Badge variant="outline" className="border-amber-500/50 text-amber-600 dark:text-amber-400">
                                                        Pendente
                                                    </Badge>
                                                ) : (
                                                    <span className="text-muted-foreground">
                                                        {PAYMENT_LABEL[s.payment_type] || s.payment_type}
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap text-xs">
                                                {s.appointment_id ? (
                                                    s.appointment_alert === "canceled" ? (
                                                        <Badge variant="outline" className="border-rose-500/50 text-rose-600 dark:text-rose-400">
                                                            Cancelado
                                                        </Badge>
                                                    ) : s.appointment_alert === "no_show" ? (
                                                        <Badge variant="outline" className="border-rose-500/50 text-rose-600 dark:text-rose-400">
                                                            Faltou
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
                                                            Agendado
                                                        </Badge>
                                                    )
                                                ) : s.ia_scheduling ? (
                                                    <span className="text-muted-foreground">Agendamento programado</span>
                                                ) : (
                                                    <span className="text-muted-foreground">Aguardando agendamento</span>
                                                )}
                                            </TableCell>
                                            <TableCell className="truncate max-w-[140px] text-xs">
                                                {s.responsavel_name || "—"}
                                            </TableCell>
                                            <TableCell className="truncate max-w-[130px] text-xs text-muted-foreground">
                                                {s.sala_name || "—"}
                                            </TableCell>
                                            <TableCell className="truncate max-w-[130px] text-xs text-muted-foreground">
                                                {s.atendente_name || "—"}
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
