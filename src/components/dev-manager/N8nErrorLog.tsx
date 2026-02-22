// src/components/dev-manager/N8nErrorLog.tsx
import React, { useState } from "react";
import { Activity, AlertCircle, CheckCircle, Clock, ExternalLink, Trash2 } from "lucide-react";

interface N8nError {
  id: string;
  workflowId: string;
  workflowName?: string | null;
  status: string;
  startedAt: string;
  stoppedAt: string;
}

interface N8nErrorLogProps {
  errors: N8nError[];
  failedCount: number;
  n8nUrl?: string;
  onClear?: () => Promise<void>;
}

function getDuration(start: string, stop: string): string {
  const ms = new Date(stop).getTime() - new Date(start).getTime();
  if (ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}min`;
}

function getRelativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "agora mesmo";
  if (mins < 60) return `há ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

export function N8nErrorLog({ errors, failedCount, n8nUrl, onClear }: N8nErrorLogProps) {
  const [clearing, setClearing] = useState(false);
  const executionsUrl = n8nUrl ? `${n8nUrl.replace(/\/$/, "")}/executions` : null;

  const handleClear = async () => {
    if (!onClear || clearing) return;
    setClearing(true);
    try { await onClear(); } finally { setClearing(false); }
  };

  return (
    <div className="rounded-xl border p-4" style={{ background: "#111111", borderColor: "#2a2a2a" }}>
      <div className="flex items-center gap-2 mb-4">
        <Activity size={16} style={{ color: failedCount > 0 ? "#ef4444" : "#f97316" }} />
        <h3 className="text-sm font-medium" style={{ color: "#fff" }}>Erros de Workflow n8n</h3>
        {failedCount > 0 && (
          <span
            className="px-2 py-0.5 text-xs rounded-full font-bold"
            style={{ background: "#ef4444", color: "#fff" }}
          >
            {failedCount}
          </span>
        )}
        <span className="text-xs" style={{ color: "#555" }}>Últimas 24h</span>
        <div className="ml-auto flex items-center gap-2">
          {onClear && (
            <button
              onClick={handleClear}
              disabled={clearing || errors.length === 0}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all"
              style={{
                background: errors.length === 0 ? "#1a1a1a" : "#ef444415",
                color: errors.length === 0 ? "#333" : "#ef4444",
                border: `1px solid ${errors.length === 0 ? "#2a2a2a" : "#ef444430"}`,
                cursor: errors.length === 0 ? "not-allowed" : "pointer",
                opacity: clearing ? 0.6 : 1,
              }}
              title="Limpar erros n8n"
            >
              <Trash2 size={10} />
              {clearing ? "Limpando..." : "Limpar"}
            </button>
          )}
          {executionsUrl && (
            <a
              href={executionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs transition-opacity hover:opacity-80"
              style={{ color: "#555" }}
            >
              <ExternalLink size={10} />
              Abrir n8n
            </a>
          )}
        </div>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {errors.length === 0 ? (
          <div className="text-center py-8">
            <CheckCircle size={24} className="mx-auto mb-2" style={{ color: failedCount > 0 ? "#eab308" : "#22c55e" }} />
            <p className="text-sm" style={{ color: "#555" }}>
              {failedCount > 0
                ? `${failedCount} erros detectados — clique em "Coletar" para atualizar`
                : "Nenhum erro de workflow recente"}
            </p>
            <p className="text-xs mt-1" style={{ color: "#444" }}>
              Os erros aparecem após a próxima coleta automática
            </p>
          </div>
        ) : (
          errors.map((err) => {
            const workflowExecUrl = n8nUrl
              ? `${n8nUrl.replace(/\/$/, "")}/workflow/${err.workflowId}/executions/${err.id}`
              : null;

            return (
              <div
                key={err.id}
                className="p-3 rounded-lg"
                style={{ background: "#0a0a0a", border: "1px solid #ef444425" }}
              >
                <div className="flex items-start gap-2">
                  <AlertCircle size={12} style={{ color: "#ef4444", marginTop: 2, flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-medium truncate" style={{ color: "#fff" }}>
                        {err.workflowName ?? `Workflow ${String(err.workflowId ?? "").slice(0, 8)}`}
                      </span>
                      <span
                        className="px-1.5 py-0.5 text-xs rounded font-mono flex-shrink-0"
                        style={{ background: "#ef444420", color: "#ef4444" }}
                      >
                        ERRO
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap" style={{ color: "#555" }}>
                      <span className="flex items-center gap-1 text-xs">
                        <Clock size={9} />
                        {err.startedAt ? getRelativeTime(err.startedAt) : "—"}
                      </span>
                      {err.startedAt && err.stoppedAt && (
                        <span className="text-xs" style={{ color: "#444" }}>
                          duração: {getDuration(err.startedAt, err.stoppedAt)}
                        </span>
                      )}
                      <span className="text-xs font-mono" style={{ color: "#333" }}>
                        #{String(err.id ?? "").slice(0, 8)}
                      </span>
                    </div>
                  </div>
                  {workflowExecUrl && (
                    <a
                      href={workflowExecUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 transition-opacity hover:opacity-80"
                      title="Ver execução no n8n"
                    >
                      <ExternalLink size={12} style={{ color: "#555" }} />
                    </a>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
