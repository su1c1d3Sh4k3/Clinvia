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
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus } from "lucide-react";
import {
    useExpenseCategories,
    useCreateExpense,
    useUpdateExpense,
    useCreateExpenseCategory,
} from "@/hooks/useFinancial";
import type { Expense, ExpenseFormData, PaymentMethod, FinancialStatus, RecurrencePeriod } from "@/types/financial";
import { PaymentMethodLabels, FinancialStatusLabels, RecurrencePeriodLabels } from "@/types/financial";

interface ExpenseModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    expense?: Expense | null;
}

export function ExpenseModal({ open, onOpenChange, expense }: ExpenseModalProps) {
    const { data: categories = [] } = useExpenseCategories();
    const createMutation = useCreateExpense();
    const updateMutation = useUpdateExpense();
    const createCategoryMutation = useCreateExpenseCategory();

    const [formData, setFormData] = useState<ExpenseFormData>({
        category_id: "",
        item: "",
        description: "",
        amount: 0,
        payment_method: "pix",
        due_date: new Date().toISOString().split('T')[0],
        paid_date: undefined,
        status: "pending",
        is_recurring: false,
        recurrence_period: undefined,
    });

    // Estado para nova categoria
    const [showNewCategory, setShowNewCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");

    useEffect(() => {
        if (expense) {
            setFormData({
                category_id: expense.category_id || "",
                item: expense.item,
                description: expense.description || "",
                amount: expense.amount,
                payment_method: expense.payment_method,
                due_date: expense.due_date,
                paid_date: expense.paid_date || undefined,
                status: expense.status,
                is_recurring: expense.is_recurring,
                recurrence_period: expense.recurrence_period || undefined,
            });
        } else {
            setFormData({
                category_id: "",
                item: "",
                description: "",
                amount: 0,
                payment_method: "pix",
                due_date: new Date().toISOString().split('T')[0],
                paid_date: undefined,
                status: "pending",
                is_recurring: false,
                recurrence_period: undefined,
            });
        }
        setShowNewCategory(false);
        setNewCategoryName("");
    }, [expense, open]);

    const handleCategoryChange = (value: string) => {
        if (value === "new") {
            setShowNewCategory(true);
            setFormData({ ...formData, category_id: "" });
        } else {
            setShowNewCategory(false);
            setFormData({ ...formData, category_id: value });
        }
    };

    const handleCreateCategory = async () => {
        if (!newCategoryName.trim()) return;

        const result = await createCategoryMutation.mutateAsync({
            name: newCategoryName.trim(),
        });

        if (result) {
            setFormData({ ...formData, category_id: result.id });
            setShowNewCategory(false);
            setNewCategoryName("");
        }
    };

    // Filtrar status disponíveis baseado no estado do formulário
    const getAvailableStatuses = (): FinancialStatus[] => {
        const today = new Date().toISOString().split('T')[0];
        const statuses: FinancialStatus[] = [];

        // Pendente: sempre disponível se paid_date vazio ou futuro
        if (!formData.paid_date || formData.paid_date > today) {
            statuses.push('pending');
        }

        // Pago: só se paid_date <= hoje
        if (formData.paid_date && formData.paid_date <= today) {
            statuses.push('paid');
        }

        // Cancelado: só em modo de edição de item pendente
        if (expense && expense.status === 'pending') {
            statuses.push('cancelled');
        }

        return statuses;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const submitData = {
            ...formData,
            category_id: formData.category_id || undefined,
            recurrence_period: formData.is_recurring ? formData.recurrence_period : undefined,
        };

        if (expense) {
            await updateMutation.mutateAsync({ id: expense.id, data: submitData });
        } else {
            await createMutation.mutateAsync(submitData);
        }
        onOpenChange(false);
    };

    const isLoading = createMutation.isPending || updateMutation.isPending;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {expense ? "Editar Despesa" : "Nova Despesa"}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Categoria */}
                    <div className="space-y-2">
                        <Label htmlFor="category">Categoria</Label>
                        {!showNewCategory ? (
                            <Select
                                value={formData.category_id}
                                onValueChange={handleCategoryChange}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione uma categoria" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="new" className="text-green-500 font-medium">
                                        <span className="flex items-center gap-2">
                                            <Plus className="w-4 h-4" />
                                            Nova Categoria
                                        </span>
                                    </SelectItem>
                                    {categories.map((cat) => (
                                        <SelectItem key={cat.id} value={cat.id}>
                                            {cat.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <div className="flex gap-2">
                                <Input
                                    value={newCategoryName}
                                    onChange={(e) => setNewCategoryName(e.target.value)}
                                    placeholder="Nome da nova categoria"
                                    className="flex-1"
                                />
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={handleCreateCategory}
                                    disabled={createCategoryMutation.isPending || !newCategoryName.trim()}
                                >
                                    {createCategoryMutation.isPending ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        "Criar"
                                    )}
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setShowNewCategory(false)}
                                >
                                    Cancelar
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Item */}
                    <div className="space-y-2">
                        <Label htmlFor="item">Item *</Label>
                        <Input
                            id="item"
                            value={formData.item}
                            onChange={(e) => setFormData({ ...formData, item: e.target.value })}
                            placeholder="Ex: Aluguel do escritório"
                            required
                        />
                    </div>

                    {/* Descrição */}
                    <div className="space-y-2">
                        <Label htmlFor="description">Descrição</Label>
                        <Textarea
                            id="description"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Detalhes adicionais..."
                            rows={2}
                        />
                    </div>

                    {/* Valor e Método de Pagamento */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="amount">Valor *</Label>
                            <CurrencyInput
                                id="amount"
                                value={formData.amount}
                                onChange={(value) => setFormData({ ...formData, amount: value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="payment_method">Forma de Pagamento</Label>
                            <Select
                                value={formData.payment_method}
                                onValueChange={(value: PaymentMethod) => setFormData({ ...formData, payment_method: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(PaymentMethodLabels).map(([key, label]) => (
                                        <SelectItem key={key} value={key}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Datas e Status */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="due_date">Vencimento *</Label>
                            <Input
                                id="due_date"
                                type="date"
                                value={formData.due_date}
                                onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="paid_date">Data Pagto</Label>
                            <Input
                                id="paid_date"
                                type="date"
                                value={formData.paid_date || ""}
                                onChange={(e) => setFormData({ ...formData, paid_date: e.target.value || undefined })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="status">Status</Label>
                            <Select
                                value={formData.status}
                                onValueChange={(value: FinancialStatus) => setFormData({ ...formData, status: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {getAvailableStatuses().map((status) => (
                                        <SelectItem key={status} value={status}>
                                            {FinancialStatusLabels[status]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Recorrência */}
                    <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="is_recurring">Despesa Recorrente</Label>
                            <Switch
                                id="is_recurring"
                                checked={formData.is_recurring}
                                onCheckedChange={(checked) => setFormData({ ...formData, is_recurring: checked })}
                            />
                        </div>
                        {formData.is_recurring && (
                            <div className="space-y-2">
                                <Label htmlFor="recurrence_period">Período</Label>
                                <Select
                                    value={formData.recurrence_period || "monthly"}
                                    onValueChange={(value: RecurrencePeriod) => setFormData({ ...formData, recurrence_period: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(RecurrencePeriodLabels).map(([key, label]) => (
                                            <SelectItem key={key} value={key}>
                                                {label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {expense ? "Salvar" : "Criar"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
