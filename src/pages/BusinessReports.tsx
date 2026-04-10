import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useReportData, calcEvolution } from "@/hooks/useReportData";

import { useUserRole } from "@/hooks/useUserRole";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AttendanceReport } from "@/components/reports/AttendanceReport";
import { ContactsLeadsReport } from "@/components/reports/ContactsLeadsReport";
import { AppointmentsReport } from "@/components/reports/AppointmentsReport";
import { SalesReport } from "@/components/reports/SalesReport";
import { CrmReport } from "@/components/reports/CrmReport";

import {
    BarChart3, Download, Loader2, MessageSquare, UserPlus,
    Calendar, ShoppingCart, Briefcase, ArrowLeftRight
} from "lucide-react";
import { toast } from "sonner";

function getDefaultDates() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
        start: start.toISOString().split("T")[0],
        end: end.toISOString().split("T")[0],
    };
}

function getPreviousPeriod(start: string, end: string) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diff = endDate.getTime() - startDate.getTime();
    const prevEnd = new Date(startDate.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - diff);
    return {
        start: prevStart.toISOString().split("T")[0],
        end: prevEnd.toISOString().split("T")[0],
    };
}

export default function BusinessReports() {
    const defaults = getDefaultDates();
    const [startDate, setStartDate] = useState(defaults.start);
    const [endDate, setEndDate] = useState(defaults.end);
    const [compareEnabled, setCompareEnabled] = useState(false);
    const [compStart, setCompStart] = useState("");
    const [compEnd, setCompEnd] = useState("");
    const [exporting, setExporting] = useState(false);
    const reportRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();

    const { data: userRole } = useUserRole();
    // Admin-only guard
    useEffect(() => {
        if (userRole && userRole !== "admin") {
            navigate("/");
        }
    }, [userRole, navigate]);

    // Main period query
    const startISO = startDate ? `${startDate}T00:00:00` : null;
    const endISO = endDate ? `${endDate}T23:59:59` : null;
    const { data, isLoading, error } = useReportData(startISO, endISO);

    // Comparison period query
    const effectiveCompStart = compareEnabled ? (compStart || getPreviousPeriod(startDate, endDate).start) : null;
    const effectiveCompEnd = compareEnabled ? (compEnd || getPreviousPeriod(startDate, endDate).end) : null;
    const compStartISO = effectiveCompStart ? `${effectiveCompStart}T00:00:00` : null;
    const compEndISO = effectiveCompEnd ? `${effectiveCompEnd}T23:59:59` : null;
    const { data: compData } = useReportData(compStartISO, compEndISO);

    // Auto-fill comparison dates when enabling
    const handleCompareToggle = (enabled: boolean) => {
        setCompareEnabled(enabled);
        if (enabled && !compStart && !compEnd) {
            const prev = getPreviousPeriod(startDate, endDate);
            setCompStart(prev.start);
            setCompEnd(prev.end);
        }
    };

    const handleExportPDF = async () => {
        if (!reportRef.current) return;
        setExporting(true);
        try {
            reportRef.current.classList.add("pdf-export-light");
            const html2pdf = (await import("html2pdf.js")).default;
            const opt = {
                margin: [10, 10, 10, 10],
                filename: `relatorio_${startDate}_${endDate}.pdf`,
                html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
                jsPDF: { unit: "mm", format: "a4", orientation: "portrait" as const },
            };
            await html2pdf().set(opt).from(reportRef.current).save();
            toast.success("PDF exportado com sucesso");
        } catch (err) {
            toast.error("Erro ao exportar PDF");
            console.error(err);
        } finally {
            reportRef.current?.classList.remove("pdf-export-light");
            setExporting(false);
        }
    };

    return (
        <div className="flex flex-col h-full overflow-auto">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background border-b px-4 md:px-6 py-4 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-primary" />
                        <h1 className="text-lg font-semibold">Relatórios</h1>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportPDF}
                        disabled={!data || exporting}
                    >
                        {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        Exportar PDF
                    </Button>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-end gap-4">
                    <div className="space-y-1">
                        <Label className="text-xs">Data Início</Label>
                        <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-[150px] h-9"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-xs">Data Fim</Label>
                        <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-[150px] h-9"
                        />
                    </div>

                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-card">
                        <ArrowLeftRight className="w-4 h-4 text-muted-foreground" />
                        <Label className="text-xs cursor-pointer" htmlFor="compare-toggle">Comparar</Label>
                        <Switch
                            id="compare-toggle"
                            checked={compareEnabled}
                            onCheckedChange={handleCompareToggle}
                        />
                    </div>

                    {compareEnabled && (
                        <>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Comparar com - Início</Label>
                                <Input
                                    type="date"
                                    value={compStart}
                                    onChange={(e) => setCompStart(e.target.value)}
                                    className="w-[150px] h-9"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Comparar com - Fim</Label>
                                <Input
                                    type="date"
                                    value={compEnd}
                                    onChange={(e) => setCompEnd(e.target.value)}
                                    className="w-[150px] h-9"
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 px-4 md:px-6 py-6" ref={reportRef}>
                {isLoading && (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        <span className="ml-3 text-muted-foreground">Carregando relatórios...</span>
                    </div>
                )}

                {error && (
                    <div className="text-center py-20 text-red-500">
                        <p>Erro ao carregar dados: {(error as Error).message}</p>
                    </div>
                )}

                {data && (
                    <Tabs defaultValue="atendimento" className="space-y-6">
                        <TabsList className="flex flex-wrap h-auto gap-1">
                            <TabsTrigger value="atendimento" className="flex items-center gap-1.5 text-xs">
                                <MessageSquare className="w-3.5 h-3.5" />
                                Atendimento
                            </TabsTrigger>
                            <TabsTrigger value="contatos" className="flex items-center gap-1.5 text-xs">
                                <UserPlus className="w-3.5 h-3.5" />
                                Contatos & Leads
                            </TabsTrigger>
                            <TabsTrigger value="agendamentos" className="flex items-center gap-1.5 text-xs">
                                <Calendar className="w-3.5 h-3.5" />
                                Agendamentos
                            </TabsTrigger>
                            <TabsTrigger value="vendas" className="flex items-center gap-1.5 text-xs">
                                <ShoppingCart className="w-3.5 h-3.5" />
                                Vendas
                            </TabsTrigger>
                            <TabsTrigger value="crm" className="flex items-center gap-1.5 text-xs">
                                <Briefcase className="w-3.5 h-3.5" />
                                CRM
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="atendimento">
                            <AttendanceReport
                                data={data.tickets}
                                queues={data.queues}
                                comparison={compareEnabled ? compData?.tickets : undefined}
                                comparisonQueues={compareEnabled ? compData?.queues : undefined}
                            />
                        </TabsContent>

                        <TabsContent value="contatos">
                            <ContactsLeadsReport
                                data={data.contacts}
                                comparison={compareEnabled ? compData?.contacts : undefined}
                            />
                        </TabsContent>

                        <TabsContent value="agendamentos">
                            <AppointmentsReport
                                data={data.appointments}
                                comparison={compareEnabled ? compData?.appointments : undefined}
                            />
                        </TabsContent>

                        <TabsContent value="vendas">
                            <SalesReport
                                data={data.sales}
                                comparison={compareEnabled ? compData?.sales : undefined}
                            />
                        </TabsContent>

                        <TabsContent value="crm">
                            <CrmReport
                                data={data.crm}
                                sales={data.sales}
                                contacts={data.contacts}
                                comparison={compareEnabled ? compData?.crm : undefined}
                                comparisonSales={compareEnabled ? compData?.sales : undefined}
                            />
                        </TabsContent>

                    </Tabs>
                )}
            </div>
        </div>
    );
}
