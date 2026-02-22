// @ts-nocheck - RPC functions will be available after migration runs
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle,
  Cpu,
  Database,
  HardDrive,
  LogOut,
  RefreshCw,
  Server,
  Settings,
  Shield,
  Ticket,
  Wifi,
  Zap,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { StatusCard } from "@/components/dev-manager/StatusCard";
import { MetricGauge } from "@/components/dev-manager/MetricGauge";
import { LiveSessionActivity } from "@/components/dev-manager/LiveSessionActivity";
import { InstancesTable } from "@/components/dev-manager/InstancesTable";
import { TicketAlerts } from "@/components/dev-manager/TicketAlerts";
import { WebhookQueue } from "@/components/dev-manager/WebhookQueue";
import { TokenUsageWidget } from "@/components/dev-manager/TokenUsageWidget";
import { EdgeFunctionLogs } from "@/components/dev-manager/EdgeFunctionLogs";
import { AlertFeed } from "@/components/dev-manager/AlertFeed";
import { DevManagerSettings } from "@/components/dev-manager/DevManagerSettings";
import { N8nErrorLog } from "@/components/dev-manager/N8nErrorLog";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://swfshqvvbohnahdyndch.supabase.co";
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1`;
const AUTO_REFRESH_INTERVAL = 60; // seconds

interface InfraData {
  refreshed_at: string;
  collected_at: string | null;
  n8n: {
    active_workflows: number;
    failed_executions: number;
    recent_errors: Array<{ id: string; workflowId: string; workflowName?: string | null; status: string; startedAt: string; stoppedAt: string }>;
    reachable: boolean;
    status: "ok" | "warning" | "error";
  };
  database: {
    active_connections: number;
    total_connections: number;
    max_connections: number;
    db_size_mb: number;
    cache_hit_ratio: number;
    table_sizes: Array<{ table: string; size_mb: number }>;
    status: "ok" | "warning" | "error";
  };
  containers: {
    total: number;
    running: number;
    stopped: number;
    avg_cpu_percent: number;
    avg_memory_percent: number;
    list: unknown[];
    portainer_reachable: boolean;
    status: "ok" | "warning" | "error";
  };
  instances: {
    wa_total: number;
    wa_disconnected: number;
    wa_disconnected_list: Array<{ id: string; name: string; instance_name: string; status: string; company_name: string }>;
    instagram_total: number;
    instagram_disconnected: number;
    instagram_disconnected_list: Array<{ id: string; account_name: string; status: string; token_expires_at: string | null; company_name: string }>;
    status: "ok" | "warning" | "error";
  };
  tickets: {
    open_total: number;
    urgent_total: number;
    urgent_list: unknown[];
    all_list: Array<{ id: string; title: string; priority: string; status: string; created_at: string; company_name: string; creator_name?: string; description?: string; client_summary?: string; support_response?: string | null }>;
    status: "ok" | "warning" | "error" | "info";
  };
  webhook_queue: {
    pending: number;
    processing: number;
    failed: number;
    done: number;
    recent_failures: Array<{ instance_name: string; event_type: string; error_message: string; created_at: string }>;
    status: "ok" | "warning" | "error";
  };
  tokens: {
    top_tenants: Array<{ profile_id: string; company_name: string; total_tokens: number; total_cost: number }>;
    grand_total_tokens: number;
    grand_total_cost: number;
  };
  live_sessions: {
    active_conversations: number;
    messages_last_5min: number;
  };
  alerts: {
    recent: Array<{ id: string; type: string; severity: string; message: string; created_at: string; metadata: Record<string, unknown>; resolved: boolean }>;
    unresolved_count: number;
  };
  edge_function_logs: Array<{ id: string; timestamp: string; function_name: string; status: number; duration_ms: number; event_message?: string }>;
}

// ── Health helpers ────────────────────────────────────────────────────────────

function calcDbStress(db: InfraData["database"]): number {
  const connStress = db.max_connections > 0
    ? (db.total_connections / db.max_connections) * 100 : 0;
  const cacheStress = db.cache_hit_ratio > 0
    ? Math.max(0, 100 - db.cache_hit_ratio) : 0;
  return Math.min(100, Math.max(0, Math.round(connStress * 0.55 + cacheStress * 0.45)));
}

function healthLevel(score: number): { label: string; color: string; bg: string } {
  if (score <= 20) return { label: "Excelente",     color: "#22c55e", bg: "#22c55e18" };
  if (score <= 40) return { label: "Boa",           color: "#84cc16", bg: "#84cc1618" };
  if (score <= 60) return { label: "Estável",       color: "#eab308", bg: "#eab30818" };
  if (score <= 80) return { label: "Problemática",  color: "#f97316", bg: "#f9731618" };
  return               { label: "Crítica",       color: "#ef4444", bg: "#ef444418" };
}

function calcSupabaseHealth(d: InfraData): number {
  const dbStress = calcDbStress(d.database);
  const webhookStress = Math.min(100, d.webhook_queue.failed * 5);
  const n8nPenalty = !d.n8n.reachable ? 40 : d.n8n.failed_executions >= 5 ? 20 : 0;
  return Math.min(100, Math.round(dbStress * 0.55 + webhookStress * 0.25 + n8nPenalty * 0.20));
}

function calcDockerHealth(c: InfraData["containers"]): number {
  if (!c.portainer_reachable) return 100;
  const downPenalty = c.total > 0 ? Math.min(100, (c.stopped / c.total) * 150) : 0;
  const cpuMem = c.avg_cpu_percent * 0.40 + c.avg_memory_percent * 0.60;
  return Math.min(100, Math.round(downPenalty * 0.50 + cpuMem * 0.50));
}

// ── Real-time health analysis ─────────────────────────────────────────────────

interface AnalysisLine { label: string; detail: string; stress: number }
interface HealthAnalysis { score: number; metrics: AnalysisLine[]; suggestions: string[] }

function analyzeSupabase(d: InfraData): HealthAnalysis {
  const connUtil = d.database.max_connections > 0
    ? (d.database.total_connections / d.database.max_connections) * 100 : 0;
  const cachePressure = d.database.cache_hit_ratio > 0
    ? Math.max(0, 100 - d.database.cache_hit_ratio) : 0;
  const webhookStress = Math.min(100, d.webhook_queue.failed * 5);
  const n8nStress = !d.n8n.reachable ? 100 : d.n8n.failed_executions >= 5 ? 40 : 0;

  const metrics: AnalysisLine[] = [
    {
      label: "Conexões BD",
      detail: d.database.max_connections > 0
        ? `${d.database.total_connections}/${d.database.max_connections} (${Math.round(connUtil)}%)`
        : `${d.database.total_connections} ativas`,
      stress: Math.round(connUtil),
    },
    {
      label: "Cache Hit Ratio",
      detail: d.database.cache_hit_ratio > 0
        ? `${d.database.cache_hit_ratio}% — pressão ${Math.round(cachePressure)}%`
        : "Sem dados suficientes",
      stress: Math.round(cachePressure),
    },
    {
      label: "Webhooks",
      detail: d.webhook_queue.failed > 0 ? `${d.webhook_queue.failed} falha(s)` : "Fila saudável",
      stress: webhookStress,
    },
    {
      label: "n8n",
      detail: !d.n8n.reachable ? "Inacessível" : d.n8n.failed_executions > 0 ? `${d.n8n.failed_executions} erros` : "OK",
      stress: n8nStress,
    },
  ];

  const suggestions: string[] = [];
  if (connUtil > 70)
    suggestions.push(`Conexões em ${Math.round(connUtil)}% do limite — ative PgBouncer ou faça upgrade do plano Supabase`);
  else if (connUtil > 50)
    suggestions.push(`Conexões em ${Math.round(connUtil)}% — monitore crescimento e avalie connection pooling`);
  if (d.database.cache_hit_ratio > 0 && d.database.cache_hit_ratio < 80)
    suggestions.push(`Cache hit baixo (${d.database.cache_hit_ratio}%) — adicione índices nas tabelas mais acessadas ou faça upgrade do plano para ampliar shared_buffers`);
  else if (d.database.cache_hit_ratio > 0 && d.database.cache_hit_ratio < 90)
    suggestions.push(`Cache hit em ${d.database.cache_hit_ratio}% — monitore e considere índices adicionais`);
  if (d.webhook_queue.failed > 10)
    suggestions.push(`${d.webhook_queue.failed} webhooks com falha — reprocesse ou limpe a fila e revise os logs`);
  else if (d.webhook_queue.failed > 3)
    suggestions.push(`${d.webhook_queue.failed} webhooks falhando — investigue o padrão de erro nos logs`);
  if (!d.n8n.reachable)
    suggestions.push("n8n inacessível — verifique o container e as configurações de rede/DNS");
  else if (d.n8n.failed_executions >= 5)
    suggestions.push(`${d.n8n.failed_executions} execuções n8n com erro — revise os workflows na aba de erros`);

  return { score: calcSupabaseHealth(d), metrics, suggestions };
}

function analyzeDocker(d: InfraData): HealthAnalysis {
  const c = d.containers;
  const downPct = c.total > 0 ? Math.round((c.stopped / c.total) * 100) : 0;

  const metrics: AnalysisLine[] = [
    {
      label: "Portainer",
      detail: c.portainer_reachable ? "Conectado" : "Inacessível",
      stress: c.portainer_reachable ? 0 : 100,
    },
    {
      label: "Containers",
      detail: `${c.running}/${c.total} rodando${c.stopped > 0 ? ` · ${c.stopped} parado(s)` : ""}`,
      stress: Math.min(100, downPct * 1.5),
    },
    {
      label: "CPU Média",
      detail: `${c.avg_cpu_percent}%`,
      stress: c.avg_cpu_percent,
    },
    {
      label: "Memória Média",
      detail: `${c.avg_memory_percent}%`,
      stress: c.avg_memory_percent,
    },
  ];

  const suggestions: string[] = [];
  if (!c.portainer_reachable)
    suggestions.push("Portainer inacessível — verifique a URL e o token de API nas Configurações");
  if (c.stopped > 0)
    suggestions.push(`${c.stopped} container(s) parado(s) — reinicie via Portainer e investigue os logs de cada container`);
  if (c.avg_memory_percent > 85)
    suggestions.push(`Memória em ${c.avg_memory_percent}% — risco de OOM kill; aumente a RAM da VPS com urgência`);
  else if (c.avg_memory_percent > 70)
    suggestions.push(`Memória em ${c.avg_memory_percent}% — planeje upgrade de RAM da VPS em breve`);
  if (c.avg_cpu_percent > 80)
    suggestions.push(`CPU em ${c.avg_cpu_percent}% — VPS sobrecarregada; considere upgrade de CPU ou redistribuir serviços`);
  else if (c.avg_cpu_percent > 60)
    suggestions.push(`CPU em ${c.avg_cpu_percent}% — monitore picos; VPS pode precisar de upgrade`);

  return { score: calcDockerHealth(c), metrics, suggestions };
}

// ─────────────────────────────────────────────────────────────────────────────

export default function DevManager() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCollecting, setIsCollecting] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [data, setData] = useState<InfraData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_INTERVAL);
  const [configValues, setConfigValues] = useState({
    portainer_url: "https://painel.clinvia.com.br/",
    n8n_url: "https://workflows.clinvia.com.br/",
    admin_wa_number: "",
    cpu_threshold: "80",
    memory_threshold: "85",
    n8n_error_threshold: "5",
  });

  const [activeTooltip, setActiveTooltip] = useState<"supabase" | "docker" | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const refreshRef = useRef<NodeJS.Timeout | null>(null);

  // =============================================
  // Auth check
  // =============================================
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (profile?.role !== "super-admin") {
        toast.error("Acesso negado: somente super-admin");
        navigate("/");
        return;
      }

      setAuthChecked(true);
      setIsLoading(false);
    })();
  }, [navigate]);

  // =============================================
  // Load system_config
  // =============================================
  const loadConfig = useCallback(async () => {
    const { data: configs } = await supabase
      .from("system_config")
      .select("key, value");
    if (configs) {
      const map: Record<string, string> = {};
      for (const c of configs) map[c.key] = c.value;
      setConfigValues(prev => ({ ...prev, ...map }));
    }
  }, []);

  // =============================================
  // Fetch metrics from edge function
  // =============================================
  const fetchMetrics = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${FUNCTION_URL}/infra-get-metrics`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }

      const json = await res.json();
      setData(json);
      setCountdown(AUTO_REFRESH_INTERVAL);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      if (!silent) toast.error(`Falha ao atualizar: ${msg}`);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // =============================================
  // Trigger infra-collector (collect now)
  // =============================================
  const triggerCollector = useCallback(async () => {
    setIsCollecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${FUNCTION_URL}/infra-collector`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });

      const json = await res.json();
      if (json.success) {
        toast.success("Coleta iniciada — atualizando dados...");
        await fetchMetrics(true);
      } else {
        toast.error(json.error ?? "Falha na coleta");
      }
    } catch (err) {
      toast.error(`Erro no coletor: ${(err as Error).message}`);
    } finally {
      setIsCollecting(false);
    }
  }, [fetchMetrics]);

  // =============================================
  // Clear actions
  // =============================================
  const handleClearAlerts = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${FUNCTION_URL}/infra-get-metrics`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_alerts" }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Alertas limpos com sucesso");
        await fetchMetrics(true);
      } else {
        toast.error(json.error ?? "Falha ao limpar alertas");
      }
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    }
  }, [fetchMetrics]);

  const handleClearN8nErrors = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${FUNCTION_URL}/infra-get-metrics`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_n8n_errors" }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Erros n8n limpos com sucesso");
        await fetchMetrics(true);
      } else {
        toast.error(json.error ?? "Falha ao limpar erros n8n");
      }
    } catch (err) {
      toast.error(`Erro: ${(err as Error).message}`);
    }
  }, [fetchMetrics]);

  // =============================================
  // Initial load + auto-refresh
  // =============================================
  useEffect(() => {
    if (!authChecked) return;
    loadConfig();
    fetchMetrics();

    // Countdown timer
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchMetrics(true);
          return AUTO_REFRESH_INTERVAL;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [authChecked, fetchMetrics, loadConfig]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "Nunca";
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  // =============================================
  // Loading state
  // =============================================
  if (isLoading || !authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a0a" }}>
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-t-orange-500 border-orange-500/20 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm font-mono" style={{ color: "#666" }}>Autenticando...</p>
        </div>
      </div>
    );
  }

  const statusBarCards = data ? [
    {
      icon: <Activity size={18} />,
      label: "n8n",
      value: data.n8n.reachable ? `${data.n8n.active_workflows} flows` : "DOWN",
      trend: data.n8n.failed_executions > 0 ? `${data.n8n.failed_executions} erros` : "Sem erros",
      status: data.n8n.status,
      subtitle: data.n8n.reachable ? "Conectado" : "Inacessível",
    },
    {
      icon: <Database size={18} />,
      label: "Banco de Dados",
      value: data.database.db_size_mb ? `${data.database.db_size_mb} MB` : "—",
      trend: `${data.database.active_connections ?? 0} conexões ativas`,
      status: data.database.status,
      subtitle: `Cache hit: ${data.database.cache_hit_ratio ?? 0}%`,
    },
    {
      icon: <Wifi size={18} />,
      label: "Instâncias",
      value: data.instances.wa_total + data.instances.instagram_total,
      trend: data.instances.wa_disconnected + data.instances.instagram_disconnected > 0
        ? `${data.instances.wa_disconnected + data.instances.instagram_disconnected} desconectadas`
        : "Todas conectadas",
      status: data.instances.status,
      subtitle: `WA: ${data.instances.wa_total} · IG: ${data.instances.instagram_total}`,
    },
    {
      icon: <Ticket size={18} />,
      label: "Tickets",
      value: data.tickets.open_total,
      trend: data.tickets.urgent_total > 0 ? `${data.tickets.urgent_total} urgente(s)` : "Sem urgentes",
      status: data.tickets.status === "info" ? "warning" : data.tickets.status,
      subtitle: "Tickets abertos",
    },
    {
      icon: <Zap size={18} />,
      label: "Webhooks",
      value: data.webhook_queue.pending + data.webhook_queue.processing,
      trend: data.webhook_queue.failed > 0 ? `${data.webhook_queue.failed} com falha` : "Fila saudável",
      status: data.webhook_queue.status,
      subtitle: "Pendentes + processando",
    },
    {
      icon: <Activity size={18} />,
      label: "Sessões Ativas",
      value: data.live_sessions.active_conversations,
      trend: `${(data.live_sessions.messages_last_5min / 5).toFixed(1)} msg/min`,
      status: "ok" as const,
      subtitle: "Conversas ativas",
    },
  ] : [];

  return (
    <div className="min-h-screen" style={{ background: "#0a0a0a", color: "#fff" }}>
      {/* ============================================= */}
      {/* HEADER */}
      {/* ============================================= */}
      <div
        className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3 border-b"
        style={{ background: "#0a0a0aee", borderColor: "#1a1a1a", backdropFilter: "blur(12px)" }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#f97316" }}>
            <Shield size={14} style={{ color: "#fff" }} />
          </div>
          <span className="font-mono font-bold text-sm" style={{ color: "#f97316" }}>⚡ Dev Manager</span>
          <span className="hidden sm:inline text-xs px-2 py-0.5 rounded font-mono" style={{ background: "#f9731620", color: "#f97316" }}>
            SUPER-ADMIN
          </span>
        </div>

        {/* ── Health Indicators ── */}
        {data && (() => {
          const sbAnalysis = analyzeSupabase(data);
          const dkAnalysis = analyzeDocker(data);
          const sh = healthLevel(sbAnalysis.score);
          const dh = healthLevel(dkAnalysis.score);
          const showSuggestions = (score: number) => score > 40;

          const TooltipContent = ({ analysis, label, align }: { analysis: HealthAnalysis; label: string; align: "left" | "right" }) => {
            const h = healthLevel(analysis.score);
            return (
              <div
                className="absolute top-full mt-2 z-50 rounded-xl shadow-2xl"
                style={{
                  [align]: 0,
                  background: "#0f0f0f",
                  border: `1px solid ${h.color}30`,
                  width: 300,
                  padding: 16,
                  boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px ${h.color}20`,
                }}
              >
                {/* Header */}
                <div className="flex items-center gap-2 mb-3 pb-2" style={{ borderBottom: "1px solid #1a1a1a" }}>
                  <div className="w-2 h-2 rounded-full" style={{ background: h.color }} />
                  <span className="text-xs font-semibold" style={{ color: "#fff" }}>{label}</span>
                  <span className="ml-auto text-xs font-mono font-bold" style={{ color: h.color }}>{analysis.score}% · {h.label}</span>
                </div>

                {/* Metric lines */}
                <div className="space-y-2.5 mb-3">
                  {analysis.metrics.map((m) => {
                    const mc = m.stress <= 20 ? "#22c55e" : m.stress <= 40 ? "#84cc16" : m.stress <= 60 ? "#eab308" : m.stress <= 80 ? "#f97316" : "#ef4444";
                    return (
                      <div key={m.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs" style={{ color: "#777" }}>{m.label}</span>
                          <span className="text-xs font-mono" style={{ color: mc }}>{m.detail}</span>
                        </div>
                        <div className="h-1 rounded-full overflow-hidden" style={{ background: "#1a1a1a" }}>
                          <div style={{ width: `${Math.min(100, m.stress)}%`, background: mc, height: "100%", borderRadius: 999, transition: "width 0.5s ease" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Suggestions (only when status >= Estável) */}
                {showSuggestions(analysis.score) && analysis.suggestions.length > 0 && (
                  <div className="pt-2" style={{ borderTop: "1px solid #1a1a1a" }}>
                    <p className="text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: h.color }}>
                      Sugestões de melhoria
                    </p>
                    <ul className="space-y-1.5">
                      {analysis.suggestions.map((s, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="flex-shrink-0 mt-0.5" style={{ color: h.color }}>›</span>
                          <span className="text-xs leading-relaxed" style={{ color: "#888" }}>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* All clear */}
                {!showSuggestions(analysis.score) && (
                  <p className="text-xs" style={{ color: "#444" }}>Nenhuma ação necessária no momento.</p>
                )}
              </div>
            );
          };

          return (
            <>
              {/* Supabase badge */}
              <div
                className="hidden lg:block relative"
                onMouseEnter={() => setActiveTooltip("supabase")}
                onMouseLeave={() => setActiveTooltip(null)}
              >
                <div
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium cursor-default select-none"
                  style={{ background: sh.bg, border: `1px solid ${sh.color}30` }}
                >
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: sh.color }} />
                  <span style={{ color: sh.color }}>Supabase: {sh.label}</span>
                </div>
                {activeTooltip === "supabase" && (
                  <TooltipContent analysis={sbAnalysis} label="Saúde do Supabase" align="left" />
                )}
              </div>

              {/* Docker badge */}
              <div
                className="hidden lg:block relative"
                onMouseEnter={() => setActiveTooltip("docker")}
                onMouseLeave={() => setActiveTooltip(null)}
              >
                <div
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium cursor-default select-none"
                  style={{ background: dh.bg, border: `1px solid ${dh.color}30` }}
                >
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dh.color }} />
                  <span style={{ color: dh.color }}>Docker: {dh.label}</span>
                </div>
                {activeTooltip === "docker" && (
                  <TooltipContent analysis={dkAnalysis} label="Saúde do Docker" align="right" />
                )}
              </div>
            </>
          );
        })()}

        <div className="flex-1" />

        {/* Countdown */}
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono" style={{ color: "#555" }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: countdown <= 10 ? "#f97316" : "#333" }} />
          Próximo refresh: {countdown}s
        </div>

        {/* Last collected */}
        {data?.collected_at && (
          <span className="hidden md:inline text-xs font-mono" style={{ color: "#444" }}>
            Coletado: {formatTime(data.collected_at)}
          </span>
        )}

        {/* Collect now button */}
        <button
          onClick={triggerCollector}
          disabled={isCollecting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: "#1a1a1a",
            color: isCollecting ? "#f97316" : "#888",
            border: "1px solid #2a2a2a",
          }}
          title="Disparar coleta agora"
        >
          <Play size={12} className={isCollecting ? "animate-pulse" : ""} />
          <span className="hidden sm:inline">{isCollecting ? "Coletando..." : "Coletar"}</span>
        </button>

        {/* Refresh button */}
        <button
          onClick={() => fetchMetrics()}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: "#f97316",
            color: "#fff",
            opacity: isRefreshing ? 0.7 : 1,
          }}
        >
          <RefreshCw size={12} className={isRefreshing ? "animate-spin" : ""} />
          <span className="hidden sm:inline">{isRefreshing ? "Atualizando..." : "Atualizar"}</span>
        </button>

        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-2 rounded-lg transition-all"
          style={{ background: "#1a1a1a", color: "#888", border: "1px solid #2a2a2a" }}
        >
          <Settings size={14} />
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="p-2 rounded-lg transition-all"
          style={{ background: "#1a1a1a", color: "#666", border: "1px solid #2a2a2a" }}
        >
          <LogOut size={14} />
        </button>
      </div>

      {/* ============================================= */}
      {/* MAIN CONTENT */}
      {/* ============================================= */}
      <div className="p-4 space-y-4 max-w-screen-2xl mx-auto">

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "#ef444415", border: "1px solid #ef444430" }}>
            <AlertTriangle size={16} style={{ color: "#ef4444" }} />
            <p className="text-sm" style={{ color: "#ef4444" }}>
              {error} — {data ? "Exibindo dados em cache" : "Sem dados disponíveis"}
            </p>
            <button onClick={() => fetchMetrics()} className="ml-auto text-xs underline" style={{ color: "#ef4444" }}>Tentar novamente</button>
          </div>
        )}

        {/* Loading skeleton */}
        {isRefreshing && !data && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="h-24 rounded-xl animate-pulse" style={{ background: "#111111" }} />
            ))}
          </div>
        )}

        {/* =============================================
            STATUS BAR — 6 summary cards
        ============================================= */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {statusBarCards.map((card) => (
              <StatusCard key={card.label} {...card} />
            ))}
          </div>
        )}

        {/* =============================================
            METRICS ROW — CPU + Memory gauges + Server info
        ============================================= */}
        {data && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Container Gauges */}
            <div className="rounded-xl border p-4" style={{ background: "#111111", borderColor: "#2a2a2a" }}>
              <div className="flex items-center gap-2 mb-4">
                <Server size={16} style={{ color: "#f97316" }} />
                <h3 className="text-sm font-medium" style={{ color: "#fff" }}>Métricas de Containers</h3>
                <span
                  className="ml-auto text-xs px-2 py-0.5 rounded font-mono"
                  style={{
                    background: data.containers.portainer_reachable ? "#22c55e18" : "#ef444418",
                    color: data.containers.portainer_reachable ? "#22c55e" : "#ef4444",
                  }}
                >
                  {data.containers.portainer_reachable ? "Portainer OK" : "Portainer DOWN"}
                </span>
              </div>
              <div className="flex items-center justify-around">
                <MetricGauge
                  label="CPU Média"
                  value={data.containers.avg_cpu_percent}
                  warningAt={80}
                  dangerAt={90}
                />
                <MetricGauge
                  label="Mem. Média"
                  value={data.containers.avg_memory_percent}
                  warningAt={80}
                  dangerAt={90}
                />
              </div>
              <div className="mt-3 flex justify-around text-center">
                <div>
                  <p className="text-lg font-mono font-bold" style={{ color: "#22c55e" }}>{data.containers.running}</p>
                  <p className="text-xs" style={{ color: "#555" }}>Rodando</p>
                </div>
                <div>
                  <p className="text-lg font-mono font-bold" style={{ color: data.containers.stopped > 0 ? "#ef4444" : "#555" }}>
                    {data.containers.stopped}
                  </p>
                  <p className="text-xs" style={{ color: "#555" }}>Parados</p>
                </div>
                <div>
                  <p className="text-lg font-mono font-bold" style={{ color: "#fff" }}>{data.containers.total}</p>
                  <p className="text-xs" style={{ color: "#555" }}>Total</p>
                </div>
              </div>
            </div>

            {/* Database Stats */}
            <div className="rounded-xl border p-4" style={{ background: "#111111", borderColor: "#2a2a2a" }}>
              <div className="flex items-center gap-2 mb-4">
                <Database size={16} style={{ color: "#f97316" }} />
                <h3 className="text-sm font-medium" style={{ color: "#fff" }}>Estatísticas do Banco</h3>
                <CheckCircle size={12} className="ml-auto" style={{ color: "#22c55e" }} />
              </div>
              <div className="space-y-3">
                {[
                  { label: "Tamanho BD", value: `${data.database.db_size_mb ?? 0} MB`, color: "#f97316" },
                  { label: "Conexões Ativas", value: String(data.database.active_connections ?? 0), color: "#22c55e" },
                  { label: "Total de Conexões", value: String(data.database.total_connections ?? 0), color: "#888" },
                  { label: "Cache Hit Ratio", value: `${data.database.cache_hit_ratio ?? 0}%`, color: data.database.cache_hit_ratio < 90 ? "#eab308" : "#22c55e" },
                ].map(stat => (
                  <div key={stat.label} className="flex items-center justify-between">
                    <span className="text-xs" style={{ color: "#666" }}>{stat.label}</span>
                    <span className="text-sm font-mono font-bold" style={{ color: stat.color }}>{stat.value}</span>
                  </div>
                ))}
              </div>

              {/* ── DB Stress Meter ── */}
              {(() => {
                const stress = calcDbStress(data.database);
                const h = healthLevel(stress);
                return (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid #1a1a1a" }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-xs uppercase tracking-wider" style={{ color: "#555" }}>Estresse do Banco</p>
                      <span className="text-xs font-mono font-bold" style={{ color: h.color }}>
                        {stress}% · {h.label}
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "#1a1a1a" }}>
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${stress}%`,
                          background: `linear-gradient(to right, #22c55e, ${h.color})`,
                          boxShadow: `0 0 6px ${h.color}88`,
                        }}
                      />
                    </div>
                    <p className="text-xs mt-1" style={{ color: "#444" }}>
                      {data.database.max_connections > 0
                        ? `${data.database.total_connections} / ${data.database.max_connections} conexões`
                        : `${data.database.total_connections} conexões totais`}
                    </p>
                  </div>
                );
              })()}

              {data.database.table_sizes && data.database.table_sizes.length > 0 && (
                <div className="mt-3 pt-3" style={{ borderTop: "1px solid #1a1a1a" }}>
                  <p className="text-xs mb-2 uppercase tracking-wider" style={{ color: "#555" }}>Maiores Tabelas</p>
                  {data.database.table_sizes.slice(0, 3).map(t => (
                    <div key={t.table} className="flex justify-between text-xs mb-1">
                      <span className="truncate font-mono" style={{ color: "#888" }}>{t.table.replace("public.", "")}</span>
                      <span className="font-mono ml-2 flex-shrink-0" style={{ color: "#666" }}>{t.size_mb}MB</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Live Sessions */}
            <LiveSessionActivity
              activeConversations={data.live_sessions.active_conversations}
              messagesLast5Min={data.live_sessions.messages_last_5min}
            />
          </div>
        )}

        {/* =============================================
            N8N ERROR LOG
        ============================================= */}
        {data && (
          <N8nErrorLog
            errors={data.n8n.recent_errors}
            failedCount={data.n8n.failed_executions}
            n8nUrl={configValues.n8n_url}
            onClear={handleClearN8nErrors}
          />
        )}

        {/* =============================================
            INSTANCES + TICKETS
        ============================================= */}
        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <InstancesTable
              waDisconnected={data.instances.wa_disconnected_list}
              igDisconnected={data.instances.instagram_disconnected_list}
              waTotal={data.instances.wa_total}
              igTotal={data.instances.instagram_total}
            />
            <TicketAlerts
              allTickets={data.tickets.all_list}
              openTotal={data.tickets.open_total}
              urgentTotal={data.tickets.urgent_total}
            />
          </div>
        )}

        {/* =============================================
            WEBHOOK QUEUE + TOKEN BUDGET
        ============================================= */}
        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <WebhookQueue
              pending={data.webhook_queue.pending}
              processing={data.webhook_queue.processing}
              failed={data.webhook_queue.failed}
              done={data.webhook_queue.done}
              recentFailures={data.webhook_queue.recent_failures}
              status={data.webhook_queue.status}
            />
            <TokenUsageWidget
              topTenants={data.tokens.top_tenants}
              grandTotalTokens={data.tokens.grand_total_tokens}
              grandTotalCost={data.tokens.grand_total_cost}
            />
          </div>
        )}

        {/* =============================================
            EDGE FUNCTION LOGS + ALERT FEED
        ============================================= */}
        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <EdgeFunctionLogs logs={data.edge_function_logs} />
            <AlertFeed
              alerts={data.alerts.recent}
              unresolvedCount={data.alerts.unresolved_count}
              onClear={handleClearAlerts}
            />
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-xs font-mono" style={{ color: "#333" }}>
            Dev Manager · Clinvia · Última atualização: {data ? formatTime(data.refreshed_at) : "—"}
          </p>
        </div>
      </div>

      {/* Settings Modal */}
      <DevManagerSettings
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        initialValues={configValues}
        onSaved={() => {
          loadConfig();
          fetchMetrics();
        }}
      />
    </div>
  );
}
