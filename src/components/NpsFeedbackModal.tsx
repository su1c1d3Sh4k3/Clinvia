import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Star, Calendar, MessageSquare } from "lucide-react";

interface NpsEntry {
    id?: string;
    dataPesquisa: string;
    nota: number;
    feedback: string;
}

interface NpsFeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
    contactName: string;
    npsEntries: NpsEntry[];
}

const getNotaColor = (nota: number): string => {
    if (nota >= 4) return "bg-green-500/10 text-green-500 border-green-500/20";
    if (nota === 3) return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    return "bg-red-500/10 text-red-500 border-red-500/20";
};

const getNotaLabel = (nota: number): string => {
    const labels: Record<number, string> = {
        5: "Excelente",
        4: "Muito Bom",
        3: "Bom",
        2: "Regular",
        1: "Ruim"
    };
    return labels[nota] || "";
};

const renderStars = (nota: number) => {
    return (
        <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
                <Star
                    key={i}
                    className={`w-4 h-4 ${i <= nota
                        ? "text-yellow-400 fill-yellow-400"
                        : "text-gray-300"
                        }`}
                />
            ))}
        </div>
    );
};

const formatDate = (dateString: string): string => {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateString;
    }
};

export function NpsFeedbackModal({
    isOpen,
    onClose,
    contactName,
    npsEntries
}: NpsFeedbackModalProps) {
    // Sort entries by date (newest first)
    const sortedEntries = [...npsEntries].sort((a, b) => {
        return new Date(b.dataPesquisa).getTime() - new Date(a.dataPesquisa).getTime();
    });

    // Calculate average
    const average = npsEntries.length > 0
        ? (npsEntries.reduce((sum, e) => sum + e.nota, 0) / npsEntries.length).toFixed(1)
        : 0;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-lg max-h-[80vh]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                        Histórico de Avaliações - {contactName}
                    </DialogTitle>
                </DialogHeader>

                {/* Summary */}
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                    <div>
                        <p className="text-sm text-muted-foreground">Total de avaliações</p>
                        <p className="text-2xl font-bold">{npsEntries.length}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-muted-foreground">Média geral</p>
                        <div className="flex items-center gap-2">
                            <p className="text-2xl font-bold">{average}</p>
                            <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                        </div>
                    </div>
                </div>

                {/* Entries List */}
                <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-4">
                        {sortedEntries.map((entry, index) => (
                            <div
                                key={entry.id || index}
                                className="p-4 border rounded-lg space-y-3"
                            >
                                {/* Header with date and score */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Calendar className="w-4 h-4" />
                                        {formatDate(entry.dataPesquisa)}
                                    </div>
                                    <Badge className={getNotaColor(entry.nota)}>
                                        {getNotaLabel(entry.nota)}
                                    </Badge>
                                </div>

                                {/* Stars */}
                                <div className="flex items-center gap-2">
                                    {renderStars(entry.nota)}
                                    <span className="text-sm font-medium">{entry.nota}/5</span>
                                </div>

                                {/* Feedback */}
                                {entry.feedback && (
                                    <div className="flex items-start gap-2 p-2 bg-muted/50 rounded text-sm">
                                        <MessageSquare className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                                        <p className="text-muted-foreground">{entry.feedback}</p>
                                    </div>
                                )}
                            </div>
                        ))}

                        {sortedEntries.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                                <Star className="w-12 h-12 mx-auto mb-2 text-muted" />
                                <p>Nenhuma avaliação encontrada</p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
