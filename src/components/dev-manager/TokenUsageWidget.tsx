// src/components/dev-manager/TokenUsageWidget.tsx
import React from "react";
import { Coins } from "lucide-react";

interface TenantToken {
  profile_id: string;
  company_name: string;
  total_tokens: number;
  total_cost: number;
}

interface TokenUsageWidgetProps {
  topTenants: TenantToken[];
  grandTotalTokens: number;
  grandTotalCost: number;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function TokenUsageWidget({ topTenants, grandTotalTokens, grandTotalCost }: TokenUsageWidgetProps) {
  const maxTokens = topTenants[0]?.total_tokens ?? 1;

  return (
    <div className="rounded-xl border p-4" style={{ background: "#111111", borderColor: "#2a2a2a" }}>
      <div className="flex items-center gap-2 mb-2">
        <Coins size={16} style={{ color: "#f97316" }} />
        <h3 className="text-sm font-medium" style={{ color: "#fff" }}>Consumo de Tokens IA</h3>
        <span className="ml-auto text-xs" style={{ color: "#555" }}>Últimas 24h</span>
      </div>
      <div className="flex gap-6 mb-4 p-3 rounded-lg" style={{ background: "#0a0a0a" }}>
        <div>
          <p className="text-xs mb-0.5" style={{ color: "#555" }}>Total de Tokens</p>
          <p className="text-xl font-mono font-bold" style={{ color: "#f97316" }}>{formatTokens(grandTotalTokens)}</p>
        </div>
        <div>
          <p className="text-xs mb-0.5" style={{ color: "#555" }}>Custo Total</p>
          <p className="text-xl font-mono font-bold" style={{ color: "#f97316" }}>${grandTotalCost.toFixed(3)}</p>
        </div>
      </div>
      <div className="space-y-2.5 max-h-60 overflow-y-auto">
        {topTenants.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: "#444" }}>Sem uso de tokens nas últimas 24h</p>
        ) : topTenants.map((t, i) => (
          <div key={t.profile_id}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-mono flex-shrink-0" style={{ color: "#444" }}>#{i + 1}</span>
                <span className="text-xs font-medium truncate" style={{ color: "#ccc" }}>{t.company_name}</span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 ml-2">
                <span className="text-xs font-mono" style={{ color: "#666" }}>${t.total_cost.toFixed(3)}</span>
                <span className="text-xs font-mono font-bold" style={{ color: "#f97316" }}>{formatTokens(t.total_tokens)}</span>
              </div>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: "#1a1a1a" }}>
              <div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${(t.total_tokens / maxTokens) * 100}%`, background: "linear-gradient(90deg, #f97316, #ea580c)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
