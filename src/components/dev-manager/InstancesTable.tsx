// src/components/dev-manager/InstancesTable.tsx
import React, { useState } from "react";
import { Instagram, Wifi, WifiOff } from "lucide-react";

interface WAInstance {
  id: string;
  name: string;
  instance_name: string;
  status: string;
  company_name: string;
}

interface IGInstance {
  id: string;
  account_name: string;
  status: string;
  token_expires_at: string | null;
  company_name: string;
}

interface InstancesTableProps {
  waDisconnected: WAInstance[];
  igDisconnected: IGInstance[];
  waTotal: number;
  igTotal: number;
}

export function InstancesTable({ waDisconnected, igDisconnected, waTotal, igTotal }: InstancesTableProps) {
  const [tab, setTab] = useState<"wa" | "ig">("wa");

  const formatExpiry = (date: string | null) => {
    if (!date) return "Sem data de expiração";
    const d = new Date(date);
    const now = new Date();
    const diff = d.getTime() - now.getTime();
    if (diff < 0) return "EXPIRADO";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "Expira hoje";
    if (days <= 7) return `Expira em ${days}d ⚠`;
    return `Expira em ${days}d`;
  };

  return (
    <div className="rounded-xl border p-4" style={{ background: "#111111", borderColor: "#2a2a2a" }}>
      <div className="flex items-center gap-2 mb-4">
        <WifiOff size={16} style={{ color: "#ef4444" }} />
        <h3 className="text-sm font-medium" style={{ color: "#fff" }}>Instâncias Desconectadas</h3>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setTab("wa")}
            className="px-3 py-1 text-xs rounded-lg font-medium transition-all"
            style={{ background: tab === "wa" ? "#f97316" : "#1a1a1a", color: tab === "wa" ? "#fff" : "#888", border: `1px solid ${tab === "wa" ? "#f97316" : "#2a2a2a"}` }}
          >
            WhatsApp ({waDisconnected.length}/{waTotal})
          </button>
          <button
            onClick={() => setTab("ig")}
            className="px-3 py-1 text-xs rounded-lg font-medium transition-all"
            style={{ background: tab === "ig" ? "#f97316" : "#1a1a1a", color: tab === "ig" ? "#fff" : "#888", border: `1px solid ${tab === "ig" ? "#f97316" : "#2a2a2a"}` }}
          >
            Instagram ({igDisconnected.length}/{igTotal})
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {tab === "wa" && (waDisconnected.length === 0 ? (
          <div className="text-center py-8">
            <Wifi size={24} className="mx-auto mb-2" style={{ color: "#22c55e" }} />
            <p className="text-sm" style={{ color: "#555" }}>Todas as instâncias WhatsApp conectadas</p>
          </div>
        ) : waDisconnected.map(inst => (
          <div key={inst.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "#0a0a0a", border: "1px solid #1a1a1a" }}>
            <WifiOff size={14} style={{ color: "#ef4444", flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: "#fff" }}>{inst.name || inst.instance_name}</p>
              <p className="text-xs truncate" style={{ color: "#666" }}>{inst.company_name}</p>
            </div>
            <span className="px-2 py-0.5 text-xs rounded font-medium flex-shrink-0" style={{ background: "#ef444420", color: "#ef4444" }}>{inst.status}</span>
          </div>
        )))}

        {tab === "ig" && (igDisconnected.length === 0 ? (
          <div className="text-center py-8">
            <Instagram size={24} className="mx-auto mb-2" style={{ color: "#22c55e" }} />
            <p className="text-sm" style={{ color: "#555" }}>Todas as instâncias Instagram conectadas</p>
          </div>
        ) : igDisconnected.map(inst => {
          const expiry = formatExpiry(inst.token_expires_at);
          const isExpired = expiry === "EXPIRADO";
          const isWarning = expiry.includes("⚠");
          const color = isExpired ? "#ef4444" : isWarning ? "#eab308" : "#f97316";
          return (
            <div key={inst.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "#0a0a0a", border: `1px solid ${isExpired ? "#ef444430" : "#1a1a1a"}` }}>
              <Instagram size={14} style={{ color, flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "#fff" }}>{inst.account_name}</p>
                <p className="text-xs truncate" style={{ color: "#666" }}>{inst.company_name}</p>
              </div>
              <span className="px-2 py-0.5 text-xs rounded font-medium flex-shrink-0" style={{ background: `${color}20`, color }}>{expiry}</span>
            </div>
          );
        }))}
      </div>
    </div>
  );
}
