import { useState, useEffect, useCallback } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ContactPicker } from "@/components/ui/contact-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, X, User } from "lucide-react";
import { useCreateSale } from "@/hooks/useSales";
import { useProductsServices, useTeamMembers, useProfessionals } from "@/hooks/useFinancial";
import type { SaleCategory, PaymentType } from "@/types/sales";
import { SaleCategoryLabels, PaymentTypeLabels } from "@/types/sales";
import { toast } from "sonner";

// Interface para item da lista de produtos
interface ProductItem {
    id: string;
    category: SaleCategory;
    productServiceId: string;
    quantity: number;
    unitPrice: number;
}

interface SaleModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    fixedContactId?: string; // New prop to lock client
}

export function SaleModal({ open, onOpenChange, fixedContactId }: SaleModalProps) {
    // Client selection
    const [contactId, setContactId] = useState('');

    // Multi-product list
    const [products, setProducts] = useState<ProductItem[]>([]);

    // Payment state
    const [paymentType, setPaymentType] = useState<PaymentType>('cash');
    const [installments, setInstallments] = useState(2);
    const [interestRate, setInterestRate] = useState(0);
    const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
    const [teamMemberId, setTeamMemberId] = useState('');
    const [professionalId, setProfessionalId] = useState('');
    const [notes, setNotes] = useState('');

    // Data queries
    const { data: productsServices = [] } = useProductsServices();
    const { data: teamMembers = [] } = useTeamMembers();
    const { data: professionals = [] } = useProfessionals();


    // Mutations
    const createSale = useCreateSale();

    // Reset form when modal opens
    useEffect(() => {
        if (open) {
            setContactId(fixedContactId || ''); // Use fixedContactId if provided
            setProducts([]);
            setPaymentType('cash');
            setInstallments(2);
            setInterestRate(0);
            setSaleDate(new Date().toISOString().split('T')[0]);
            setTeamMemberId('');
            setProfessionalId('');
            setNotes('');
        }
    }, [open, fixedContactId]);

    // Add a new empty product
    const addProduct = useCallback(() => {
        const newId = `temp-${Date.now()}`;
        setProducts(prev => [...prev, {
            id: newId,
            category: 'product',
            productServiceId: '',
            quantity: 1,
            unitPrice: 0,
        }]);
    }, []);

    // Remove product by id
    const removeProduct = useCallback((id: string) => {
        setProducts(prev => prev.filter(p => p.id !== id));
    }, []);

    // Update product field
    const updateProduct = useCallback((id: string, field: keyof ProductItem, value: any) => {
        setProducts(prev => prev.map(p => {
            if (p.id !== id) return p;
            const updated = { ...p, [field]: value };

            // Auto-update unitPrice when productServiceId changes
            if (field === 'productServiceId') {
                const selectedItem = productsServices.find((item: any) => item.id === value);
                if (selectedItem) {
                    updated.unitPrice = selectedItem.price;
                    updated.category = selectedItem.type;
                }
            }

            return updated;
        }));
    }, [productsServices]);

    // Calculate total
    const totalAmount = products.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);

    // Calculate installment value
    const calculateInstallmentValue = () => {
        if (paymentType === 'cash' || installments <= 1) {
            return totalAmount;
        }
        const avgTime = (installments + 1) / 2;
        const totalWithInterest = totalAmount * (1 + (interestRate / 100) * avgTime);
        return totalWithInterest / installments;
    };

    const installmentValue = calculateInstallmentValue();
    const totalWithInterest = paymentType === 'installment' && installments > 1
        ? installmentValue * installments
        : totalAmount;

    // Submit - create one sale per product
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (products.length === 0) {
            toast.error('Adicione pelo menos um produto');
            return;
        }

        const validProducts = products.filter(p => p.productServiceId);
        if (validProducts.length === 0) {
            toast.error('Selecione ao menos um produto/serviço');
            return;
        }

        try {
            // Create one sale for each product
            for (const product of validProducts) {
                await createSale.mutateAsync({
                    category: product.category,
                    product_service_id: product.productServiceId,
                    quantity: product.quantity,
                    unit_price: product.unitPrice,
                    total_amount: product.quantity * product.unitPrice,
                    payment_type: paymentType,
                    installments: paymentType === 'cash' ? 1 : installments,
                    interest_rate: paymentType === 'cash' ? 0 : interestRate,
                    sale_date: saleDate,
                    team_member_id: teamMemberId || undefined,
                    professional_id: professionalId || undefined,
                    notes: notes || undefined,
                    contact_id: contactId || undefined,
                });
            }

            toast.success(`${validProducts.length} ${validProducts.length === 1 ? 'venda criada' : 'vendas criadas'} com sucesso!`);
            onOpenChange(false);
        } catch (error) {
            console.error('Error creating sales:', error);
            toast.error('Erro ao criar vendas');
        }
    };

    const isPending = createSale.isPending;

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    };

    // Filter items by category for a specific product row
    const getFilteredItems = (category: SaleCategory) => {
        return productsServices.filter((item: any) => item.type === category);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Nova Venda</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    {/* Scrollable content */}
                    <div className="flex-1 overflow-y-auto pr-2 space-y-4 scrollbar-thin">
                        {/* Cliente */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <User className="w-4 h-4" />
                                Cliente
                            </Label>
                            <ContactPicker
                                value={contactId}
                                onChange={(val) => setContactId(val || "")}
                                placeholder="Selecione o cliente (opcional)"
                                disabled={!!fixedContactId}
                            />
                        </div>

                        {/* Products List */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label>Produtos/Serviços *</Label>
                                <span className="text-xs text-muted-foreground">{products.length} {products.length === 1 ? 'item' : 'itens'}</span>
                            </div>

                            {products.map((product, index) => (
                                <div key={product.id} className="flex gap-2 items-start p-3 border rounded-lg bg-muted/30">
                                    <div className="flex-1 grid grid-cols-3 gap-2">
                                        {/* Category */}
                                        <Select
                                            value={product.category}
                                            onValueChange={(val) => {
                                                updateProduct(product.id, 'category', val);
                                                updateProduct(product.id, 'productServiceId', '');
                                            }}
                                        >
                                            <SelectTrigger className="h-9">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {Object.entries(SaleCategoryLabels).map(([key, label]) => (
                                                    <SelectItem key={key} value={key}>{label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        {/* Item */}
                                        <Select
                                            value={product.productServiceId || "_empty"}
                                            onValueChange={(val) => updateProduct(product.id, 'productServiceId', val === "_empty" ? "" : val)}
                                        >
                                            <SelectTrigger className="h-9">
                                                <SelectValue placeholder="Selecione" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="_empty" disabled>Selecione</SelectItem>
                                                {getFilteredItems(product.category).map((item: any) => (
                                                    <SelectItem key={item.id} value={item.id}>
                                                        {item.name} - {formatCurrency(item.price)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        {/* Quantity */}
                                        <Input
                                            type="number"
                                            min={1}
                                            value={product.quantity}
                                            onChange={(e) => updateProduct(product.id, 'quantity', parseInt(e.target.value) || 1)}
                                            className="h-9 w-20"
                                            placeholder="Qtd"
                                        />
                                    </div>

                                    {/* Subtotal + Remove */}
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-green-600 min-w-[80px] text-right">
                                            {formatCurrency(product.quantity * product.unitPrice)}
                                        </span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                            onClick={() => removeProduct(product.id)}
                                        >
                                            <X className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}

                            {/* Add Product Button */}
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full border-dashed"
                                onClick={addProduct}
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Adicionar Produto
                            </Button>
                        </div>

                        {/* Total */}
                        {products.length > 0 && (
                            <div className="p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-lg">
                                <div className="flex justify-between items-center">
                                    <span className="font-medium">Valor Total</span>
                                    <span className="text-2xl font-bold text-green-600">
                                        {formatCurrency(totalAmount)}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Payment Type */}
                        <div className="space-y-2">
                            <Label>Forma de Pagamento *</Label>
                            <Select
                                value={paymentType}
                                onValueChange={(value: PaymentType) => {
                                    setPaymentType(value);
                                    if (value === 'cash') {
                                        setInstallments(2);
                                        setInterestRate(0);
                                    }
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cash">À Vista</SelectItem>
                                    <SelectItem value="installment">Parcelado</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Installment fields */}
                        {paymentType === 'installment' && (
                            <>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Parcelas</Label>
                                        <Select
                                            value={String(installments)}
                                            onValueChange={(val) => setInstallments(parseInt(val))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24].map((n) => (
                                                    <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Juros % (a.m.)</Label>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={10}
                                            step={0.1}
                                            value={interestRate}
                                            onChange={(e) => setInterestRate(parseFloat(e.target.value) || 0)}
                                        />
                                    </div>
                                </div>

                                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-md text-sm">
                                    <p className="font-medium">{installments}x de {formatCurrency(installmentValue)}</p>
                                    {interestRate > 0 && (
                                        <p className="text-xs text-muted-foreground">
                                            Total com juros: {formatCurrency(totalWithInterest)}
                                        </p>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Date */}
                        <div className="space-y-2">
                            <Label>Data *</Label>
                            <Input
                                type="date"
                                value={saleDate}
                                onChange={(e) => setSaleDate(e.target.value)}
                            />
                        </div>

                        {/* Team Member */}
                        <div className="space-y-2">
                            <Label>Atendente (opcional)</Label>
                            <Select
                                value={teamMemberId || "_none"}
                                onValueChange={(val) => setTeamMemberId(val === "_none" ? "" : val)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="_none">Nenhum</SelectItem>
                                    {teamMembers.map((member: any) => (
                                        <SelectItem key={member.id} value={member.id}>
                                            {member.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Professional */}
                        <div className="space-y-2">
                            <Label>Profissional (opcional)</Label>
                            <Select
                                value={professionalId || "_none"}
                                onValueChange={(val) => setProfessionalId(val === "_none" ? "" : val)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="_none">Nenhum</SelectItem>
                                    {professionals.map((prof: any) => (
                                        <SelectItem key={prof.id} value={prof.id}>
                                            {prof.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Notes */}
                        <div className="space-y-2">
                            <Label>Observações</Label>
                            <Textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Observações adicionais..."
                                rows={2}
                            />
                        </div>
                    </div>

                    {/* Footer */}
                    <DialogFooter className="pt-4 border-t mt-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={isPending || products.length === 0}
                        >
                            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Registrar {products.length > 1 ? `${products.length} Vendas` : 'Venda'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
