import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AnalysisHistoryModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    analysisHistory: { data: string; resumo: string }[];
    contactName: string;
}

export const AnalysisHistoryModal = ({
    open,
    onOpenChange,
    analysisHistory,
    contactName,
}: AnalysisHistoryModalProps) => {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Histórico de Resumos - {contactName}</DialogTitle>
                </DialogHeader>

                <ScrollArea className="flex-1 pr-4">
                    <div className="space-y-4 py-4">
                        {analysisHistory && analysisHistory.length > 0 ? (
                            analysisHistory.map((item, index) => (
                                <div key={index} className="bg-muted/50 p-4 rounded-lg border border-border">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-muted-foreground">
                                            {item.data ? format(new Date(item.data), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR }) : "Data desconhecida"}
                                        </span>
                                        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                                            Resumo #{index + 1}
                                        </span>
                                    </div>
                                    <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                                        {item.resumo}
                                    </p>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                Nenhum resumo encontrado para este contato.
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
};
