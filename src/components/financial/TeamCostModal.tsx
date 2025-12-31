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
import { Loader2 } from "lucide-react";
import {
    useTeamMembers,
    useProfessionals,
    useCreateTeamCost,
    useUpdateTeamCost,
} from "@/hooks/useFinancial";
import type { TeamCost, TeamCostFormData, PaymentMethod, FinancialStatus, CollaboratorType } from "@/types/financial";
import { PaymentMethodLabels, FinancialStatusLabels, CollaboratorTypeLabels } from "@/types/financial";

interface TeamCostModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    teamCost?: TeamCost | null;
}

export function TeamCostModal({ open, onOpenChange, teamCost }: TeamCostModalProps) {
    const { data: teamMembers = [] } = useTeamMembers();
    const { data: professionals = [] } = useProfessionals();
    const createMutation = useCreateTeamCost();
    const updateMutation = useUpdateTeamCost();

    const currentDate = new Date();
    const [formData, setFormData] = useState<TeamCostFormData>({
        collaborator_type: "agent",
        team_member_id: undefined,
        professional_id: undefined,
        base_salary: 0,
        commission: 0,
        bonus: 0,
        deductions: 0,
        payment_method: "bank_transfer",
        due_date: new Date().toISOString().split('T')[0],
        paid_date: undefined,
        status: "pending",
        notes: "",
        reference_month: currentDate.getMonth() + 1,
        reference_year: currentDate.getFullYear(),
    });

    useEffect(() => {
        if (teamCost) {
            setFormData({
                collaborator_type: teamCost.collaborator_type,
                team_member_id: teamCost.team_member_id || undefined,
                professional_id: teamCost.professional_id || undefined,
                base_salary: teamCost.base_salary,
                commission: teamCost.commission,
                bonus: teamCost.bonus,
                deductions: teamCost.deductions,
                payment_method: teamCost.payment_method,
                due_date: teamCost.due_date,
                paid_date: teamCost.paid_date || undefined,
                status: teamCost.status,
                notes: teamCost.notes || "",
                reference_month: teamCost.reference_month,
                reference_year: teamCost.reference_year,
            });
        } else {
            const currentDate = new Date();
            setFormData({
                collaborator_type: "agent",
                team_member_id: undefined,
                professional_id: undefined,
                base_salary: 0,
                commission: 0,
                bonus: 0,
                deductions: 0,
                payment_method: "bank_transfer",
                due_date: new Date().toISOString().split('T')[0],
                paid_date: undefined,
                status: "pending",
                notes: "",
                reference_month: currentDate.getMonth() + 1,
                reference_year: currentDate.getFullYear(),
            });
        }
    }, [teamCost, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const submitData = {
            ...formData,
            team_member_id: formData.collaborator_type !== 'professional' ? formData.team_member_id : undefined,
            professional_id: formData.collaborator_type === 'professional' ? formData.professional_id : undefined,
        };

        if (teamCost) {
            await updateMutation.mutateAsync({ id: teamCost.id, data: submitData });
        } else {
            await createMutation.mutateAsync(submitData);
        }
        onOpenChange(false);
    };

    const isLoading = createMutation.isPending || updateMutation.isPending;
    const totalCost = formData.base_salary + formData.commission + formData.bonus - formData.deductions;

    const months = [
        { value: 1, label: 'Janeiro' },
        { value: 2, label: 'Fevereiro' },
        { value: 3, label: 'Março' },
        { value: 4, label: 'Abril' },
        { value: 5, label: 'Maio' },
        { value: 6, label: 'Junho' },
        { value: 7, label: 'Julho' },
        { value: 8, label: 'Agosto' },
        { value: 9, label: 'Setembro' },
        { value: 10, label: 'Outubro' },
        { value: 11, label: 'Novembro' },
        { value: 12, label: 'Dezembro' },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {teamCost ? "Editar Custo com Equipe" : "Novo Custo com Equipe"}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Tipo de Colaborador */}
                    <div className="space-y-2">
                        <Label htmlFor="collaborator_type">Tipo de Colaborador *</Label>
                        <Select
                            value={formData.collaborator_type}
                            onValueChange={(value: CollaboratorType) => setFormData({ ...formData, collaborator_type: value, team_member_id: undefined, professional_id: undefined })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(CollaboratorTypeLabels).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Seleção do Colaborador */}
                    {formData.collaborator_type === 'professional' ? (
                        <div className="space-y-2">
                            <Label htmlFor="professional">Profissional *</Label>
                            <Select
                                value={formData.professional_id || ""}
                                onValueChange={(value) => setFormData({ ...formData, professional_id: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione um profissional" />
                                </SelectTrigger>
                                <SelectContent>
                                    {professionals.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <Label htmlFor="team_member">Membro da Equipe *</Label>
                            <Select
                                value={formData.team_member_id || ""}
                                onValueChange={(value) => setFormData({ ...formData, team_member_id: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione um membro" />
                                </SelectTrigger>
                                <SelectContent>
                                    {teamMembers.map((tm) => (
                                        <SelectItem key={tm.id} value={tm.id}>
                                            {tm.name} ({tm.role})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {/* Referência */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="reference_month">Mês Referência *</Label>
                            <Select
                                value={formData.reference_month.toString()}
                                onValueChange={(value) => setFormData({ ...formData, reference_month: parseInt(value) })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {months.map((m) => (
                                        <SelectItem key={m.value} value={m.value.toString()}>
                                            {m.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="reference_year">Ano Referência *</Label>
                            <Input
                                id="reference_year"
                                type="number"
                                min="2020"
                                max="2099"
                                value={formData.reference_year}
                                onChange={(e) => setFormData({ ...formData, reference_year: parseInt(e.target.value) || currentDate.getFullYear() })}
                                required
                            />
                        </div>
                    </div>

                    {/* Valores */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="base_salary">Salário Base</Label>
                            <CurrencyInput
                                id="base_salary"
                                value={formData.base_salary}
                                onChange={(value) => setFormData({ ...formData, base_salary: value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="commission">Comissão</Label>
                            <CurrencyInput
                                id="commission"
                                value={formData.commission}
                                onChange={(value) => setFormData({ ...formData, commission: value })}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="bonus">Bônus</Label>
                            <CurrencyInput
                                id="bonus"
                                value={formData.bonus}
                                onChange={(value) => setFormData({ ...formData, bonus: value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="deductions">Descontos</Label>
                            <CurrencyInput
                                id="deductions"
                                value={formData.deductions}
                                onChange={(value) => setFormData({ ...formData, deductions: value })}
                            />
                        </div>
                    </div>

                    {/* Total */}
                    <div className="p-3 bg-muted/50 rounded-lg text-center">
                        <p className="text-sm text-muted-foreground">Total a Pagar</p>
                        <p className="text-2xl font-bold text-amber-500">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCost)}
                        </p>
                    </div>

                    {/* Pagamento */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="payment_method">Pagamento</Label>
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
                            <Label htmlFor="status">Status</Label>
                            <Select
                                value={formData.status}
                                onValueChange={(value: FinancialStatus) => setFormData({ ...formData, status: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(FinancialStatusLabels).map(([key, label]) => (
                                        <SelectItem key={key} value={key}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Observações */}
                    <div className="space-y-2">
                        <Label htmlFor="notes">Observações</Label>
                        <Textarea
                            id="notes"
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Observações adicionais..."
                            rows={2}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {teamCost ? "Salvar" : "Criar"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
