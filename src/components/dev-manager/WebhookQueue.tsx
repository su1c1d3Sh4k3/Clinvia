// src/components/dev-manager/WebhookQueue.tsx
import React from "react";
import { CheckCircle, Clock, XCircle, Zap } from "lucide-react";

interface WebhookFailure {
  instance_name: string;
  event_type: string;
  error_message: string;
  created_at: string;
}

interface WebhookQueueProps {
  pending: number;
  processing: number;
  failed: number;
  recentFailures: WebhookFailure[];
  status: "ok" | "warning" | "error";
}

export function WebhookQueue({ pending, processing, failed, recentFailures, status }: WebhookQueueProps) {
  const statusColor = { ok: "#22c55e", warning: "#eab308", error: "#ef4444" }[status];

  const stats = [
    { label: "Pendentes", value: pending, color: "#eab308", icon: <Clock size={12} /> },
    { label: "Processando", value: processing, color: "#f97316", icon: <Zap size={12} /> },
    { label: "Falhas", value: failed, color: "#ef4444", icon: <XCircle size={12} /> },
  ];

  return (
    <div className="rounded-xl border p-4" style={{ background: "#111111", borderColor: "#2a2a2a" }}>
      <div className="flex items-center gap-2 mb-4">
        <Zap size={16} style={{ color: statusColor }} />
        <h3 className="text-sm font-medium" style={{ color: "#fff" }}>Fila de Webhooks</h3>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {stats.map(s => (
          <div key={s.label} className="text-center p-2.5 rounded-lg" style={{ background: "#0a0a0a" }}>
            <div className="flex justify-center mb-1" style={{ color: s.color }}>{s.icon}</div>
            <p className="text-xl font-mono font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs mt-0.5" style={{ color: "#555" }}>{s.label}</p>
          </div>
        ))}
      </div>
      {recentFailures.length > 0 ? (
        <div>
          <p className="text-xs uppercase tracking-wider mb-2" style={{ color: "#555" }}>Falhas Recentes</p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {recentFailures.map((f, i) => (
              <div key={i} className="p-2 rounded" style={{ background: "#ef444410", border: "1px solid #ef444428" }}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-mono font-medium truncate" style={{ color: "#ef4444" }}>{f.instance_name}</span>
                  <span className="text-xs px-1 rounded flex-shrink-0" style={{ background: "#1a1a1a", color: "#888" }}>{f.event_type}</span>
                </div>
                <p className="text-xs truncate" style={{ color: "#888" }}>{f.error_message}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 py-3 rounded-lg" style={{ background: "#22c55e0a", border: "1px solid #22c55e20" }}>
          <CheckCircle size={14} style={{ color: "#22c55e" }} />
          <p className="text-xs" style={{ color: "#22c55e" }}>Fila saudável — sem falhas</p>
        </div>
      )}
    </div>
  );
}
