// src/components/dev-manager/EdgeFunctionLogs.tsx
import React from "react";
import { CheckCircle, Terminal, XCircle } from "lucide-react";

interface EdgeLog {
  id: string;
  timestamp: string;
  function_name: string;
  status: number;
  duration_ms: number;
  event_message?: string;
}

interface EdgeFunctionLogsProps {
  logs: EdgeLog[];
}

function getStatusColor(status: number): string {
  if (status >= 500) return "#ef4444";
  if (status >= 400) return "#eab308";
  if (status >= 200 && status < 300) return "#22c55e";
  return "#888";
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return ts; }
}

export function EdgeFunctionLogs({ logs }: EdgeFunctionLogsProps) {
  // Exibe apenas logs de erro (status >= 400)
  const errorLogs = logs.filter(log => log.status >= 400);

  return (
    <div className="rounded-xl border p-4" style={{ background: "#111111", borderColor: "#2a2a2a" }}>
      <div className="flex items-center gap-2 mb-4">
        <Terminal size={16} style={{ color: "#f97316" }} />
        <h3 className="text-sm font-medium" style={{ color: "#fff" }}>Logs de Edge Functions</h3>
        <span className="ml-auto text-xs" style={{ color: "#555" }}>Somente erros · 24h</span>
      </div>
      <div className="space-y-1 max-h-72 overflow-y-auto font-mono">
        {logs.length === 0 ? (
          <div className="text-center py-8">
            <Terminal size={20} className="mx-auto mb-3" style={{ color: "#333" }} />
            <p className="text-xs" style={{ color: "#444" }}>
              Sem logs — configure o secret{" "}
              <span style={{ color: "#f97316" }}>MGMT_API_TOKEN</span>{" "}
              no painel do Supabase para habilitar
            </p>
          </div>
        ) : errorLogs.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle size={20} className="mx-auto mb-3" style={{ color: "#22c55e" }} />
            <p className="text-xs" style={{ color: "#555" }}>Sem erros nas últimas 24h ✓</p>
          </div>
        ) : errorLogs.map((log, i) => {
          const statusColor = getStatusColor(log.status);
          const isError = log.status >= 400;
          return (
            <div key={log.id ?? i} className="flex items-start gap-2 p-2 rounded text-xs" style={{ background: isError ? "#ef444408" : "#0a0a0a", border: `1px solid ${isError ? "#ef444425" : "#151515"}` }}>
              {isError
                ? <XCircle size={10} style={{ color: "#ef4444", marginTop: 2, flexShrink: 0 }} />
                : <CheckCircle size={10} style={{ color: "#22c55e", marginTop: 2, flexShrink: 0 }} />
              }
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span style={{ color: "#444" }}>{formatTimestamp(log.timestamp)}</span>
                  <span className="font-medium truncate" style={{ color: "#bbb" }}>{log.function_name || "desconhecido"}</span>
                  <span className="px-1 rounded flex-shrink-0" style={{ background: `${statusColor}20`, color: statusColor }}>{log.status}</span>
                  {log.duration_ms > 0 && <span style={{ color: "#444" }}>{log.duration_ms}ms</span>}
                </div>
                {isError && log.event_message && (
                  <p className="mt-0.5 text-xs truncate" style={{ color: "#ef4444" }}>{log.event_message}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
