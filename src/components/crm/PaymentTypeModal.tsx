import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { CreditCard, DollarSign, Loader2 } from "lucide-react";

interface PaymentTypeModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dealTitle: string;
    totalValue: number;
    productsCount: number;
    onConfirm: (paymentType: 'cash' | 'installment', installments?: number, interestRate?: number) => void;
    onCancel: () => void; // Cria vendas como 'pending'
    isLoading?: boolean;
}

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
};

export function PaymentTypeModal({
    open,
    onOpenChange,
    dealTitle,
    totalValue,
    productsCount,
    onConfirm,
    onCancel,
    isLoading = false
}: PaymentTypeModalProps) {
    const [paymentType, setPaymentType] = useState<'cash' | 'installment'>('cash');
    const [installments, setInstallments] = useState(2);
    const [interestRate, setInterestRate] = useState(0);

    const handleConfirm = () => {
        if (paymentType === 'cash') {
            onConfirm('cash');
        } else {
            onConfirm('installment', installments, interestRate);
        }
    };

    const handleCancel = () => {
        onCancel();
        onOpenChange(false);
    };

    const handleClose = () => {
        // Fechar sem escolher = pending
        handleCancel();
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => {
            if (!isOpen) {
                handleClose();
            } else {
                onOpenChange(isOpen);
            }
        }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CreditCard className="w-5 h-5 text-primary" />
                        Forma de Pagamento
                    </DialogTitle>
                    <DialogDescription>
                        Defina a forma de pagamento para a venda da negociação "<span className="font-medium">{dealTitle}</span>"
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {/* Resumo */}
                    <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Produtos:</span>
                            <span className="font-medium">{productsCount} {productsCount === 1 ? 'item' : 'itens'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Valor Total:</span>
                            <span className="font-bold text-lg text-green-600">{formatCurrency(totalValue)}</span>
                        </div>
                    </div>

                    {/* Tipo de Pagamento */}
                    <div className="space-y-2">
                        <Label>Tipo de Pagamento</Label>
                        <Select
                            value={paymentType}
                            onValueChange={(v) => setPaymentType(v as 'cash' | 'installment')}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="cash">
                                    <div className="flex items-center gap-2">
                                        <DollarSign className="w-4 h-4" />
                                        À Vista
                                    </div>
                                </SelectItem>
                                <SelectItem value="installment">
                                    <div className="flex items-center gap-2">
                                        <CreditCard className="w-4 h-4" />
                                        Parcelado
                                    </div>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Parcelas (se parcelado) */}
                    {paymentType === 'installment' && (
                        <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="space-y-2">
                                <Label>Parcelas</Label>
                                <Select
                                    value={String(installments)}
                                    onValueChange={(v) => setInstallments(parseInt(v))}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Array.from({ length: 23 }, (_, i) => i + 2).map((n) => (
                                            <SelectItem key={n} value={String(n)}>
                                                {n}x
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Juros % (a.m.)</Label>
                                <Input
                                    type="number"
                                    min="0"
                                    max="10"
                                    step="0.1"
                                    value={interestRate}
                                    onChange={(e) => setInterestRate(parseFloat(e.target.value) || 0)}
                                />
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex gap-2 sm:justify-between">
                    <Button
                        variant="outline"
                        onClick={handleCancel}
                        disabled={isLoading}
                    >
                        Decidir Depois
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Criando vendas...
                            </>
                        ) : (
                            'Confirmar Pagamento'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
