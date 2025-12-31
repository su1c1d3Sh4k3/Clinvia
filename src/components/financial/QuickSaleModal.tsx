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
    useRevenueCategories,
    useProductsServices,
    useCreateRevenue,
    useCreateRevenueCategory,
} from "@/hooks/useFinancial";
import { useCurrentTeamMember } from "@/hooks/useStaff";
import type { RevenueFormData, PaymentMethod, FinancialStatus, RecurrencePeriod } from "@/types/financial";
import { PaymentMethodLabels, FinancialStatusLabels, RecurrencePeriodLabels } from "@/types/financial";

interface QuickSaleModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function QuickSaleModal({ open, onOpenChange }: QuickSaleModalProps) {
    const { data: categories = [] } = useRevenueCategories();
    const { data: currentTeamMember } = useCurrentTeamMember();
    const createMutation = useCreateRevenue();
    const createCategoryMutation = useCreateRevenueCategory();

    // Product/Service management
    const [selectedProductServiceId, setSelectedProductServiceId] = useState<string>("");

    const [formData, setFormData] = useState<RevenueFormData>({
        category_id: "",
        item: "",
        description: "",
        amount: 0,
        payment_method: "pix",
        due_date: new Date().toISOString().split('T')[0],
        paid_date: "",
        status: "pending",
        team_member_id: "", // Will be set automatically
        professional_id: "", // Always empty/null
        contact_id: "",
        is_recurring: false,
        recurrence_period: "monthly",
    });

    // Estado para nova categoria
    const [showNewCategory, setShowNewCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");

    // Detect category type and fetch products/services accordingly
    const selectedCategory = categories.find(c => c.id === formData.category_id);
    const categoryName = selectedCategory?.name?.toLowerCase() || '';
    const isProductCategory = categoryName === 'produto' || categoryName === 'produtos';
    const isServiceCategory = categoryName === 'serviço' || categoryName === 'serviços' || categoryName === 'servico' || categoryName === 'servicos';
    const categoryType = isProductCategory ? 'product' : isServiceCategory ? 'service' : undefined;

    const { data: productsServices = [] } = useProductsServices(categoryType);

    // Reset form when modal opens
    useEffect(() => {
        if (open) {
            setFormData({
                category_id: "",
                item: "",
                description: "",
                amount: 0,
                payment_method: "pix",
                due_date: new Date().toISOString().split('T')[0],
                paid_date: "",
                status: "pending",
                team_member_id: currentTeamMember?.id || "", // Auto-fill with logged user
                professional_id: "", // Always empty
                contact_id: "",
                is_recurring: false,
                recurrence_period: "monthly",
            });
            setShowNewCategory(false);
            setNewCategoryName("");
            setSelectedProductServiceId("");
        }
    }, [open, currentTeamMember]);

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

    // Dynamic status based on dates (same logic as RevenueModal)
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

        // Se nenhum status disponível, adiciona pendente como fallback
        if (statuses.length === 0) {
            statuses.push('pending');
        }

        return statuses;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const submitData = {
            ...formData,
            category_id: formData.category_id || null,
            product_service_id: selectedProductServiceId || null,
            paid_date: formData.paid_date || null,
            team_member_id: currentTeamMember?.id || null, // Force logged user
            professional_id: null, // Always null
            contact_id: formData.contact_id || null,
            recurrence_period: formData.is_recurring ? formData.recurrence_period : null,
        };

        await createMutation.mutateAsync(submitData);
        onOpenChange(false);
    };

    const isLoading = createMutation.isPending;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Realizar Venda</DialogTitle>
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
                        {categoryType ? (
                            <Select
                                value={selectedProductServiceId}
                                onValueChange={(value) => {
                                    setSelectedProductServiceId(value);
                                    const selected = productsServices.find(ps => ps.id === value);
                                    if (selected) {
                                        setFormData({
                                            ...formData,
                                            item: selected.name,
                                            amount: selected.price || formData.amount
                                        });
                                    }
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={`Selecione um ${categoryType === 'product' ? 'produto' : 'serviço'}`} />
                                </SelectTrigger>
                                <SelectContent>
                                    {productsServices.map((ps) => (
                                        <SelectItem key={ps.id} value={ps.id}>
                                            {ps.name} - R$ {ps.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <Input
                                id="item"
                                value={formData.item}
                                onChange={(e) => setFormData({ ...formData, item: e.target.value })}
                                placeholder="Ex: Consultoria Premium"
                                required
                            />
                        )}
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
                            <Label htmlFor="is_recurring">Receita Recorrente</Label>
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

                    {/* Info about logged user */}
                    {currentTeamMember && (
                        <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                            Atendente: <span className="font-medium">{currentTeamMember.name}</span>
                        </div>
                    )}

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isLoading || !formData.item || formData.amount <= 0}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirmar Venda
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
