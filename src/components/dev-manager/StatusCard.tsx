// src/components/dev-manager/StatusCard.tsx
import React from "react";

interface StatusCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  trend?: string;
  status: "ok" | "warning" | "error" | "info";
  subtitle?: string;
  onClick?: () => void;
}

export function StatusCard({
  icon,
  label,
  value,
  trend,
  status,
  subtitle,
  onClick,
}: StatusCardProps) {
  const statusColor = {
    ok: "#22c55e",
    warning: "#eab308",
    error: "#ef4444",
    info: "#f97316",
  }[status];

  return (
    <div
      onClick={onClick}
      className={`relative p-4 rounded-xl border transition-all duration-200 select-none ${
        onClick ? "cursor-pointer hover:scale-[1.01]" : ""
      }`}
      style={{ background: "#111111", borderColor: "#2a2a2a" }}
    >
      {/* Left accent bar */}
      <div
        className="absolute top-0 left-0 w-1 h-full rounded-l-xl"
        style={{ background: statusColor }}
      />

      <div className="flex items-start justify-between pl-2">
        <div className="flex-1 min-w-0">
          <p
            className="text-xs font-medium uppercase tracking-wider mb-1"
            style={{ color: "#666" }}
          >
            {label}
          </p>
          <p className="text-2xl font-mono font-bold" style={{ color: "#fff" }}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs mt-1 truncate" style={{ color: "#888" }}>
              {subtitle}
            </p>
          )}
          {trend && (
            <p
              className="text-xs mt-1 font-medium"
              style={{ color: statusColor }}
            >
              {trend}
            </p>
          )}
        </div>

        <div
          className="ml-3 p-2 rounded-lg flex-shrink-0"
          style={{ background: `${statusColor}18`, color: statusColor }}
        >
          {icon}
        </div>
      </div>

      {/* Status dot */}
      <div
        className="absolute bottom-3 right-3 w-2 h-2 rounded-full"
        style={{
          background: statusColor,
          boxShadow: `0 0 6px ${statusColor}`,
        }}
      />
    </div>
  );
}
