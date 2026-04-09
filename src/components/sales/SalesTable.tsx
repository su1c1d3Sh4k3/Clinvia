import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Receipt,
    Plus,
    Pencil,
    Trash2,
    ChevronLeft,
    ChevronRight,
    Check,
    Clock,
    AlertCircle,
} from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { useSales, useDeleteSale } from "@/hooks/useSales";
import { usePermissions } from "@/hooks/usePermissions";
import type { Sale } from "@/types/sales";
import { SaleCategoryLabels, PaymentTypeLabels } from "@/types/sales";
import { SaleModal } from "./SaleModal";

interface SalesTableProps {
    month: number;
    year: number;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

const calculatePriceAdjustment = (soldPrice: number, basePrice: number): string | null => {
    if (!basePrice || basePrice === 0) return null;

    const diff = soldPrice - basePrice;
    if (Math.abs(diff) < 0.01) return null; // No significant difference

    const percentage = (diff / basePrice) * 100;
    const sign = percentage > 0 ? '+' : '';
    return `${sign}${percentage.toFixed(0)}%`;
};

export function SalesTable({ month, year }: SalesTableProps) {
    const { canEdit, canDelete } = usePermissions();

    // Modal states
    const [modalOpen, setModalOpen] = useState(false);
    const [editingSale, setEditingSale] = useState<Sale | null>(null);

    // Delete confirmation
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

    // Pagination
    const [pageSize] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);

    // Period filter
    const [periodFilter, setPeriodFilter] = useState<string>("30");
    const [customStartDate, setCustomStartDate] = useState("");
    const [customEndDate, setCustomEndDate] = useState("");

    // Calculate date range based on filter
    const getDateRange = () => {
        const today = new Date();

        // Custom filter with dates
        if (periodFilter === "custom" && customStartDate && customEndDate) {
            return { startDate: customStartDate, endDate: customEndDate };
        }

        // Custom filter without dates yet - use default 30 days
        if (periodFilter === "custom") {
            const startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 30);
            return {
                startDate: startDate.toISOString().split('T')[0],
                endDate: today.toISOString().split('T')[0],
            };
        }

        // Standard filter (7, 15, 30 days)
        const days = parseInt(periodFilter) || 30;
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - days);

        return {
            startDate: startDate.toISOString().split('T')[0],
            endDate: today.toISOString().split('T')[0],
        };
    };

    const { startDate, endDate } = getDateRange();
    const { data: sales = [], isLoading } = useSales(startDate, endDate);
    const deleteSale = useDeleteSale();

    // Paginated data
    const paginatedSales = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sales.slice(start, start + pageSize);
    }, [sales, currentPage, pageSize]);

    const totalPages = Math.ceil(sales.length / pageSize);

    const handleNewClick = () => {
        setEditingSale(null);
        setModalOpen(true);
    };

    const handleEditClick = (sale: Sale) => {
        setEditingSale(sale);
        setModalOpen(true);
    };

    const handleDeleteClick = (sale: Sale) => {
        setDeleteTarget({ id: sale.id, name: sale.product_service?.name || 'Venda' });
        setDeleteDialogOpen(true);
    };

    const handleDelete = async () => {
        if (deleteTarget) {
            await deleteSale.mutateAsync(deleteTarget.id);
            setDeleteDialogOpen(false);
            setDeleteTarget(null);
        }
    };

    return (
        <>
            <Card>
                <CardHeader className="pt-4 px-3 md:px-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                                <Receipt className="w-4 h-4 md:w-5 md:h-5 text-purple-500" />
                                Vendas
                            </CardTitle>
                            <CardDescription className="text-xs md:text-sm">
                                {sales.length} vendas no período
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 md:gap-4 flex-wrap">
                            {/* Period Filter */}
                            <Select
                                value={periodFilter}
                                onValueChange={(value) => {
                                    setPeriodFilter(value);
                                    setCurrentPage(1);
                                    // Reset custom dates when changing filter
                                    if (value !== 'custom') {
                                        setCustomStartDate('');
                                        setCustomEndDate('');
                                    }
                                }}
                            >
                                <SelectTrigger className="w-[120px] h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="7">7 dias</SelectItem>
                                    <SelectItem value="15">15 dias</SelectItem>
                                    <SelectItem value="30">30 dias</SelectItem>
                                    <SelectItem value="custom">Personalizado</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Custom Date Fields */}
                            {periodFilter === 'custom' && (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="date"
                                        value={customStartDate}
                                        onChange={(e) => setCustomStartDate(e.target.value)}
                                        className="h-8 px-2 text-xs border rounded-md bg-background"
                                    />
                                    <span className="text-xs text-muted-foreground">até</span>
                                    <input
                                        type="date"
                                        value={customEndDate}
                                        onChange={(e) => setCustomEndDate(e.target.value)}
                                        className="h-8 px-2 text-xs border rounded-md bg-background"
                                    />
                                </div>
                            )}

                            <Button className="gap-1 md:gap-2 h-8 md:h-9 text-xs md:text-sm" onClick={handleNewClick}>
                                <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                <span className="hidden sm:inline">Nova </span>Venda
                            </Button>
                        </div>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-end gap-2 mt-4">
                            <span className="text-sm text-muted-foreground">
                                Página {currentPage} de {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    )}
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <Skeleton className="h-64 w-full" />
                    ) : (
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Categoria</TableHead>
                                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Item</TableHead>
                                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Valor</TableHead>
                                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Pagamento</TableHead>
                                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Data</TableHead>
                                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Parcelas</TableHead>
                                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Atendente</TableHead>
                                        <TableHead className="text-[#005AA8] dark:text-muted-foreground">Profissional</TableHead>
                                        <TableHead className="text-right">Ações</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sales.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                                                Nenhuma venda encontrada
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        paginatedSales.map((sale) => (
                                            <TableRow
                                                key={sale.id}
                                                className={sale.payment_type === 'pending' ? "bg-orange-50/50 hover:bg-orange-50 dark:bg-orange-950/20" : ""}
                                            >
                                                <TableCell>
                                                    <Badge
                                                        variant="outline"
                                                        className={sale.payment_type === 'pending' ? "border-orange-500 text-orange-600 bg-orange-50" : ""}
                                                    >
                                                        {SaleCategoryLabels[sale.category]}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    {(() => {
                                                        const productName = sale.product_service?.name || '-';

                                                        if (!sale.product_service?.price) {
                                                            return productName;
                                                        }

                                                        const adjustment = calculatePriceAdjustment(
                                                            sale.unit_price,
                                                            sale.product_service.price
                                                        );

                                                        if (!adjustment) {
                                                            return productName;
                                                        }

                                                        return (
                                                            <>
                                                                {productName}
                                                                <span className={`ml-1 text-xs font-semibold ${adjustment.startsWith('+')
                                                                        ? 'text-green-600'
                                                                        : 'text-red-600'
                                                                    }`}>
                                                                    ({adjustment})
                                                                </span>
                                                            </>
                                                        );
                                                    })()}
                                                </TableCell>
                                                <TableCell className="text-green-500 font-semibold">
                                                    {formatCurrency(sale.total_amount)}
                                                </TableCell>
                                                <TableCell>
                                                    {sale.payment_type === 'pending' ? (
                                                        <Badge variant="secondary" className="bg-orange-100 text-orange-700 hover:bg-orange-200">
                                                            Pendente
                                                        </Badge>
                                                    ) : sale.payment_type === 'mixed' ? (
                                                        <Popover>
                                                            <PopoverTrigger asChild>
                                                                <Badge variant="secondary" className="bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-950/30 dark:text-purple-300 cursor-pointer">
                                                                    Misto
                                                                </Badge>
                                                            </PopoverTrigger>
                                                            <PopoverContent className="w-72 p-3" side="bottom" align="start">
                                                                <div className="space-y-2">
                                                                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Detalhes do Pagamento</p>
                                                                    <div className="flex items-center justify-between p-2 rounded bg-green-500/10">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <Check className="w-3.5 h-3.5 text-green-600" />
                                                                            <span className="text-sm">À Vista</span>
                                                                        </div>
                                                                        <span className="text-sm font-semibold text-green-600">{formatCurrency(sale.cash_amount)}</span>
                                                                    </div>
                                                                    <div className="flex items-center justify-between p-2 rounded bg-blue-500/10">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <Clock className="w-3.5 h-3.5 text-blue-600" />
                                                                            <span className="text-sm">Parcelado ({sale.installments}x)</span>
                                                                        </div>
                                                                        <span className="text-sm font-semibold text-blue-600">{formatCurrency(sale.total_amount - sale.cash_amount)}</span>
                                                                    </div>
                                                                    {sale.installments_data && sale.installments_data.length > 0 && (
                                                                        <div className="pt-1 border-t space-y-1">
                                                                            {sale.installments_data
                                                                                .sort((a, b) => a.installment_number - b.installment_number)
                                                                                .map((inst) => (
                                                                                <div key={inst.id} className="flex items-center justify-between text-xs">
                                                                                    <span className="text-muted-foreground">
                                                                                        {inst.installment_number === 1 && sale.payment_type === 'mixed'
                                                                                            ? 'Entrada'
                                                                                            : `Parcela ${inst.installment_number}`}
                                                                                    </span>
                                                                                    <div className="flex items-center gap-1.5">
                                                                                        <span>{formatCurrency(inst.amount)}</span>
                                                                                        {inst.status === 'paid' ? (
                                                                                            <Check className="w-3 h-3 text-green-500" />
                                                                                        ) : inst.status === 'overdue' ? (
                                                                                            <AlertCircle className="w-3 h-3 text-red-500" />
                                                                                        ) : (
                                                                                            <Clock className="w-3 h-3 text-yellow-500" />
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </PopoverContent>
                                                        </Popover>
                                                    ) : (
                                                        PaymentTypeLabels[sale.payment_type]
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {new Date(sale.sale_date).toLocaleDateString('pt-BR')}
                                                </TableCell>
                                                <TableCell>
                                                    {sale.installments}x
                                                </TableCell>
                                                <TableCell>
                                                    {sale.team_member?.name || '-'}
                                                </TableCell>
                                                <TableCell>
                                                    {sale.professional?.name || '-'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {(canEdit('sales') || canDelete('sales')) && (
                                                        <div className="flex items-center justify-end gap-1">
                                                            {canEdit('sales') && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8"
                                                                    onClick={() => handleEditClick(sale)}
                                                                >
                                                                    <Pencil className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                            {canDelete('sales') && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-8 w-8 text-destructive"
                                                                    onClick={() => handleDeleteClick(sale)}
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Sale Modal - Create & Edit */}
            <SaleModal
                open={modalOpen}
                onOpenChange={(open) => {
                    setModalOpen(open);
                    if (!open) setEditingSale(null);
                }}
                sale={editingSale}
            />

            {/* Delete Confirmation */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja excluir a venda de "{deleteTarget?.name}"?
                            Todas as parcelas serão excluídas junto. Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
