import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  REPORT_TYPE_CONFIG,
  formatMetricValue,
  getFrequencyLabel,
  getComparisonPct,
} from "@/types/reports";
import type { StrategicReport } from "@/types/reports";
import { ReportComparisonBadge } from "./ReportComparisonBadge";
import { ReportExportButtons } from "./ReportExportButtons";
import { FunnelChart } from "./charts/FunnelChart";
import { TimelineChart } from "./charts/TimelineChart";
import { ServiceStatusChart } from "./charts/ServiceStatusChart";
import { PerformanceTable } from "./charts/PerformanceTable";
import { SatisfactionGauge } from "./charts/SatisfactionGauge";
import { RankingList } from "./charts/RankingList";
import {
  GitBranch, Filter, Bot, RefreshCw, UserPlus, TrendingUp,
  Repeat, DollarSign, Headphones, Heart, Users, Stethoscope,
  Calendar, Layers, ShoppingBag, Star, AlertTriangle, Clock,
  UserX, Target, Receipt, LogOut,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const ICON_MAP: Record<string, any> = {
  GitBranch, Filter, Bot, RefreshCw, UserPlus, TrendingUp,
  Repeat, DollarSign, Headphones, Heart, Users, Stethoscope,
  Calendar, Layers, ShoppingBag, Star, AlertTriangle, Clock,
  UserX, Target, Receipt, LogOut,
};

const PIE_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4",
];

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
};

interface ReportDetailModalProps {
  report: StrategicReport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReportDetailModal({
  report,
  open,
  onOpenChange,
}: ReportDetailModalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  if (!report) return null;

  const config = REPORT_TYPE_CONFIG[report.report_type];
  if (!config) return null;

  const Icon = ICON_MAP[config.icon] || GitBranch;
  const metrics = report.data?.metrics || {};
  const breakdown = report.data?.breakdown || [];
  const prevMetrics = report.previous_data?.metrics || {};

  const periodLabel = (() => {
    try {
      const start = new Date(report.period_start + "T00:00:00");
      const end = new Date(report.period_end + "T00:00:00");
      if (report.frequency === "daily") {
        return format(start, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
      }
      if (report.frequency === "weekly") {
        return `${format(start, "dd/MM", { locale: ptBR })} a ${format(end, "dd/MM/yyyy", { locale: ptBR })}`;
      }
      return format(start, "MMMM 'de' yyyy", { locale: ptBR });
    } catch {
      return "";
    }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Icon className="w-5 h-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl">
                  {config.label}
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-0.5">
                  #{String(report.report_number).padStart(4, "0")} ·{" "}
                  {getFrequencyLabel(report.frequency)} · {periodLabel}
                </p>
              </div>
            </div>
            <ReportExportButtons report={report} contentRef={contentRef} />
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {config.description}
          </p>
        </DialogHeader>

        <div ref={contentRef} className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* Metrics Cards */}
          <MetricsSummary
            metrics={metrics}
            prevMetrics={prevMetrics}
            config={config}
          />

          <Separator />

          {/* Charts by type */}
          <ReportCharts
            reportType={report.report_type}
            metrics={metrics}
            breakdown={breakdown}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ==================== METRICS SUMMARY ====================

function MetricsSummary({
  metrics,
  prevMetrics,
  config,
}: {
  metrics: Record<string, any>;
  prevMetrics: Record<string, any>;
  config: (typeof REPORT_TYPE_CONFIG)[keyof typeof REPORT_TYPE_CONFIG];
}) {
  // Get all numeric/string metrics to display as cards
  const metricKeys = Object.entries(metrics)
    .filter(([_, v]) => typeof v === "number" || typeof v === "string")
    .slice(0, 8);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {metricKeys.map(([key, value]) => {
        const prevValue = prevMetrics[key];
        const comparison =
          typeof value === "number" && typeof prevValue === "number"
            ? getComparisonPct(value, prevValue)
            : null;

        const isPrimary = key === config.primaryMetric;

        return (
          <div
            key={key}
            className={`rounded-lg border p-3 ${isPrimary ? "bg-primary/5 border-primary/20" : "bg-card"}`}
          >
            <p className="text-xs text-muted-foreground font-medium mb-1 truncate">
              {formatMetricKey(key)}
            </p>
            <p className="text-lg font-bold tabular-nums">
              {formatMetricValue(value, key)}
            </p>
            {comparison && (
              <ReportComparisonBadge
                pct={comparison.pct}
                direction={comparison.direction}
                className="mt-1"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatMetricKey(key: string): string {
  const MAP: Record<string, string> = {
    total: "Total",
    total_new: "Total Novos",
    total_leads: "Total Leads",
    total_deals: "Total Negociações",
    total_agents: "Total Atendentes",
    total_professionals: "Total Profissionais",
    total_stagnated: "Total Estagnadas",
    total_queues: "Total Filas",
    total_clients: "Total Clientes",
    total_analyses: "Total Análises",
    total_evaluations: "Total Avaliações",
    total_revenue: "Receita Total",
    total_expenses: "Total Despesas",
    total_products_sold: "Itens Vendidos",
    total_appointments: "Total Agendamentos",
    total_resolved: "Total Resolvidos",
    total_procedures: "Total Procedimentos",
    total_recurrence: "Total Recorrência",
    total_conversions: "Total Conversões",
    total_investment: "Investimento Total",
    total_active: "Total Ativos",
    total_inactive: "Total Inativos",
    total_responses: "Total Respostas",
    conversion_rate: "Taxa de Conversão",
    cancel_rate: "Taxa de Cancelamento",
    loss_rate: "Taxa de Perda",
    resolution_rate: "Taxa de Resolução",
    churn_rate: "Taxa de Churn",
    retention_rate: "Taxa de Retenção",
    rate_pct: "Taxa (%)",
    growth_pct: "Crescimento",
    margin_pct: "Margem",
    roi_pct: "ROI",
    avg_sentiment: "Sentimento Médio",
    avg_score: "Nota Média",
    avg_rating: "Avaliação Média",
    avg_value: "Valor Médio",
    avg_per_professional: "Média/Profissional",
    avg_per_queue: "Média/Fila",
    avg_days_stagnated: "Dias Médio Estagnado",
    avg_days_to_convert: "Dias p/ Converter",
    avg_days_to_return: "Dias p/ Retorno",
    avg_response_time_min: "TMA (min)",
    avg_resolution_time_min: "Tempo Resolução (min)",
    avg_speed: "Velocidade Média",
    overall_avg_seconds: "TMA Geral (seg)",
    fastest_agent: "Mais Rápido",
    slowest_agent: "Mais Lento",
    net_profit: "Lucro Líquido",
    team_costs: "Custos Equipe",
    median_value: "Valor Mediano",
    cost_per_lead: "Custo/Lead",
    top_product: "Top Produto",
    top_service: "Top Serviço",
    nps_score: "NPS",
    completion_rate: "Taxa Conclusão",
    open: "Abertas",
    pending: "Pendentes",
    resolved: "Resolvidas",
    won: "Ganhas",
    lost: "Perdidas",
    attended: "Presentes",
    no_show: "Ausentes",
    conversations_with_ai: "Conversas com IA",
  };
  return MAP[key] || key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

// ==================== CHARTS BY TYPE ====================

function ReportCharts({
  reportType,
  metrics,
  breakdown,
}: {
  reportType: string;
  metrics: Record<string, any>;
  breakdown: any[];
}) {
  switch (reportType) {
    case "delivery_funnel":
    case "qualification_funnel":
    case "recurrence":
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold mb-3">Distribuição por Etapa</h3>
            <FunnelChart
              data={
                Array.isArray(breakdown)
                  ? breakdown.map((b: any) => ({
                      name: b.stage || b.stage_name || b.name || "—",
                      count: b.count || 0,
                    }))
                  : []
              }
              layout="vertical"
            />
          </div>
          {metrics.conversion_rate != null && (
            <div className="flex justify-center">
              <SatisfactionGauge
                value={metrics.conversion_rate}
                label="Taxa de Conversão"
              />
            </div>
          )}
        </div>
      );

    case "ai_service":
      return (
        <div className="space-y-6">
          {metrics.avg_sentiment != null && (
            <div className="flex justify-center">
              <SatisfactionGauge
                value={metrics.avg_sentiment}
                max={10}
                label="Sentimento Médio"
                suffix=""
              />
            </div>
          )}
          {Array.isArray(breakdown) && breakdown.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Distribuição por Faixa</h3>
              <FunnelChart
                data={breakdown.map((b: any) => ({
                  name: b.score_range || b.range || "—",
                  count: b.count || 0,
                }))}
              />
            </div>
          )}
        </div>
      );

    case "new_leads":
      return (
        <div className="space-y-6">
          {Array.isArray(breakdown) && breakdown.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Evolução de Leads</h3>
              <TimelineChart
                data={breakdown}
                lines={[{ dataKey: "count", label: "Leads", color: "#6366f1" }]}
              />
            </div>
          )}
          {metrics.by_channel && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Por Canal</h3>
              <SimplePieChart data={objectToArray(metrics.by_channel)} />
            </div>
          )}
        </div>
      );

    case "leads_conversions":
    case "recurrence_conversion":
      return (
        <div className="space-y-6">
          {metrics.conversion_rate != null && (
            <div className="flex justify-center">
              <SatisfactionGauge
                value={metrics.conversion_rate}
                label="Taxa de Conversão"
              />
            </div>
          )}
          {Array.isArray(breakdown) && breakdown.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Evolução</h3>
              <TimelineChart
                data={breakdown}
                lines={[
                  { dataKey: "rate", label: "Taxa", color: "#6366f1" },
                  ...(breakdown[0]?.leads != null
                    ? [{ dataKey: "leads", label: "Leads", color: "#8b5cf6" }]
                    : []),
                ]}
                xAxisKey={breakdown[0]?.source ? "source" : breakdown[0]?.month ? "month" : "date"}
              />
            </div>
          )}
        </div>
      );

    case "revenue":
      return (
        <div className="space-y-6">
          <SimpleBarChart
            data={[
              { name: "Receita", value: metrics.total_revenue || 0 },
              { name: "Despesas", value: metrics.total_expenses || 0 },
              { name: "Custos Equipe", value: metrics.team_costs || 0 },
              { name: "Lucro", value: metrics.net_profit || 0 },
            ]}
          />
          {metrics.margin_pct != null && (
            <div className="flex justify-center">
              <SatisfactionGauge
                value={metrics.margin_pct}
                label="Margem de Lucro"
              />
            </div>
          )}
        </div>
      );

    case "service_status":
      return (
        <div className="space-y-6">
          <SimplePieChart
            data={[
              { name: "Abertas", value: metrics.open || 0 },
              { name: "Pendentes", value: metrics.pending || 0 },
              { name: "Resolvidas", value: metrics.resolved || 0 },
            ]}
          />
          {Array.isArray(breakdown) && breakdown.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Evolução</h3>
              <ServiceStatusChart
                data={breakdown}
                areas={[
                  { dataKey: "open", label: "Abertas", color: "#f97316" },
                  { dataKey: "pending", label: "Pendentes", color: "#eab308" },
                  { dataKey: "resolved", label: "Resolvidas", color: "#22c55e" },
                ]}
              />
            </div>
          )}
        </div>
      );

    case "satisfaction_index":
    case "client_evaluation":
      return (
        <div className="space-y-6">
          {metrics.avg_score != null && (
            <div className="flex justify-center">
              <SatisfactionGauge
                value={metrics.avg_score}
                max={10}
                label={reportType === "satisfaction_index" ? "NPS Médio" : "Avaliação Média"}
                suffix=""
                size="lg"
              />
            </div>
          )}
          {metrics.by_rating && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Distribuição por Nota</h3>
              <SimplePieChart data={objectToArray(metrics.by_rating)} />
            </div>
          )}
          {Array.isArray(breakdown) && breakdown.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Evolução</h3>
              <TimelineChart
                data={breakdown}
                lines={[
                  { dataKey: "avg_score", label: "Nota Média", color: "#6366f1" },
                  ...(breakdown[0]?.avg_rating != null
                    ? [{ dataKey: "avg_rating", label: "Avaliação", color: "#8b5cf6" }]
                    : []),
                ]}
              />
            </div>
          )}
        </div>
      );

    case "agents_performance":
      return (
        <div>
          <h3 className="text-sm font-semibold mb-3">Performance dos Atendentes</h3>
          <PerformanceTable
            data={Array.isArray(breakdown) ? breakdown : []}
            nameKey="agent_name"
            columns={[
              { key: "resolved", label: "Resolvidos", barKey: true },
              { key: "pending", label: "Pendentes" },
              { key: "avg_time", label: "TMA (min)", format: (v: number) => v ? `${Math.round(v)}` : "—" },
            ]}
          />
        </div>
      );

    case "professionals_performance":
      return (
        <div>
          <h3 className="text-sm font-semibold mb-3">Performance dos Profissionais</h3>
          <PerformanceTable
            data={Array.isArray(breakdown) ? breakdown : []}
            columns={[
              { key: "procedures_done", label: "Procedimentos", barKey: true },
              { key: "appointments", label: "Agendamentos" },
              {
                key: "revenue",
                label: "Receita",
                format: (v: number) =>
                  v != null
                    ? new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(v)
                    : "—",
              },
            ]}
          />
        </div>
      );

    case "appointments":
      return (
        <div className="space-y-6">
          {Array.isArray(breakdown) && breakdown.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Agendamentos por Dia</h3>
              <TimelineChart
                data={breakdown}
                lines={[{ dataKey: "count", label: "Agendamentos", color: "#6366f1" }]}
              />
            </div>
          )}
          {metrics.by_professional && Array.isArray(metrics.by_professional) && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Por Profissional</h3>
              <SimplePieChart
                data={metrics.by_professional.map((p: any) => ({
                  name: p.name,
                  value: p.count,
                }))}
              />
            </div>
          )}
        </div>
      );

    case "clients_per_queue":
      return (
        <div className="space-y-6">
          {Array.isArray(breakdown) && breakdown.length > 0 && (
            <>
              <div>
                <h3 className="text-sm font-semibold mb-3">Clientes por Fila</h3>
                <FunnelChart
                  data={breakdown.map((b: any) => ({
                    name: b.queue_name || "—",
                    count: b.count || 0,
                  }))}
                />
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-3">Distribuição</h3>
                <SimplePieChart
                  data={breakdown.map((b: any) => ({
                    name: b.queue_name || "—",
                    value: b.count || 0,
                  }))}
                />
              </div>
            </>
          )}
        </div>
      );

    case "top_products":
      return (
        <div>
          <h3 className="text-sm font-semibold mb-3">Ranking de Produtos</h3>
          <RankingList
            data={
              Array.isArray(breakdown)
                ? breakdown.map((b: any) => ({
                    name: b.name || "—",
                    value: b.quantity || 0,
                    secondary: b.revenue
                      ? new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(b.revenue)
                      : undefined,
                    type: b.type,
                  }))
                : []
            }
            valueLabel="vendas"
          />
        </div>
      );

    case "stagnated_deals":
      return (
        <div>
          <h3 className="text-sm font-semibold mb-3">Negociações Estagnadas</h3>
          <PerformanceTable
            data={Array.isArray(breakdown) ? breakdown : []}
            nameKey="deal_title"
            columns={[
              { key: "days_stagnated", label: "Dias Parado", barKey: true },
              { key: "funnel", label: "Funil" },
              { key: "stage", label: "Etapa" },
              {
                key: "value",
                label: "Valor",
                format: (v: number) =>
                  v != null
                    ? new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(v)
                    : "—",
              },
            ]}
          />
        </div>
      );

    case "avg_response_time":
      return (
        <div className="space-y-6">
          {Array.isArray(breakdown) && breakdown.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">TMA por Atendente</h3>
              <PerformanceTable
                data={breakdown}
                nameKey="agent_name"
                columns={[
                  {
                    key: "avg_seconds",
                    label: "TMA (seg)",
                    barKey: true,
                    format: (v: number) => (v ? `${Math.round(v)}s` : "—"),
                  },
                  { key: "total_responses", label: "Respostas" },
                ]}
              />
            </div>
          )}
        </div>
      );

    case "no_show_rate":
      return (
        <div className="space-y-6">
          {metrics.rate_pct != null && (
            <div className="flex justify-center">
              <SatisfactionGauge
                value={metrics.rate_pct}
                label="Taxa de No-Show"
                inverted
                size="lg"
              />
            </div>
          )}
          {Array.isArray(breakdown) && breakdown.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Por Profissional</h3>
              <PerformanceTable
                data={breakdown}
                nameKey="professional_name"
                columns={[
                  { key: "no_show", label: "Ausências", barKey: true },
                  { key: "total", label: "Total" },
                  { key: "rate", label: "%", format: (v: number) => (v != null ? `${v}%` : "—") },
                ]}
              />
            </div>
          )}
        </div>
      );

    case "marketing_roi":
      return (
        <div className="space-y-6">
          {metrics.roi_pct != null && (
            <div className="flex justify-center">
              <SatisfactionGauge
                value={metrics.roi_pct}
                label="ROI"
                max={200}
                size="lg"
              />
            </div>
          )}
          {Array.isArray(breakdown) && breakdown.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Por Campanha</h3>
              <PerformanceTable
                data={breakdown}
                nameKey="campaign_name"
                columns={[
                  {
                    key: "roi",
                    label: "ROI",
                    barKey: true,
                    format: (v: number) => (v != null ? `${v}%` : "—"),
                  },
                  { key: "leads", label: "Leads" },
                  { key: "conversions", label: "Conversões" },
                  {
                    key: "investment",
                    label: "Investimento",
                    format: (v: number) =>
                      v != null
                        ? new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          }).format(v)
                        : "—",
                  },
                ]}
              />
            </div>
          )}
        </div>
      );

    case "avg_ticket":
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-center gap-8">
            <div className="text-center">
              <p className="text-3xl font-bold tabular-nums">
                {formatMetricValue(metrics.avg_value, "avg_value")}
              </p>
              <p className="text-sm text-muted-foreground">Ticket Médio</p>
            </div>
            {metrics.median_value != null && (
              <div className="text-center">
                <p className="text-3xl font-bold tabular-nums">
                  {formatMetricValue(metrics.median_value, "median_value")}
                </p>
                <p className="text-sm text-muted-foreground">Mediana</p>
              </div>
            )}
          </div>
          {Array.isArray(breakdown) && breakdown.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Distribuição por Faixa</h3>
              <FunnelChart
                data={breakdown.map((b: any) => ({
                  name: b.range || "—",
                  count: b.count || 0,
                }))}
              />
            </div>
          )}
        </div>
      );

    case "churn":
      return (
        <div className="space-y-6">
          <div className="flex justify-center gap-8">
            {metrics.churn_rate != null && (
              <SatisfactionGauge
                value={metrics.churn_rate}
                label="Taxa de Churn"
                inverted
              />
            )}
            {metrics.retention_rate != null && (
              <SatisfactionGauge
                value={metrics.retention_rate}
                label="Taxa de Retenção"
              />
            )}
          </div>
          {Array.isArray(breakdown) && breakdown.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3">Evolução Mensal</h3>
              <TimelineChart
                data={breakdown}
                lines={[
                  { dataKey: "active", label: "Ativos", color: "#22c55e" },
                  { dataKey: "churned", label: "Churned", color: "#ef4444" },
                ]}
                xAxisKey="month"
              />
            </div>
          )}
        </div>
      );

    default:
      return (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">
            Visualização não disponível para este tipo de relatório.
          </p>
          {Array.isArray(breakdown) && breakdown.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold mb-3">Dados</h3>
              <pre className="text-xs text-left bg-accent rounded-lg p-4 max-h-[300px] overflow-auto">
                {JSON.stringify(breakdown, null, 2)}
              </pre>
            </div>
          )}
        </div>
      );
  }
}

// ==================== HELPER COMPONENTS ====================

function SimplePieChart({ data }: { data: Array<{ name: string; value: number }> }) {
  const filtered = data.filter((d) => d.value > 0);
  if (filtered.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
        Sem dados
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={filtered}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={90}
          dataKey="value"
          nameKey="name"
          label={({ name, percent }: any) =>
            `${name} (${(percent * 100).toFixed(0)}%)`
          }
          labelLine={false}
        >
          {filtered.map((_, index) => (
            <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

function SimpleBarChart({ data }: { data: Array<{ name: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={
                entry.name === "Lucro"
                  ? entry.value >= 0
                    ? "#22c55e"
                    : "#ef4444"
                  : PIE_COLORS[index % PIE_COLORS.length]
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function objectToArray(obj: any): Array<{ name: string; value: number }> {
  if (!obj || typeof obj !== "object") return [];
  if (Array.isArray(obj)) {
    return obj.map((item: any) => ({
      name: item.channel || item.name || item.label || "—",
      value: item.count || item.value || 0,
    }));
  }
  return Object.entries(obj).map(([name, value]) => ({
    name,
    value: Number(value) || 0,
  }));
}
