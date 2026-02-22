// src/components/dev-manager/AlertFeed.tsx
import React, { useState } from "react";
import { AlertTriangle, Bell, CheckCircle, Info, Trash2, XCircle } from "lucide-react";

interface AlertItem {
  id: string;
  type: string;
  severity: string;
  message: string;
  created_at: string;
  metadata: Record<string, unknown>;
  resolved: boolean;
}

interface AlertFeedProps {
  alerts: AlertItem[];
  unresolvedCount: number;
  onClear?: () => Promise<void>;
}

const SEVERITY_CONFIG = {
  critical: { color: "#ef4444", bg: "#ef444412", border: "#ef444428", icon: <XCircle size={12} />, label: "CRÍTICO" },
  warning: { color: "#eab308", bg: "#eab30812", border: "#eab30828", icon: <AlertTriangle size={12} />, label: "ALERTA" },
  info: { color: "#f97316", bg: "#f9731612", border: "#f9731628", icon: <Info size={12} />, label: "INFO" },
};

function getRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

export function AlertFeed({ alerts, unresolvedCount, onClear }: AlertFeedProps) {
  const [clearing, setClearing] = useState(false);

  const handleClear = async () => {
    if (!onClear || clearing) return;
    setClearing(true);
    try { await onClear(); } finally { setClearing(false); }
  };

  return (
    <div className="rounded-xl border p-4" style={{ background: "#111111", borderColor: "#2a2a2a" }}>
      <div className="flex items-center gap-2 mb-4">
        <Bell size={16} style={{ color: unresolvedCount > 0 ? "#ef4444" : "#f97316" }} />
        <h3 className="text-sm font-medium" style={{ color: "#fff" }}>Feed de Alertas</h3>
        {unresolvedCount > 0 && (
          <span className="px-2 py-0.5 text-xs rounded-full font-bold" style={{ background: "#ef4444", color: "#fff" }}>{unresolvedCount}</span>
        )}
        <span className="text-xs" style={{ color: "#555" }}>Últimas 24h</span>
        {onClear && (
          <button
            onClick={handleClear}
            disabled={clearing || alerts.length === 0}
            className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-xs transition-all"
            style={{
              background: alerts.length === 0 ? "#1a1a1a" : "#ef444415",
              color: alerts.length === 0 ? "#333" : "#ef4444",
              border: `1px solid ${alerts.length === 0 ? "#2a2a2a" : "#ef444430"}`,
              cursor: alerts.length === 0 ? "not-allowed" : "pointer",
              opacity: clearing ? 0.6 : 1,
            }}
            title="Limpar todos os alertas"
          >
            <Trash2 size={10} />
            {clearing ? "Limpando..." : "Limpar"}
          </button>
        )}
      </div>
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle size={24} className="mx-auto mb-2" style={{ color: "#22c55e" }} />
            <p className="text-sm" style={{ color: "#555" }}>Sem alertas — sistema saudável</p>
          </div>
        ) : alerts.map(alert => {
          const sc = SEVERITY_CONFIG[alert.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.info;
          return (
            <div key={alert.id} className="flex items-start gap-3 p-3 rounded-lg transition-opacity" style={{ background: sc.bg, border: `1px solid ${sc.border}`, opacity: alert.resolved ? 0.45 : 1 }}>
              <div style={{ color: sc.color, marginTop: 1, flexShrink: 0 }}>{sc.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-xs font-mono font-medium uppercase" style={{ color: sc.color }}>{sc.label}</span>
                  <span className="text-xs px-1 rounded" style={{ background: "#1a1a1a", color: "#555" }}>{alert.type}</span>
                  {alert.resolved && <span className="text-xs" style={{ color: "#22c55e" }}>✓ resolvido</span>}
                </div>
                <p className="text-xs" style={{ color: "#ccc" }}>{alert.message}</p>
              </div>
              <span className="text-xs font-mono flex-shrink-0" style={{ color: "#444" }}>{getRelativeTime(alert.created_at)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
