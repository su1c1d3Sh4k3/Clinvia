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
} from "lucide-react";
import { useSales, useDeleteSale } from "@/hooks/useSales";
import { useUserRole } from "@/hooks/useUserRole";
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
    const { data: userRole } = useUserRole();
    const isSupervisor = userRole === 'supervisor';

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
                                                    {!isSupervisor && (
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8"
                                                                onClick={() => handleEditClick(sale)}
                                                            >
                                                                <Pencil className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 text-destructive"
                                                                onClick={() => handleDeleteClick(sale)}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
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

            {/* Sale Modal - Edição desativada temporariamente para refatoração multi-produto */}
            <SaleModal
                open={modalOpen}
                onOpenChange={setModalOpen}
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
