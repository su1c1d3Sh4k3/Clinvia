import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { Loader2 } from "lucide-react";
import { useCreateSale, useUpdateSale } from "@/hooks/useSales";
import { useProductsServices, useTeamMembers, useProfessionals } from "@/hooks/useFinancial";
import type { Sale, SaleFormData, SaleCategory, PaymentType } from "@/types/sales";
import { SaleCategoryLabels, PaymentTypeLabels } from "@/types/sales";

interface SaleModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    sale?: Sale | null;
}

export function SaleModal({ open, onOpenChange, sale }: SaleModalProps) {
    const isEditing = !!sale;

    // Form state
    const [category, setCategory] = useState<SaleCategory>('product');
    const [productServiceId, setProductServiceId] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [unitPrice, setUnitPrice] = useState(0);
    const [totalAmount, setTotalAmount] = useState(0);
    const [paymentType, setPaymentType] = useState<PaymentType>('cash');
    const [installments, setInstallments] = useState(1);
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
    const updateSale = useUpdateSale();

    // Filtrar produtos/serviços por categoria
    const filteredItems = productsServices.filter(
        (item: any) => item.type === category
    );

    // Reset form when modal opens/closes or sale changes
    useEffect(() => {
        if (open) {
            if (sale) {
                setCategory(sale.category);
                setProductServiceId(sale.product_service_id);
                setQuantity(sale.quantity);
                setUnitPrice(sale.unit_price);
                setTotalAmount(sale.total_amount);
                setPaymentType(sale.payment_type);
                setInstallments(sale.installments);
                setInterestRate(sale.interest_rate);
                setSaleDate(sale.sale_date);
                setTeamMemberId(sale.team_member_id || '');
                setProfessionalId(sale.professional_id || '');
                setNotes(sale.notes || '');
            } else {
                setCategory('product');
                setProductServiceId('');
                setQuantity(1);
                setUnitPrice(0);
                setTotalAmount(0);
                setPaymentType('cash');
                setInstallments(1);
                setInterestRate(0);
                setSaleDate(new Date().toISOString().split('T')[0]);
                setTeamMemberId('');
                setProfessionalId('');
                setNotes('');
            }
        }
    }, [open, sale]);

    // Atualizar preço unitário quando seleciona item
    useEffect(() => {
        if (productServiceId) {
            const selectedItem = productsServices.find((item: any) => item.id === productServiceId);
            if (selectedItem) {
                setUnitPrice(selectedItem.price);
            }
        }
    }, [productServiceId, productsServices]);

    // Calcular valor total automaticamente
    useEffect(() => {
        const baseTotal = quantity * unitPrice;
        setTotalAmount(baseTotal);
    }, [quantity, unitPrice]);

    // Calcular valor da parcela com juros simples
    const calculateInstallmentValue = () => {
        if (paymentType === 'cash' || installments <= 1) {
            return totalAmount;
        }
        // Juros simples: cada parcela tem juros proporcional ao tempo
        // Total com juros = principal + (principal × taxa × tempo médio)
        const avgTime = (installments + 1) / 2; // Tempo médio das parcelas
        const totalWithInterest = totalAmount * (1 + (interestRate / 100) * avgTime);
        return totalWithInterest / installments;
    };

    const installmentValue = calculateInstallmentValue();
    const totalWithInterest = paymentType === 'installment' && installments > 1
        ? installmentValue * installments
        : totalAmount;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const formData: SaleFormData = {
            category,
            product_service_id: productServiceId,
            quantity,
            unit_price: unitPrice,
            total_amount: totalAmount,
            payment_type: paymentType,
            installments: paymentType === 'cash' ? 1 : installments,
            interest_rate: paymentType === 'cash' ? 0 : interestRate,
            sale_date: saleDate,
            team_member_id: teamMemberId || undefined,
            professional_id: professionalId || undefined,
            notes: notes || undefined,
        };

        if (isEditing && sale) {
            await updateSale.mutateAsync({ id: sale.id, data: formData });
        } else {
            await createSale.mutateAsync(formData);
        }

        onOpenChange(false);
    };

    const isPending = createSale.isPending || updateSale.isPending;

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {isEditing ? 'Editar Venda' : 'Nova Venda'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Categoria */}
                    <div className="space-y-2">
                        <Label>Categoria *</Label>
                        <Select
                            value={category}
                            onValueChange={(value: SaleCategory) => {
                                setCategory(value);
                                setProductServiceId('');
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione a categoria" />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(SaleCategoryLabels).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Item (Produto/Serviço) */}
                    <div className="space-y-2">
                        <Label>Item *</Label>
                        <Select
                            value={productServiceId}
                            onValueChange={setProductServiceId}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={`Selecione o ${category === 'product' ? 'produto' : 'serviço'}`} />
                            </SelectTrigger>
                            <SelectContent>
                                {filteredItems.map((item: any) => (
                                    <SelectItem key={item.id} value={item.id}>
                                        {item.name} - {formatCurrency(item.price)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Quantidade */}
                    <div className="space-y-2">
                        <Label>Quantidade *</Label>
                        <Input
                            type="number"
                            min={1}
                            value={quantity}
                            onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                        />
                    </div>

                    {/* Valor Total (calculado) */}
                    <div className="space-y-2">
                        <Label>Valor Total</Label>
                        <div className="p-3 bg-muted rounded-md">
                            <span className="text-lg font-bold text-green-500">
                                {formatCurrency(totalAmount)}
                            </span>
                            <span className="text-sm text-muted-foreground ml-2">
                                ({quantity}x {formatCurrency(unitPrice)})
                            </span>
                        </div>
                    </div>

                    {/* Forma de Pagamento */}
                    <div className="space-y-2">
                        <Label>Forma de Pagamento *</Label>
                        <Select
                            value={paymentType}
                            onValueChange={(value: PaymentType) => {
                                setPaymentType(value);
                                if (value === 'cash') {
                                    setInstallments(1);
                                    setInterestRate(0);
                                }
                            }}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(PaymentTypeLabels).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Campos de Parcelamento (visíveis apenas se parcelado) */}
                    {paymentType === 'installment' && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Número de Parcelas *</Label>
                                    <Select
                                        value={String(installments)}
                                        onValueChange={(value) => setInstallments(parseInt(value))}
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
                                    <Label>Taxa de Juros (% a.m.)</Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={100}
                                        step={0.1}
                                        value={interestRate}
                                        onChange={(e) => setInterestRate(parseFloat(e.target.value) || 0)}
                                    />
                                </div>
                            </div>

                            {/* Preview das Parcelas */}
                            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-md">
                                <p className="text-sm font-medium">
                                    {installments}x de {formatCurrency(installmentValue)}
                                </p>
                                {interestRate > 0 && (
                                    <p className="text-xs text-muted-foreground">
                                        Total com juros: {formatCurrency(totalWithInterest)}
                                    </p>
                                )}
                            </div>
                        </>
                    )}

                    {/* Data da Venda */}
                    <div className="space-y-2">
                        <Label>Data *</Label>
                        <Input
                            type="date"
                            value={saleDate}
                            onChange={(e) => setSaleDate(e.target.value)}
                        />
                    </div>

                    {/* Atendente (opcional) */}
                    <div className="space-y-2">
                        <Label>Atendente (opcional)</Label>
                        <Select
                            value={teamMemberId || "_none"}
                            onValueChange={(val) => setTeamMemberId(val === "_none" ? "" : val)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione o atendente" />
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

                    {/* Profissional (opcional) */}
                    <div className="space-y-2">
                        <Label>Profissional (opcional)</Label>
                        <Select
                            value={professionalId || "_none"}
                            onValueChange={(val) => setProfessionalId(val === "_none" ? "" : val)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione o profissional" />
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

                    {/* Observações */}
                    <div className="space-y-2">
                        <Label>Observações</Label>
                        <Textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Observações adicionais..."
                            rows={2}
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="submit"
                            disabled={isPending || !productServiceId}
                        >
                            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {isEditing ? 'Salvar' : 'Registrar Venda'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
