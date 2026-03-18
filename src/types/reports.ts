// ==================== REPORT TYPES ====================

export const REPORT_TYPES = [
  "delivery_funnel",
  "qualification_funnel",
  "ai_service",
  "recurrence",
  "new_leads",
  "leads_conversions",
  "recurrence_conversion",
  "revenue",
  "service_status",
  "satisfaction_index",
  "agents_performance",
  "professionals_performance",
  "appointments",
  "clients_per_queue",
  "top_products",
  "client_evaluation",
  "stagnated_deals",
  "avg_response_time",
  "no_show_rate",
  "marketing_roi",
  "avg_ticket",
  "churn",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export type ReportFrequency = "daily" | "weekly" | "monthly";

// ==================== REPORT TYPE CONFIG ====================

export interface ReportTypeConfig {
  key: ReportType;
  label: string;
  description: string;
  icon: string; // lucide icon name
  primaryMetric: string; // key in metrics to display on card
  primaryLabel: string;
  secondaryMetric?: string;
  secondaryLabel?: string;
  category: "funnel" | "financial" | "operational" | "performance" | "marketing";
}

export const REPORT_TYPE_CONFIG: Record<ReportType, ReportTypeConfig> = {
  delivery_funnel: {
    key: "delivery_funnel",
    label: "Funil de Delivery",
    description: "Distribuição de procedimentos por etapa no período",
    icon: "GitBranch",
    primaryMetric: "total",
    primaryLabel: "procedimentos",
    secondaryMetric: "conversion_rate",
    secondaryLabel: "Taxa de conversão",
    category: "funnel",
  },
  qualification_funnel: {
    key: "qualification_funnel",
    label: "Funil de Qualificação",
    description: "Pipeline de negociações no funil de qualificação humana",
    icon: "Filter",
    primaryMetric: "total_deals",
    primaryLabel: "negociações",
    secondaryMetric: "conversion_rate",
    secondaryLabel: "Taxa de conversão",
    category: "funnel",
  },
  ai_service: {
    key: "ai_service",
    label: "Atendimento IA",
    description: "Performance da inteligência artificial nos atendimentos",
    icon: "Bot",
    primaryMetric: "total_analyses",
    primaryLabel: "análises",
    secondaryMetric: "avg_sentiment",
    secondaryLabel: "Sentimento médio",
    category: "operational",
  },
  recurrence: {
    key: "recurrence",
    label: "Recorrência",
    description: "Funil de recorrência de clientes para novos procedimentos",
    icon: "RefreshCw",
    primaryMetric: "total_deals",
    primaryLabel: "oportunidades",
    secondaryMetric: "conversion_rate",
    secondaryLabel: "Taxa de retorno",
    category: "funnel",
  },
  new_leads: {
    key: "new_leads",
    label: "Leads Novos",
    description: "Volume de novos contatos captados no período",
    icon: "UserPlus",
    primaryMetric: "total_new",
    primaryLabel: "novos leads",
    secondaryMetric: "growth_pct",
    secondaryLabel: "Crescimento",
    category: "marketing",
  },
  leads_conversions: {
    key: "leads_conversions",
    label: "Leads x Conversões",
    description: "Proporção de contatos que se tornaram negócios fechados",
    icon: "TrendingUp",
    primaryMetric: "total_leads",
    primaryLabel: "leads",
    secondaryMetric: "conversion_rate",
    secondaryLabel: "Taxa de conversão",
    category: "marketing",
  },
  recurrence_conversion: {
    key: "recurrence_conversion",
    label: "Conversão Recorrência",
    description: "Taxa de conversão no funil de recorrência",
    icon: "Repeat",
    primaryMetric: "total_recurrence",
    primaryLabel: "oportunidades",
    secondaryMetric: "conversion_rate",
    secondaryLabel: "% conversão",
    category: "funnel",
  },
  revenue: {
    key: "revenue",
    label: "Faturamento",
    description: "Resumo financeiro: receitas, despesas e lucro líquido",
    icon: "DollarSign",
    primaryMetric: "total_revenue",
    primaryLabel: "receita",
    secondaryMetric: "margin_pct",
    secondaryLabel: "Margem",
    category: "financial",
  },
  service_status: {
    key: "service_status",
    label: "Atendimento",
    description: "Distribuição de atendimentos por status (abertas, pendentes, concluídas)",
    icon: "Headphones",
    primaryMetric: "total",
    primaryLabel: "atendimentos",
    secondaryMetric: "resolution_rate",
    secondaryLabel: "Taxa de resolução",
    category: "operational",
  },
  satisfaction_index: {
    key: "satisfaction_index",
    label: "Satisfação",
    description: "Índice de satisfação dos clientes baseado em NPS",
    icon: "Heart",
    primaryMetric: "avg_score",
    primaryLabel: "nota média",
    secondaryMetric: "total_responses",
    secondaryLabel: "Respostas",
    category: "operational",
  },
  agents_performance: {
    key: "agents_performance",
    label: "Atendentes",
    description: "Performance individual dos atendentes da equipe",
    icon: "Users",
    primaryMetric: "total_resolved",
    primaryLabel: "resolvidos",
    secondaryMetric: "avg_response_time_min",
    secondaryLabel: "TMA (min)",
    category: "performance",
  },
  professionals_performance: {
    key: "professionals_performance",
    label: "Profissionais",
    description: "Performance dos profissionais em procedimentos",
    icon: "Stethoscope",
    primaryMetric: "total_procedures",
    primaryLabel: "procedimentos",
    secondaryMetric: "avg_per_professional",
    secondaryLabel: "Média/profissional",
    category: "performance",
  },
  appointments: {
    key: "appointments",
    label: "Agendamentos",
    description: "Volume de agendamentos e distribuição por tipo",
    icon: "Calendar",
    primaryMetric: "total",
    primaryLabel: "agendamentos",
    category: "operational",
  },
  clients_per_queue: {
    key: "clients_per_queue",
    label: "Clientes por Fila",
    description: "Distribuição de atendimentos por fila de atendimento",
    icon: "Layers",
    primaryMetric: "total_clients",
    primaryLabel: "clientes",
    secondaryMetric: "avg_per_queue",
    secondaryLabel: "Média/fila",
    category: "operational",
  },
  top_products: {
    key: "top_products",
    label: "Produtos Mais Vendidos",
    description: "Ranking de produtos e serviços por volume de vendas",
    icon: "ShoppingBag",
    primaryMetric: "total_products_sold",
    primaryLabel: "itens vendidos",
    secondaryMetric: "total_revenue",
    secondaryLabel: "Receita total",
    category: "financial",
  },
  client_evaluation: {
    key: "client_evaluation",
    label: "Avaliação Clientes",
    description: "Notas e feedbacks dos clientes no período",
    icon: "Star",
    primaryMetric: "avg_score",
    primaryLabel: "nota média",
    secondaryMetric: "total_responses",
    secondaryLabel: "Avaliações",
    category: "operational",
  },
  stagnated_deals: {
    key: "stagnated_deals",
    label: "Negociações Estagnadas",
    description: "Negociações paradas além do limite de dias por etapa",
    icon: "AlertTriangle",
    primaryMetric: "total_stagnated",
    primaryLabel: "estagnadas",
    secondaryMetric: "avg_days_stagnated",
    secondaryLabel: "Dias médios",
    category: "funnel",
  },
  avg_response_time: {
    key: "avg_response_time",
    label: "Tempo de Resposta",
    description: "Tempo médio entre mensagem do cliente e resposta do agente",
    icon: "Clock",
    primaryMetric: "overall_avg_seconds",
    primaryLabel: "segundos (média)",
    secondaryMetric: "fastest_agent",
    secondaryLabel: "Mais rápido",
    category: "performance",
  },
  no_show_rate: {
    key: "no_show_rate",
    label: "Taxa de No-Show",
    description: "Percentual de agendamentos com ausência do cliente",
    icon: "UserX",
    primaryMetric: "rate_pct",
    primaryLabel: "% no-show",
    secondaryMetric: "total_appointments",
    secondaryLabel: "Total agendamentos",
    category: "operational",
  },
  marketing_roi: {
    key: "marketing_roi",
    label: "ROI Marketing",
    description: "Retorno sobre investimento por campanha de marketing",
    icon: "Target",
    primaryMetric: "total_investment",
    primaryLabel: "investimento",
    secondaryMetric: "cost_per_lead",
    secondaryLabel: "Custo/lead",
    category: "marketing",
  },
  avg_ticket: {
    key: "avg_ticket",
    label: "Ticket Médio",
    description: "Valor médio por negociação fechada",
    icon: "Receipt",
    primaryMetric: "avg_value",
    primaryLabel: "ticket médio",
    secondaryMetric: "total_deals",
    secondaryLabel: "Negociações",
    category: "financial",
  },
  churn: {
    key: "churn",
    label: "Churn de Clientes",
    description: "Taxa de inatividade e retenção de clientes",
    icon: "LogOut",
    primaryMetric: "churn_rate",
    primaryLabel: "% churn",
    secondaryMetric: "retention_rate",
    secondaryLabel: "Retenção",
    category: "marketing",
  },
};

// ==================== DATABASE TYPES ====================

export interface StrategicReport {
  id: string;
  user_id: string;
  report_number: number;
  report_type: ReportType;
  frequency: ReportFrequency;
  period_start: string;
  period_end: string;
  data: {
    metrics: Record<string, any>;
    breakdown: any[];
  };
  previous_data: {
    metrics: Record<string, any>;
    breakdown: any[];
  };
  metadata: Record<string, any>;
  status: string;
  created_at: string;
}

export interface ReportPreferences {
  id: string;
  user_id: string;
  active_types: ReportType[];
  created_at: string;
  updated_at: string;
}

// ==================== UI HELPERS ====================

export function getComparisonPct(
  current: number,
  previous: number
): { pct: number; direction: "up" | "down" | "neutral" } {
  if (previous === 0 && current === 0) return { pct: 0, direction: "neutral" };
  if (previous === 0) return { pct: 100, direction: "up" };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (Math.abs(pct) < 1) return { pct: 0, direction: "neutral" };
  return { pct: Math.abs(pct), direction: pct > 0 ? "up" : "down" };
}

export function formatMetricValue(
  value: any,
  metricKey: string
): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "string") return value;

  // Currency metrics
  if (
    metricKey.includes("revenue") ||
    metricKey.includes("investment") ||
    metricKey.includes("profit") ||
    metricKey.includes("cost") ||
    metricKey.includes("ticket") ||
    metricKey === "avg_value" ||
    metricKey === "median_value" ||
    metricKey === "total_revenue"
  ) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  }

  // Percentage metrics
  if (
    metricKey.includes("rate") ||
    metricKey.includes("pct") ||
    metricKey.includes("margin")
  ) {
    return `${value}%`;
  }

  // Time metrics (seconds)
  if (metricKey.includes("seconds")) {
    if (value >= 3600)
      return `${Math.round(value / 3600)}h ${Math.round((value % 3600) / 60)}m`;
    if (value >= 60) return `${Math.round(value / 60)}m`;
    return `${value}s`;
  }

  // Score metrics
  if (metricKey.includes("score") || metricKey.includes("sentiment")) {
    return Number(value).toFixed(1);
  }

  // Default: number formatting
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function getFrequencyLabel(frequency: ReportFrequency): string {
  switch (frequency) {
    case "daily":
      return "Diário";
    case "weekly":
      return "Semanal";
    case "monthly":
      return "Mensal";
  }
}

export function getCategoryLabel(
  category: ReportTypeConfig["category"]
): string {
  switch (category) {
    case "funnel":
      return "Funis";
    case "financial":
      return "Financeiro";
    case "operational":
      return "Operacional";
    case "performance":
      return "Performance";
    case "marketing":
      return "Marketing";
  }
}
