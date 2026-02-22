// src/components/dev-manager/LiveSessionActivity.tsx
import React, { useEffect, useRef } from "react";
import { Activity, MessageSquare, Users } from "lucide-react";

interface LiveSessionActivityProps {
  activeConversations: number;
  messagesLast5Min: number;
}

export function LiveSessionActivity({
  activeConversations,
  messagesLast5Min,
}: LiveSessionActivityProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<number[]>(Array(30).fill(0));

  useEffect(() => {
    historyRef.current = [...historyRef.current.slice(1), messagesLast5Min];
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const data = historyRef.current;
    const max = Math.max(...data, 1);
    const step = w / (data.length - 1);

    ctx.beginPath();
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#f97316";
    ctx.shadowBlur = 6;
    data.forEach((v, i) => {
      const x = i * step;
      const y = h - (v / max) * (h - 8) - 4;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, "rgba(249,115,22,0.3)");
    gradient.addColorStop(1, "rgba(249,115,22,0)");
    ctx.fillStyle = gradient;
    ctx.fill();
  }, [messagesLast5Min]);

  const msgPerMin = (messagesLast5Min / 5).toFixed(1);

  return (
    <div className="rounded-xl border p-4" style={{ background: "#111111", borderColor: "#2a2a2a" }}>
      <div className="flex items-center gap-2 mb-4">
        <Activity size={16} style={{ color: "#f97316" }} />
        <h3 className="text-sm font-medium" style={{ color: "#fff" }}>Atividade em Tempo Real</h3>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#22c55e" }} />
          <span className="text-xs font-mono font-medium" style={{ color: "#22c55e" }}>AO VIVO</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="text-center p-3 rounded-lg" style={{ background: "#0a0a0a" }}>
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Users size={12} style={{ color: "#f97316" }} />
            <p className="text-xs uppercase tracking-wider" style={{ color: "#666" }}>Conversas Ativas</p>
          </div>
          <p className="text-3xl font-mono font-bold" style={{ color: "#fff" }}>{activeConversations}</p>
        </div>
        <div className="text-center p-3 rounded-lg" style={{ background: "#0a0a0a" }}>
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <MessageSquare size={12} style={{ color: "#f97316" }} />
            <p className="text-xs uppercase tracking-wider" style={{ color: "#666" }}>Msgs / Min</p>
          </div>
          <p className="text-3xl font-mono font-bold" style={{ color: "#fff" }}>{msgPerMin}</p>
        </div>
      </div>
      <canvas ref={canvasRef} width={300} height={60} className="w-full rounded" style={{ background: "#0a0a0a" }} />
      <p className="text-xs mt-2 text-center" style={{ color: "#444" }}>Pulso de mensagens — janela dos últimos 5 min</p>
    </div>
  );
}
