import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, XCircle } from "lucide-react";

// Motivos de perda pré-definidos
export const LOSS_REASONS = [
    { value: "price", label: "Preço muito alto" },
    { value: "competitor", label: "Escolheu concorrente" },
    { value: "timing", label: "Momento inadequado" },
    { value: "no_budget", label: "Sem orçamento" },
    { value: "no_need", label: "Não precisa mais" },
    { value: "no_response", label: "Sem resposta do cliente" },
    { value: "product_fit", label: "Produto não atendeu" },
    { value: "service_quality", label: "Qualidade do atendimento" },
    { value: "other", label: "Outro motivo" },
] as const;

export type LossReasonValue = typeof LOSS_REASONS[number]["value"];

interface LossReasonModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    dealTitle: string;
    onConfirm: (reason: string, otherDescription?: string) => void;
    onCancel: () => void;
}

export function LossReasonModal({
    open,
    onOpenChange,
    dealTitle,
    onConfirm,
    onCancel,
}: LossReasonModalProps) {
    const [selectedReason, setSelectedReason] = useState<string>("");
    const [otherDescription, setOtherDescription] = useState("");

    const handleConfirm = () => {
        if (!selectedReason) return;

        onConfirm(
            selectedReason,
            selectedReason === "other" ? otherDescription : undefined
        );

        // Reset state
        setSelectedReason("");
        setOtherDescription("");
    };

    const handleCancel = () => {
        onCancel();
        setSelectedReason("");
        setOtherDescription("");
        onOpenChange(false);
    };

    const handleOpenChange = (newOpen: boolean) => {
        if (!newOpen) {
            handleCancel();
        } else {
            onOpenChange(newOpen);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <XCircle className="h-5 w-5 text-red-500" />
                        Motivo da Perda
                    </DialogTitle>
                    <DialogDescription>
                        Por que a negociação <strong>"{dealTitle}"</strong> foi perdida?
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="loss-reason">Selecione o motivo</Label>
                        <Select
                            value={selectedReason}
                            onValueChange={setSelectedReason}
                        >
                            <SelectTrigger id="loss-reason">
                                <SelectValue placeholder="Escolha um motivo..." />
                            </SelectTrigger>
                            <SelectContent>
                                {LOSS_REASONS.map((reason) => (
                                    <SelectItem key={reason.value} value={reason.value}>
                                        {reason.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {selectedReason === "other" && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                            <Label htmlFor="other-description">Descreva o motivo</Label>
                            <Textarea
                                id="other-description"
                                placeholder="Descreva o motivo da perda..."
                                value={otherDescription}
                                onChange={(e) => setOtherDescription(e.target.value)}
                                className="min-h-[80px]"
                            />
                        </div>
                    )}

                    <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-muted-foreground">
                            Se cancelar, a negociação voltará ao estágio anterior.
                        </p>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={handleCancel}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!selectedReason || (selectedReason === "other" && !otherDescription.trim())}
                        className="bg-red-600 hover:bg-red-700"
                    >
                        Confirmar Perda
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
