// src/components/dev-manager/MetricGauge.tsx
import React from "react";

interface MetricGaugeProps {
  label: string;
  value: number;
  unit?: string;
  warningAt?: number;
  dangerAt?: number;
  size?: number;
}

export function MetricGauge({
  label,
  value,
  unit = "%",
  warningAt = 80,
  dangerAt = 90,
  size = 120,
}: MetricGaugeProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (clamped / 100) * circumference;
  const warningOffset = circumference - (warningAt / 100) * circumference;

  const color =
    clamped >= dangerAt
      ? "#ef4444"
      : clamped >= warningAt
      ? "#eab308"
      : "#22c55e";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="rotate-[-90deg]">
          {/* Background ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth="10"
            stroke="#2a2a2a"
          />
          {/* Warning threshold indicator */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth="10"
            stroke="#eab30818"
            strokeDasharray={`${circumference - warningOffset} ${warningOffset}`}
            strokeDashoffset={0}
            strokeLinecap="round"
          />
          {/* Value arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth="10"
            stroke={color}
            strokeDasharray={circumference}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
            style={{
              transition: "stroke-dashoffset 0.6s ease, stroke 0.3s ease",
              filter: `drop-shadow(0 0 4px ${color}88)`,
            }}
          />
        </svg>

        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-mono font-bold text-xl leading-none"
            style={{ color: "#fff" }}
          >
            {clamped.toFixed(0)}
            {unit}
          </span>
        </div>
      </div>

      <p
        className="text-xs font-medium uppercase tracking-wider"
        style={{ color: "#888" }}
      >
        {label}
      </p>
    </div>
  );
}
