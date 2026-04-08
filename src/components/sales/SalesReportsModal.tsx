import { useState, useRef } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, Trash2, Eye, Plus, Calendar, Sparkles, ArrowLeft, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
    useSalesReports,
    useGenerateSalesReport,
    useDeleteSalesReport,
} from "@/hooks/useSalesReports";
import type { SalesReport } from "@/types/sales";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SalesReportsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SalesReportsModal({ open, onOpenChange }: SalesReportsModalProps) {
    const [activeTab, setActiveTab] = useState("saved");
    const [selectedReport, setSelectedReport] = useState<SalesReport | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
    const reportRef = useRef<HTMLDivElement>(null);

    // Form state for new report
    const [reportName, setReportName] = useState("");
    const [startDate, setStartDate] = useState(
        new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    );
    const [endDate, setEndDate] = useState(
        new Date().toISOString().split('T')[0]
    );

    // Hooks
    const { data: reports = [], isLoading: loadingReports } = useSalesReports();
    const generateReport = useGenerateSalesReport();
    const deleteReport = useDeleteSalesReport();

    const handleGenerate = async () => {
        if (!reportName.trim()) {
            return;
        }

        await generateReport.mutateAsync({
            startDate,
            endDate,
            reportName: reportName.trim(),
        });

        // Reset form and switch to saved tab
        setReportName("");
        setActiveTab("saved");
    };

    const handleDelete = async () => {
        if (deleteTarget) {
            await deleteReport.mutateAsync(deleteTarget);
            setDeleteTarget(null);
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('pt-BR');
    };

    const handleDownloadPDF = async () => {
        if (!reportRef.current || !selectedReport) return;

        try {
            reportRef.current.classList.add('pdf-export-light');

            const html2pdf = (await import('html2pdf.js')).default;

            const opt = {
                margin: [10, 10, 10, 10] as [number, number, number, number],
                filename: `${selectedReport.name.replace(/[^a-zA-Z0-9À-ú ]/g, '_')}.pdf`,
                image: { type: 'jpeg' as const, quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
                jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] as const }
            };

            await html2pdf().set(opt).from(reportRef.current).save();
            reportRef.current.classList.remove('pdf-export-light');
        } catch (error) {
            console.error('Erro ao gerar PDF:', error);
            reportRef.current?.classList.remove('pdf-export-light');
            window.print();
        }
    };

    // If viewing a report, show the viewer
    if (selectedReport) {
        return (
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
                    <DialogHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setSelectedReport(null)}
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                </Button>
                                <DialogTitle>{selectedReport.name}</DialogTitle>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={handleDownloadPDF}
                            >
                                <Download className="w-4 h-4" />
                                Baixar PDF
                            </Button>
                        </div>
                    </DialogHeader>
                    <ScrollArea className="h-[70vh] pr-4">
                        <div
                            ref={reportRef}
                            className="prose prose-sm dark:prose-invert max-w-none
                                prose-headings:text-foreground prose-headings:font-bold
                                prose-h1:text-xl prose-h1:border-b prose-h1:pb-2 prose-h1:mb-4
                                prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-3
                                prose-h3:text-base prose-h3:mt-4 prose-h3:mb-2
                                prose-p:text-muted-foreground prose-p:leading-relaxed
                                prose-strong:text-foreground
                                prose-ul:text-muted-foreground prose-ol:text-muted-foreground
                                prose-li:marker:text-primary
                                prose-table:text-sm
                                prose-th:bg-muted/50 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold
                                prose-td:px-3 prose-td:py-2 prose-td:border-b prose-td:border-border"
                        >
                            <ReactMarkdown>{selectedReport.content}</ReactMarkdown>
                        </div>
                    </ScrollArea>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-3xl max-h-[90vh]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-primary" />
                            Relatórios de Vendas
                        </DialogTitle>
                    </DialogHeader>

                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="saved">
                                Relatórios Salvos
                            </TabsTrigger>
                            <TabsTrigger value="generate">
                                <Plus className="w-4 h-4 mr-1" />
                                Gerar Novo
                            </TabsTrigger>
                        </TabsList>

                        {/* Saved Reports Tab */}
                        <TabsContent value="saved" className="mt-4">
                            <ScrollArea className="h-[400px] pr-4">
                                {loadingReports ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : reports.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                                        <p>Nenhum relatório gerado ainda</p>
                                        <Button
                                            variant="link"
                                            onClick={() => setActiveTab("generate")}
                                        >
                                            Gerar primeiro relatório
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {reports.map((report) => (
                                            <Card key={report.id} className="hover:bg-accent/50 transition-colors">
                                                <CardContent className="p-4">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex-1">
                                                            <h4 className="font-semibold">{report.name}</h4>
                                                            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                                                                <Calendar className="w-3 h-3" />
                                                                <span>
                                                                    {formatDate(report.start_date)} - {formatDate(report.end_date)}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-muted-foreground mt-1">
                                                                Gerado em {formatDate(report.created_at)}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Badge variant="outline" className="text-green-500 border-green-500/30">
                                                                {report.status}
                                                            </Badge>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => setSelectedReport(report)}
                                                            >
                                                                <Eye className="w-4 h-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="text-destructive"
                                                                onClick={() => setDeleteTarget(report.id)}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </ScrollArea>
                        </TabsContent>

                        {/* Generate New Report Tab */}
                        <TabsContent value="generate" className="mt-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-lg">
                                        <Sparkles className="w-5 h-5 text-yellow-500" />
                                        Gerar Relatório com IA
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="reportName">Nome do Relatório *</Label>
                                        <Input
                                            id="reportName"
                                            placeholder="Ex: Relatório de Vendas Janeiro 2026"
                                            value={reportName}
                                            onChange={(e) => setReportName(e.target.value)}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="startDate">Data Início *</Label>
                                            <Input
                                                id="startDate"
                                                type="date"
                                                value={startDate}
                                                onChange={(e) => setStartDate(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="endDate">Data Fim *</Label>
                                            <Input
                                                id="endDate"
                                                type="date"
                                                value={endDate}
                                                onChange={(e) => setEndDate(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div className="bg-muted/50 rounded-lg p-4 text-sm">
                                        <p className="font-medium mb-2">O relatório incluirá:</p>
                                        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                                            <li>Análise de vendas por categoria (produtos vs serviços)</li>
                                            <li>Ranking de produtos/serviços mais vendidos</li>
                                            <li>Performance por atendente e profissional</li>
                                            <li>Análise de parcelamento e recebimentos futuros</li>
                                            <li>Tendências e projeções de vendas</li>
                                            <li>Insights e recomendações</li>
                                        </ul>
                                    </div>

                                    <Button
                                        className="w-full"
                                        onClick={handleGenerate}
                                        disabled={!reportName.trim() || generateReport.isPending}
                                    >
                                        {generateReport.isPending ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Gerando relatório...
                                            </>
                                        ) : (
                                            <>
                                                <Sparkles className="w-4 h-4 mr-2" />
                                                Gerar Relatório
                                            </>
                                        )}
                                    </Button>

                                    {generateReport.isPending && (
                                        <p className="text-xs text-center text-muted-foreground">
                                            Isso pode levar alguns segundos...
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja excluir este relatório? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteReport.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
