import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    ArrowLeft,
    Download,
    TrendingUp,
    TrendingDown,
    DollarSign,
    Users,
    Target,
    Lightbulb,
    AlertTriangle,
    CheckCircle,
    Clock,
    Calendar,
    Heart,
    Megaphone,
    UserCheck,
} from "lucide-react";
import { FinancialReport } from "@/hooks/useFinancialReports";

interface FinancialReportViewerProps {
    report: FinancialReport;
    onBack: () => void;
}

// Circular Progress Component
function CircularProgress({
    value,
    label,
    color
}: {
    value: number;
    label: string;
    color: string;
}) {
    const radius = 45;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(100, Math.max(0, value));
    const offset = circumference - (progress / 100) * circumference;

    return (
        <div className="flex flex-col items-center">
            <div className="relative w-28 h-28">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    {/* Background circle */}
                    <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        className="text-muted/30"
                    />
                    {/* Progress circle */}
                    <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        fill="none"
                        stroke={color}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        className="transition-all duration-1000 ease-out"
                    />
                </svg>
                {/* Center text */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold">{progress}%</span>
                </div>
            </div>
            <span className="mt-2 text-sm font-medium text-center">{label}</span>
        </div>
    );
}

export function FinancialReportViewer({ report, onBack }: FinancialReportViewerProps) {
    const reportRef = useRef<HTMLDivElement>(null);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('pt-BR');
    };

    // Helper to safely convert any value to a displayable string
    const toDisplayString = (value: any): string => {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'number') return value.toString();
        if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
        if (Array.isArray(value)) {
            return value.map(v => toDisplayString(v)).join(', ');
        }
        if (typeof value === 'object') {
            // Convert object to readable text with bold keys
            return Object.entries(value)
                .map(([key, val]) => `${toDisplayString(val)}`)
                .join(' ');
        }
        return String(value);
    };

    // Helper to format text - removing JSON artifacts and formatting nicely
    const formatText = (value: any): React.ReactNode => {
        const text = toDisplayString(value);
        if (!text) return <span className="text-muted-foreground italic">Análise não disponível</span>;

        // Clean up any JSON-like artifacts
        let cleaned = text
            .replace(/^\s*\{\s*/, '')
            .replace(/\s*\}\s*$/, '')
            .replace(/"([^"]+)":\s*/g, '') // Remove "key":
            .replace(/,\s*$/g, '')
            .trim();

        return cleaned || <span className="text-muted-foreground italic">Análise não disponível</span>;
    };

    // Helper to safely convert arrays
    const toDisplayArray = (value: any): string[] => {
        if (!value) return [];
        if (Array.isArray(value)) {
            return value.map(v => toDisplayString(v));
        }
        if (typeof value === 'string') return [value];
        return [];
    };

    const handleDownloadPDF = async () => {
        if (!reportRef.current) return;

        try {
            // Force light mode for PDF by adding a class
            reportRef.current.classList.add('pdf-export-light');

            // Dynamic import of html2pdf
            const html2pdf = (await import('html2pdf.js')).default;

            const opt = {
                margin: [10, 10, 10, 10] as [number, number, number, number],
                filename: `${report.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
                image: { type: 'jpeg' as const, quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
                jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] as const }
            };

            await html2pdf().set(opt).from(reportRef.current).save();

            // Remove light mode class after export
            reportRef.current.classList.remove('pdf-export-light');
        } catch (error) {
            console.error('Error generating PDF:', error);
            reportRef.current?.classList.remove('pdf-export-light');
            window.print();
        }
    };

    const content = report.content;
    const rawData = report.raw_data;

    // Get scores with fallback
    const scores = content?.scores || {};
    const saudeFinanceira = typeof scores.saudeFinanceira === 'number' ? scores.saudeFinanceira : 75;
    const qualidadeMarketing = typeof scores.qualidadeMarketing === 'number' ? scores.qualidadeMarketing : 50;
    const desempenhoColaboradores = typeof scores.desempenhoColaboradores === 'number' ? scores.desempenhoColaboradores : 70;

    // Section component for consistent styling
    const Section = ({
        icon: Icon,
        title,
        children,
        variant = 'default'
    }: {
        icon: any;
        title: string;
        children: React.ReactNode;
        variant?: 'default' | 'success' | 'warning' | 'danger';
    }) => {
        const variantStyles = {
            default: 'from-blue-500/20 to-blue-600/20 text-blue-500',
            success: 'from-green-500/20 to-emerald-500/20 text-green-500',
            warning: 'from-yellow-500/20 to-orange-500/20 text-yellow-500',
            danger: 'from-red-500/20 to-rose-500/20 text-red-500',
        };

        return (
            <Card className="overflow-hidden">
                <CardHeader className={`bg-gradient-to-r ${variantStyles[variant]} py-3`}>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Icon className="w-5 h-5" />
                        {title}
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                    {children}
                </CardContent>
            </Card>
        );
    };

    // List items renderer
    const renderList = (items: string[], emptyMessage = "Nenhum item") => {
        if (!items || items.length === 0) {
            return <p className="text-muted-foreground italic">{emptyMessage}</p>;
        }
        return (
            <ul className="space-y-2">
                {items.map((item, index) => (
                    <li key={index} className="flex items-start gap-2">
                        <span className="text-primary mt-1">•</span>
                        <span>{item}</span>
                    </li>
                ))}
            </ul>
        );
    };

    return (
        <div className="flex flex-col h-full max-h-[90vh]">
            {/* Custom styles for hidden scrollbar and PDF light mode */}
            <style>{`
                .report-scroll::-webkit-scrollbar {
                    width: 0px;
                    background: transparent;
                }
                .report-scroll {
                    scrollbar-width: none;
                    -ms-overflow-style: none;
                }
                .pdf-export-light {
                    background-color: #ffffff !important;
                    color: #1a1a1a !important;
                }
                .pdf-export-light * {
                    background-color: transparent;
                    color: #1a1a1a !important;
                    border-color: #e5e5e5 !important;
                }
                .pdf-export-light .bg-gradient-to-br,
                .pdf-export-light .bg-gradient-to-r {
                    background: #f5f5f5 !important;
                }
                .pdf-export-light .text-green-500,
                .pdf-export-light .text-red-500,
                .pdf-export-light .text-blue-500,
                .pdf-export-light .text-purple-500 {
                    color: inherit !important;
                }
            `}</style>

            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-background/95 backdrop-blur sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h2 className="font-semibold text-lg">{report.name}</h2>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            <span>{formatDate(report.start_date)} - {formatDate(report.end_date)}</span>
                        </div>
                    </div>
                </div>
                <Button onClick={handleDownloadPDF} className="gap-2">
                    <Download className="w-4 h-4" />
                    Baixar PDF
                </Button>
            </div>

            {/* Report Content with hidden scrollbar */}
            <div className="flex-1 overflow-y-auto report-scroll">
                <div ref={reportRef} className="p-6 space-y-6 max-w-4xl mx-auto bg-background">
                    {/* PDF Header (visible in print/PDF) */}
                    <div className="hidden print:block text-center mb-8">
                        <h1 className="text-2xl font-bold">{report.name}</h1>
                        <p className="text-muted-foreground">
                            Período: {formatDate(report.start_date)} a {formatDate(report.end_date)}
                        </p>
                    </div>

                    {/* Health Indicators Section */}
                    <Card className="overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-indigo-500/20 to-purple-500/20 py-3">
                            <CardTitle className="flex items-center gap-2 text-base text-indigo-500">
                                <TrendingUp className="w-5 h-5" />
                                Indicadores de Saúde do Negócio
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="flex justify-around items-center flex-wrap gap-6">
                                <CircularProgress
                                    value={saudeFinanceira}
                                    label="Saúde Financeira"
                                    color={saudeFinanceira >= 70 ? '#22c55e' : saudeFinanceira >= 40 ? '#eab308' : '#ef4444'}
                                />
                                <CircularProgress
                                    value={qualidadeMarketing}
                                    label="Qualidade do Marketing"
                                    color={qualidadeMarketing >= 70 ? '#22c55e' : qualidadeMarketing >= 40 ? '#eab308' : '#ef4444'}
                                />
                                <CircularProgress
                                    value={desempenhoColaboradores}
                                    label="Desempenho dos Colaboradores"
                                    color={desempenhoColaboradores >= 70 ? '#22c55e' : desempenhoColaboradores >= 40 ? '#eab308' : '#ef4444'}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Summary Cards */}
                    {rawData && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Card className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/20">
                                <CardContent className="p-4 text-center">
                                    <p className="text-xs text-muted-foreground">Receitas</p>
                                    <p className="text-xl font-bold text-green-500">
                                        {formatCurrency(rawData.revenues?.total || 0)}
                                    </p>
                                </CardContent>
                            </Card>
                            <Card className="bg-gradient-to-br from-red-500/10 to-rose-500/10 border-red-500/20">
                                <CardContent className="p-4 text-center">
                                    <p className="text-xs text-muted-foreground">Despesas</p>
                                    <p className="text-xl font-bold text-red-500">
                                        {formatCurrency(rawData.expenses?.total || 0)}
                                    </p>
                                </CardContent>
                            </Card>
                            <Card className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border-blue-500/20">
                                <CardContent className="p-4 text-center">
                                    <p className="text-xs text-muted-foreground">Lucro Líquido</p>
                                    <p className={`text-xl font-bold ${(rawData.balance?.netProfit || 0) >= 0 ? 'text-blue-500' : 'text-red-500'}`}>
                                        {formatCurrency(rawData.balance?.netProfit || 0)}
                                    </p>
                                </CardContent>
                            </Card>
                            <Card className="bg-gradient-to-br from-purple-500/10 to-violet-500/10 border-purple-500/20">
                                <CardContent className="p-4 text-center">
                                    <p className="text-xs text-muted-foreground">Marketing</p>
                                    <p className="text-xl font-bold text-purple-500">
                                        {formatCurrency(rawData.marketing?.investment || 0)}
                                    </p>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    <Separator />

                    {/* Executive Summary */}
                    <Section icon={TrendingUp} title="Resumo Executivo" variant="success">
                        <p className="text-muted-foreground leading-relaxed">
                            {formatText(content?.resumoExecutivo)}
                        </p>
                    </Section>

                    {/* Two-column layout for Receitas and Despesas */}
                    <div className="grid md:grid-cols-2 gap-4">
                        <Section icon={DollarSign} title="Receitas" variant="success">
                            <p className="text-muted-foreground text-sm leading-relaxed">
                                {formatText(content?.receitas)}
                            </p>
                        </Section>

                        <Section icon={TrendingDown} title="Despesas" variant="danger">
                            <p className="text-muted-foreground text-sm leading-relaxed">
                                {formatText(content?.despesas)}
                            </p>
                        </Section>
                    </div>

                    {/* Balance Analysis */}
                    <Section icon={TrendingUp} title="Receitas x Despesas">
                        <p className="text-muted-foreground leading-relaxed">
                            {formatText(content?.receitasXDespesas)}
                        </p>
                    </Section>

                    {/* Marketing */}
                    <Section icon={Target} title="Marketing">
                        <p className="text-muted-foreground leading-relaxed">
                            {formatText(content?.marketing)}
                        </p>
                        {rawData?.marketing && (
                            <div className="mt-4 grid grid-cols-3 gap-2">
                                <div className="text-center p-2 bg-muted/50 rounded">
                                    <p className="text-xs text-muted-foreground">Custo/Lead</p>
                                    <p className="font-semibold text-sm">{formatCurrency(rawData.marketing.costPerLead || 0)}</p>
                                </div>
                                <div className="text-center p-2 bg-muted/50 rounded">
                                    <p className="text-xs text-muted-foreground">Custo/Conv.</p>
                                    <p className="font-semibold text-sm">{formatCurrency(rawData.marketing.costPerConversion || 0)}</p>
                                </div>
                                <div className="text-center p-2 bg-muted/50 rounded">
                                    <p className="text-xs text-muted-foreground">Taxa Conv.</p>
                                    <p className="font-semibold text-sm">{(rawData.marketing.conversionRate || 0).toFixed(1)}%</p>
                                </div>
                            </div>
                        )}
                    </Section>

                    {/* Two-column layout for people analysis */}
                    <div className="grid md:grid-cols-2 gap-4">
                        <Section icon={Users} title="Receitas por Atendente">
                            <p className="text-muted-foreground text-sm leading-relaxed">
                                {formatText(content?.receitasPorAtendente)}
                            </p>
                            {rawData?.revenueByAgent && rawData.revenueByAgent.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    {rawData.revenueByAgent.slice(0, 5).map((agent, i) => (
                                        <div key={i} className="flex justify-between text-sm">
                                            <span>{agent.name}</span>
                                            <Badge variant="outline">{formatCurrency(agent.total)}</Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Section>

                        <Section icon={Users} title="Receitas por Profissional">
                            <p className="text-muted-foreground text-sm leading-relaxed">
                                {formatText(content?.receitasPorProfissional)}
                            </p>
                            {rawData?.revenueByProfessional && rawData.revenueByProfessional.length > 0 && (
                                <div className="mt-3 space-y-2">
                                    {rawData.revenueByProfessional.slice(0, 5).map((prof, i) => (
                                        <div key={i} className="flex justify-between text-sm">
                                            <span>{prof.name}</span>
                                            <Badge variant="outline">{formatCurrency(prof.total)}</Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Section>
                    </div>

                    <Separator />

                    {/* Analysis sections in 3 columns */}
                    <div className="grid md:grid-cols-3 gap-4">
                        <Section icon={CheckCircle} title="Pontos Positivos" variant="success">
                            {renderList(toDisplayArray(content?.pontosPositivos))}
                        </Section>

                        <Section icon={AlertTriangle} title="Pontos Negativos" variant="danger">
                            {renderList(toDisplayArray(content?.pontosNegativos))}
                        </Section>

                        <Section icon={Lightbulb} title="Pontos de Melhoria" variant="warning">
                            {renderList(toDisplayArray(content?.pontosDeMelhoria))}
                        </Section>
                    </div>

                    {/* Insights */}
                    <Section icon={Clock} title="Insights Estratégicos">
                        <div className="grid md:grid-cols-3 gap-4">
                            <div>
                                <h5 className="font-medium text-sm mb-2 flex items-center gap-1">
                                    <Badge variant="outline" className="text-xs">Curto Prazo</Badge>
                                    <span className="text-muted-foreground text-xs">30 dias</span>
                                </h5>
                                {renderList(toDisplayArray(content?.insights?.curtoPrazo))}
                            </div>
                            <div>
                                <h5 className="font-medium text-sm mb-2 flex items-center gap-1">
                                    <Badge variant="outline" className="text-xs">Médio Prazo</Badge>
                                    <span className="text-muted-foreground text-xs">3-6 meses</span>
                                </h5>
                                {renderList(toDisplayArray(content?.insights?.medioPrazo))}
                            </div>
                            <div>
                                <h5 className="font-medium text-sm mb-2 flex items-center gap-1">
                                    <Badge variant="outline" className="text-xs">Longo Prazo</Badge>
                                    <span className="text-muted-foreground text-xs">6-12 meses</span>
                                </h5>
                                {renderList(toDisplayArray(content?.insights?.longoPrazo))}
                            </div>
                        </div>
                    </Section>

                    {/* Footer for PDF */}
                    <div className="hidden print:block text-center text-xs text-muted-foreground mt-8 pt-4 border-t">
                        <p>Relatório gerado automaticamente em {formatDate(report.created_at)}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
