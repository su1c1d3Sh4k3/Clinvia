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
import {
    useCreateMarketingCampaign,
    useUpdateMarketingCampaign,
} from "@/hooks/useFinancial";
import type { MarketingCampaign, MarketingCampaignFormData, MarketingOrigin, CampaignStatus } from "@/types/financial";
import { MarketingOriginLabels } from "@/types/financial";

interface MarketingCampaignModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    campaign?: MarketingCampaign | null;
}

// Valid enum values for the database
const VALID_STATUS_VALUES: CampaignStatus[] = ['active', 'paused', 'finished'];
const VALID_ORIGIN_VALUES: MarketingOrigin[] = ['google', 'meta', 'tiktok', 'linkedin', 'twitter', 'email', 'organic', 'referral', 'other'];

// Status labels for display (Portuguese)
const STATUS_OPTIONS: { value: CampaignStatus; label: string }[] = [
    { value: 'active', label: 'Ativa' },
    { value: 'paused', label: 'Pausada' },
    { value: 'finished', label: 'Finalizada' },
];

// Helper function to ensure valid status value
function ensureValidStatus(status: string | undefined): CampaignStatus {
    if (status && VALID_STATUS_VALUES.includes(status as CampaignStatus)) {
        return status as CampaignStatus;
    }
    return 'active'; // Default fallback
}

// Helper function to ensure valid origin value
function ensureValidOrigin(origin: string | undefined): MarketingOrigin {
    if (origin && VALID_ORIGIN_VALUES.includes(origin as MarketingOrigin)) {
        return origin as MarketingOrigin;
    }
    return 'google'; // Default fallback
}

export function MarketingCampaignModal({ open, onOpenChange, campaign }: MarketingCampaignModalProps) {
    const createMutation = useCreateMarketingCampaign();
    const updateMutation = useUpdateMarketingCampaign();

    const [formData, setFormData] = useState<MarketingCampaignFormData>({
        name: "",
        origin: "google",
        investment: 0,
        leads_count: 0,
        conversions_count: 0,
        start_date: new Date().toISOString().split('T')[0],
        end_date: undefined,
        status: "active",
        notes: "",
    });

    useEffect(() => {
        if (campaign) {
            setFormData({
                name: campaign.name,
                origin: ensureValidOrigin(campaign.origin),
                investment: campaign.investment,
                leads_count: campaign.leads_count,
                conversions_count: campaign.conversions_count,
                start_date: campaign.start_date,
                end_date: campaign.end_date || undefined,
                status: ensureValidStatus(campaign.status),
                notes: campaign.notes || "",
            });
        } else {
            setFormData({
                name: "",
                origin: "google",
                investment: 0,
                leads_count: 0,
                conversions_count: 0,
                start_date: new Date().toISOString().split('T')[0],
                end_date: undefined,
                status: "active",
                notes: "",
            });
        }
    }, [campaign, open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Sanitize data before submission - ensure enum values are valid
        const sanitizedData: MarketingCampaignFormData = {
            name: formData.name.trim(),
            origin: ensureValidOrigin(formData.origin),
            investment: Number(formData.investment) || 0,
            leads_count: Number(formData.leads_count) || 0,
            conversions_count: Number(formData.conversions_count) || 0,
            start_date: formData.start_date,
            end_date: formData.end_date || undefined,
            status: ensureValidStatus(formData.status),
            notes: formData.notes?.trim() || "",
        };

        // DEBUG: Log the sanitized data being sent
        console.log('[MarketingCampaignModal] Submitting sanitizedData:', JSON.stringify(sanitizedData, null, 2));
        console.log('[MarketingCampaignModal] Status value:', sanitizedData.status, 'Type:', typeof sanitizedData.status);

        try {
            if (campaign) {
                await updateMutation.mutateAsync({ id: campaign.id, data: sanitizedData });
            } else {
                await createMutation.mutateAsync(sanitizedData);
            }
            onOpenChange(false);
        } catch (error) {
            console.error('[MarketingCampaignModal] Error submitting:', error);
        }
    };

    const isLoading = createMutation.isPending || updateMutation.isPending;

    // Cálculos de métricas
    const costPerLead = formData.leads_count > 0 ? formData.investment / formData.leads_count : 0;
    const costPerConversion = formData.conversions_count > 0 ? formData.investment / formData.conversions_count : 0;
    const conversionRate = formData.leads_count > 0 ? (formData.conversions_count / formData.leads_count) * 100 : 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {campaign ? "Editar Campanha" : "Nova Campanha de Marketing"}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Nome e Origem */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nome da Campanha *</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Ex: Black Friday 2024"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="origin">Origem *</Label>
                            <Select
                                value={formData.origin}
                                onValueChange={(value: MarketingOrigin) => setFormData({ ...formData, origin: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(MarketingOriginLabels).map(([key, label]) => (
                                        <SelectItem key={key} value={key}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Investimento */}
                    <div className="space-y-2">
                        <Label htmlFor="investment">Investimento Total *</Label>
                        <Input
                            id="investment"
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.investment}
                            onChange={(e) => setFormData({ ...formData, investment: parseFloat(e.target.value) || 0 })}
                            required
                        />
                    </div>

                    {/* Métricas */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="leads_count">Leads Gerados</Label>
                            <Input
                                id="leads_count"
                                type="number"
                                min="0"
                                value={formData.leads_count}
                                onChange={(e) => setFormData({ ...formData, leads_count: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="conversions_count">Conversões</Label>
                            <Input
                                id="conversions_count"
                                type="number"
                                min="0"
                                value={formData.conversions_count}
                                onChange={(e) => setFormData({ ...formData, conversions_count: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                    </div>

                    {/* Indicadores Calculados */}
                    <div className="grid grid-cols-3 gap-2 p-3 bg-muted/50 rounded-lg">
                        <div className="text-center">
                            <p className="text-xs text-muted-foreground">Custo/Lead</p>
                            <p className="text-sm font-semibold text-blue-500">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(costPerLead)}
                            </p>
                        </div>
                        <div className="text-center">
                            <p className="text-xs text-muted-foreground">Custo/Conversão</p>
                            <p className="text-sm font-semibold text-green-500">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(costPerConversion)}
                            </p>
                        </div>
                        <div className="text-center">
                            <p className="text-xs text-muted-foreground">Taxa Conversão</p>
                            <p className="text-sm font-semibold text-purple-500">
                                {conversionRate.toFixed(1)}%
                            </p>
                        </div>
                    </div>

                    {/* Datas e Status */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="start_date">Data Início *</Label>
                            <Input
                                id="start_date"
                                type="date"
                                value={formData.start_date}
                                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="end_date">Data Fim</Label>
                            <Input
                                id="end_date"
                                type="date"
                                value={formData.end_date || ""}
                                onChange={(e) => setFormData({ ...formData, end_date: e.target.value || undefined })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="status">Status</Label>
                            <Select
                                value={formData.status}
                                onValueChange={(value: CampaignStatus) => {
                                    // Only accept valid enum values
                                    const validStatus = ensureValidStatus(value);
                                    console.log('[Status Select] Value changed to:', validStatus);
                                    setFormData({ ...formData, status: validStatus });
                                }}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {STATUS_OPTIONS.map(({ value, label }) => (
                                        <SelectItem key={value} value={value}>
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
                            placeholder="Detalhes da campanha, segmentação, etc..."
                            rows={2}
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {campaign ? "Salvar" : "Criar"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
