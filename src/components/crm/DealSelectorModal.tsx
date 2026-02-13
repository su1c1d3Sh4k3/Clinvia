import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { CRMDeal } from "@/types/crm";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface DealSelectorModalProps {
    deals: CRMDeal[];
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (deal: CRMDeal) => void;
}

export function DealSelectorModal({ deals, open, onOpenChange, onSelect }: DealSelectorModalProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Selecionar Negociação</DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-2 overflow-y-auto pr-2 mt-2">
                    {deals.map((deal) => (
                        <div
                            key={deal.id}
                            className="bg-muted/30 hover:bg-muted/60 border rounded-lg p-3 cursor-pointer transition-colors"
                            onClick={() => {
                                onSelect(deal);
                                onOpenChange(false);
                            }}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="font-semibold text-sm line-clamp-1">{deal.title}</h4>
                                <span className="font-bold text-sm text-green-600 dark:text-green-400 whitespace-nowrap ml-2">
                                    {formatCurrency(deal.value)}
                                </span>
                            </div>

                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <div className="flex gap-2">
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-5">
                                        {deal.priority === 'high' ? 'Alta' : deal.priority === 'medium' ? 'Média' : 'Baixa'}
                                    </Badge>
                                    <span>{new Date(deal.created_at).toLocaleDateString('pt-BR')}</span>
                                </div>
                                {deal.product_service?.name && (
                                    <span className="truncate max-w-[120px]" title={deal.product_service.name}>
                                        {deal.product_service.name}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
}
