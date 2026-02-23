// src/components/dev-manager/DevManagerSettings.tsx
import React, { useState } from "react";
import { Save, Settings, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ConfigValues {
  portainer_url: string;
  n8n_url: string;
  admin_wa_number: string;
  cpu_threshold: string;
  memory_threshold: string;
  n8n_error_threshold: string;
}

interface DevManagerSettingsProps {
  open: boolean;
  onClose: () => void;
  initialValues: ConfigValues;
  onSaved: () => void;
}

const FIELDS: Array<{ key: keyof ConfigValues; label: string; placeholder: string; type?: string; hint?: string }> = [
  { key: "portainer_url", label: "URL do Portainer", placeholder: "https://painel.clinvia.com.br/", hint: "URL do painel de monitoramento de containers" },
  { key: "n8n_url", label: "URL do n8n", placeholder: "https://workflows.clinvia.com.br/", hint: "URL da plataforma de automação de workflows" },
  { key: "admin_wa_number", label: "WhatsApp do Administrador", placeholder: "5511999999999", hint: "Usado para notificações de alertas críticos" },
  { key: "cpu_threshold", label: "Limite de Alerta de CPU (%)", placeholder: "80", type: "number", hint: "Alerta quando CPU do container ultrapassar este valor" },
  { key: "memory_threshold", label: "Limite de Alerta de Memória (%)", placeholder: "85", type: "number", hint: "Alerta quando memória do container ultrapassar este valor" },
  { key: "n8n_error_threshold", label: "Limite de Erros no n8n", placeholder: "5", type: "number", hint: "Alerta quando execuções com falha ultrapassarem este valor" },
];

export function DevManagerSettings({ open, onClose, initialValues, onSaved }: DevManagerSettingsProps) {
  const [values, setValues] = useState<ConfigValues>(initialValues);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [key, value] of Object.entries(values)) {
        const { error } = await supabase.from("system_config").upsert(
          { key, value, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
        if (error) throw error;
      }
      toast.success("Configurações salvas com sucesso");
      onSaved();
      onClose();
    } catch (err) {
      toast.error("Falha ao salvar configurações");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-2xl p-6 overflow-y-auto" style={{ background: "#111111", border: "1px solid #2a2a2a", maxHeight: "90vh" }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg" style={{ background: "#f9731620" }}>
            <Settings size={18} style={{ color: "#f97316" }} />
          </div>
          <div>
            <h2 className="text-base font-semibold" style={{ color: "#fff" }}>Configurações do Dev Manager</h2>
            <p className="text-xs" style={{ color: "#555" }}>Armazenado na tabela system_config</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg" style={{ color: "#555", background: "#1a1a1a" }}>
            <X size={16} />
          </button>
        </div>
        <div className="space-y-4">
          {FIELDS.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-medium mb-1" style={{ color: "#888" }}>{f.label}</label>
              <input
                type={f.type ?? "text"}
                value={values[f.key]}
                onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-all"
                style={{ background: "#0a0a0a", border: "1px solid #2a2a2a", color: "#fff" }}
                onFocus={e => (e.target.style.borderColor = "#f97316")}
                onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
              />
              {f.hint && <p className="text-xs mt-1" style={{ color: "#444" }}>{f.hint}</p>}
            </div>
          ))}
        </div>
        <div className="mt-5 p-3 rounded-lg" style={{ background: "#0a0a0a", border: "1px solid #1a1a1a" }}>
          <p className="text-xs" style={{ color: "#555" }}>
            <span style={{ color: "#f97316" }}>⚠ Segurança:</span> Tokens de API (N8N_API_KEY, PORTAINER_TOKEN, CRON_SECRET) devem ser configurados como{" "}
            <strong style={{ color: "#888" }}>secrets de Edge Functions no Supabase</strong> — nunca armazenados aqui.
          </p>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: "#1a1a1a", color: "#777", border: "1px solid #2a2a2a" }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2" style={{ background: saving ? "#7c3100" : "#f97316", color: "#fff", opacity: saving ? 0.8 : 1 }}>
            <Save size={14} />
            {saving ? "Salvando..." : "Salvar Configurações"}
          </button>
        </div>
      </div>
    </div>
  );
}
