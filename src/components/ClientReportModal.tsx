import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sparkles, RefreshCw, FileText, User, Phone, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown"; // Assuming react-markdown is installed or we use simple whitespace-pre-wrap

interface ClientReportModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contact: any;
}

export const ClientReportModal = ({
    open,
    onOpenChange,
    contact,
}: ClientReportModalProps) => {
    const { toast } = useToast();
    const [isGenerating, setIsGenerating] = useState(false);
    const [report, setReport] = useState<string | null>(contact?.report || null);

    const handleGenerateReport = async () => {
        setIsGenerating(true);
        try {
            const { data, error } = await supabase.functions.invoke('generate-client-report', {
                body: { contactId: contact.id },
            });

            if (error) throw error;

            setReport(data.report);
            toast({
                title: "Relatório Gerado!",
                description: "A análise do cliente foi concluída com sucesso.",
            });
        } catch (error: any) {
            console.error("Erro ao gerar relatório:", error);
            toast({
                title: "Erro ao gerar relatório",
                description: error.message || "Falha ao conectar com a IA.",
                variant: "destructive",
            });
        } finally {
            setIsGenerating(false);
        }
    };

    // Update local report if contact prop changes and has a report (initial load)
    // But careful not to overwrite generated report if prop hasn't updated yet
    // We'll rely on state 'report' initialized with contact.report

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-500" />
                        Relatório de Inteligência do Cliente
                    </DialogTitle>
                </DialogHeader>

                <div className="flex gap-6 h-full overflow-hidden pt-4">
                    {/* Sidebar - Client Info */}
                    <div className="w-1/3 border-r border-border pr-6 space-y-6">
                        <div className="flex flex-col items-center text-center">
                            <Avatar className="w-24 h-24 mb-4 border-4 border-muted">
                                <AvatarImage src={contact?.profile_pic_url || undefined} />
                                <AvatarFallback className="text-2xl">{contact?.push_name?.[0]?.toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <h3 className="text-xl font-bold">{contact?.push_name}</h3>
                            <p className="text-sm text-muted-foreground">Cliente desde {new Date(contact?.created_at).toLocaleDateString()}</p>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-3 text-sm">
                                <Phone className="w-4 h-4 text-muted-foreground" />
                                <span>{contact?.phone || contact?.number?.split('@')[0]}</span>
                            </div>
                            {contact?.email && (
                                <div className="flex items-center gap-3 text-sm">
                                    <Mail className="w-4 h-4 text-muted-foreground" />
                                    <span>{contact.email}</span>
                                </div>
                            )}

                            <div className="bg-muted/30 p-4 rounded-lg space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Total de Tickets</span>
                                    <span className="font-medium">{contact?.analysis?.length || 0}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Média de Satisfação</span>
                                    <span className="font-bold text-green-500">
                                        {contact?.quality && contact.quality.length > 0
                                            ? (contact.quality.reduce((a: any, b: any) => a + b, 0) / contact.quality.length).toFixed(1)
                                            : "N/A"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <Button
                            className="w-full"
                            onClick={handleGenerateReport}
                            disabled={isGenerating}
                        >
                            {isGenerating ? (
                                <>
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    Analisando...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-4 h-4 mr-2" />
                                    {report ? "Gerar Nova Análise" : "Gerar Relatório IA"}
                                </>
                            )}
                        </Button>
                    </div>

                    {/* Main Content - Report */}
                    <ScrollArea className="flex-1 pl-2">
                        {report ? (
                            <div className="prose dark:prose-invert max-w-none">
                                {/* Simple rendering if markdown component not available, or use a library */}
                                <div className="whitespace-pre-wrap leading-relaxed text-sm">
                                    {report}
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 opacity-50">
                                <FileText className="w-16 h-16" />
                                <p>Nenhum relatório gerado ainda.</p>
                                <p className="text-sm max-w-xs text-center">Clique no botão para que a IA analise todo o histórico deste cliente.</p>
                            </div>
                        )}
                    </ScrollArea>
                </div>
            </DialogContent>
        </Dialog>
    );
};
