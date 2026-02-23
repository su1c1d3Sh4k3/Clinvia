// src/components/dev-manager/TicketAlerts.tsx
import React, { useState } from "react";
import { AlertCircle, ChevronRight, Clock, MessageSquare, Send, Ticket, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TicketItem {
  id: string;
  title: string;
  priority: string;
  status: string;
  created_at: string;
  company_name: string;
  creator_name?: string;
  description?: string;
  client_summary?: string;
  support_response?: string | null;
}

interface TicketAlertsProps {
  allTickets: TicketItem[];
  openTotal: number;
  urgentTotal: number;
}

const PRIORITY_CONFIG = {
  urgent: { color: "#ef4444", bg: "#ef444420", label: "URGENTE" },
  high: { color: "#f97316", bg: "#f9731620", label: "ALTA" },
  medium: { color: "#eab308", bg: "#eab30820", label: "MÉDIA" },
  low: { color: "#22c55e", bg: "#22c55e20", label: "BAIXA" },
};

const STATUS_OPTIONS = [
  { value: "open", label: "Aberto" },
  { value: "viewed", label: "Visualizado" },
  { value: "in_progress", label: "Em Atendimento" },
  { value: "resolved", label: "Concluído" },
];

const STATUS_COLOR: Record<string, string> = {
  open: "#f97316",
  viewed: "#eab308",
  in_progress: "#3b82f6",
  resolved: "#22c55e",
};

export function TicketAlerts({ allTickets, openTotal, urgentTotal }: TicketAlertsProps) {
  const [expandedTicket, setExpandedTicket] = useState<TicketItem | null>(null);
  const [replyText, setReplyText] = useState("");
  const [newStatus, setNewStatus] = useState("open");
  const [saving, setSaving] = useState(false);

  const getAge = (date: string) => {
    const hours = Math.floor((Date.now() - new Date(date).getTime()) / 3_600_000);
    if (hours < 1) return "<1h";
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  const sorted = [...allTickets].sort((a, b) => {
    const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
    return (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
  });

  const openTicket = (ticket: TicketItem) => {
    setExpandedTicket(ticket);
    setReplyText(ticket.support_response ?? "");
    setNewStatus(ticket.status);
  };

  const closeModal = () => setExpandedTicket(null);

  const handleSave = async () => {
    if (!expandedTicket) return;
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      if (replyText.trim()) {
        updates.support_response = replyText.trim();
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("support_tickets")
        .update(updates)
        .eq("id", expandedTicket.id);

      if (error) throw error;

      toast.success("Ticket atualizado com sucesso");
      closeModal();
    } catch (err) {
      toast.error(`Erro ao atualizar ticket: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* ── Ticket List Card ── */}
      <div className="rounded-xl border p-4" style={{ background: "#111111", borderColor: "#2a2a2a" }}>
        <div className="flex items-center gap-2 mb-4">
          <Ticket size={16} style={{ color: urgentTotal > 0 ? "#ef4444" : "#f97316" }} />
          <h3 className="text-sm font-medium" style={{ color: "#fff" }}>Monitor de Tickets</h3>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs font-mono" style={{ color: "#666" }}>{openTotal} abertos</span>
            {urgentTotal > 0 && (
              <span
                className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                style={{ background: "#ef444420", color: "#ef4444" }}
              >
                <AlertCircle size={10} />
                {urgentTotal} urgentes
              </span>
            )}
          </div>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {sorted.length === 0 ? (
            <div className="text-center py-8">
              <Ticket size={24} className="mx-auto mb-2" style={{ color: "#22c55e" }} />
              <p className="text-sm" style={{ color: "#555" }}>Nenhum ticket aberto</p>
            </div>
          ) : (
            sorted.map((ticket) => {
              const pc = PRIORITY_CONFIG[ticket.priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.low;
              const statusColor = STATUS_COLOR[ticket.status] ?? "#888";
              const statusLabel = STATUS_OPTIONS.find((s) => s.value === ticket.status)?.label ?? ticket.status;

              return (
                <div
                  key={ticket.id}
                  className="flex items-start gap-2 p-3 rounded-lg"
                  style={{
                    background: "#0a0a0a",
                    border: `1px solid ${ticket.priority === "urgent" ? "#ef444430" : "#1a1a1a"}`,
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span
                        className="px-1.5 py-0.5 text-xs rounded font-mono font-medium flex-shrink-0"
                        style={{ background: pc.bg, color: pc.color }}
                      >
                        {pc.label}
                      </span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: "#1a1a1a", color: statusColor }}
                      >
                        {statusLabel}
                      </span>
                      <p className="text-xs font-medium truncate" style={{ color: "#fff" }}>
                        {ticket.title}
                      </p>
                    </div>
                    <p className="text-xs" style={{ color: "#555" }}>
                      {ticket.company_name}
                      {ticket.creator_name ? ` · ${ticket.creator_name}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="flex items-center gap-1 text-xs font-mono" style={{ color: "#555" }}>
                      <Clock size={10} />
                      {getAge(ticket.created_at)}
                    </span>
                    <button
                      onClick={() => openTicket(ticket)}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-all"
                      style={{ background: "#1a1a1a", color: "#888", border: "1px solid #2a2a2a" }}
                    >
                      <ChevronRight size={10} />
                      Ver
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Ticket Detail Modal ── */}
      {expandedTicket && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div
            className="w-full max-w-lg rounded-2xl p-6 overflow-y-auto"
            style={{ background: "#111111", border: "1px solid #2a2a2a", maxHeight: "90vh" }}
          >
            {/* Modal header */}
            <div className="flex items-start gap-3 mb-5">
              <div className="flex-1 min-w-0">
                {(() => {
                  const pc =
                    PRIORITY_CONFIG[expandedTicket.priority as keyof typeof PRIORITY_CONFIG] ??
                    PRIORITY_CONFIG.low;
                  return (
                    <span
                      className="inline-block px-1.5 py-0.5 text-xs rounded font-mono font-medium mb-1"
                      style={{ background: pc.bg, color: pc.color }}
                    >
                      {pc.label}
                    </span>
                  );
                })()}
                <h2 className="text-sm font-semibold" style={{ color: "#fff" }}>
                  {expandedTicket.title}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "#555" }}>
                  {expandedTicket.company_name}
                  {expandedTicket.creator_name ? ` · ${expandedTicket.creator_name}` : ""}
                  {" · "}
                  {new Date(expandedTicket.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg flex-shrink-0"
                style={{ color: "#555", background: "#1a1a1a" }}
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Descrição técnica */}
              {expandedTicket.description && (
                <div>
                  <p
                    className="text-xs font-medium mb-1.5 uppercase tracking-wider"
                    style={{ color: "#555" }}
                  >
                    Descrição Técnica
                  </p>
                  <p
                    className="text-xs p-3 rounded-lg whitespace-pre-wrap"
                    style={{ background: "#0a0a0a", color: "#ccc", border: "1px solid #1a1a1a" }}
                  >
                    {expandedTicket.description}
                  </p>
                </div>
              )}

              {/* Relato do cliente */}
              {expandedTicket.client_summary && (
                <div>
                  <p
                    className="text-xs font-medium mb-1.5 uppercase tracking-wider"
                    style={{ color: "#555" }}
                  >
                    Relato do Cliente
                  </p>
                  <p
                    className="text-xs p-3 rounded-lg whitespace-pre-wrap"
                    style={{ background: "#0a0a0a", color: "#aaa", border: "1px solid #1a1a1a" }}
                  >
                    {expandedTicket.client_summary}
                  </p>
                </div>
              )}

              {/* Alterar status */}
              <div>
                <p
                  className="text-xs font-medium mb-1.5 uppercase tracking-wider"
                  style={{ color: "#555" }}
                >
                  Status do Ticket
                </p>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#fff" }}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Resposta / nota */}
              <div>
                <p
                  className="text-xs font-medium mb-1.5 uppercase tracking-wider flex items-center gap-1.5"
                  style={{ color: "#555" }}
                >
                  <MessageSquare size={11} />
                  Resposta para o Cliente
                </p>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Escreva sua resposta ou nota interna..."
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#fff" }}
                  onFocus={(e) => (e.target.style.borderColor = "#f97316")}
                  onBlur={(e) => (e.target.style.borderColor = "#2a2a2a")}
                />
              </div>
            </div>

            {/* Ações */}
            <div className="flex gap-3 mt-5">
              <button
                onClick={closeModal}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium"
                style={{ background: "#1a1a1a", color: "#777", border: "1px solid #2a2a2a" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                style={{ background: saving ? "#7c3100" : "#f97316", color: "#fff", opacity: saving ? 0.8 : 1 }}
              >
                <Send size={14} />
                {saving ? "Salvando..." : "Salvar Resposta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
