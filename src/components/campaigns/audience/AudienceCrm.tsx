import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { CRM_STAGES, TERMINAL_STAGES, STAGE_COLORS } from "@/types/crm-client";
import { normalizeClientStage } from "@/lib/clientStage";
import { AudienceSelection, AudienceEntry } from "../audienceTypes";

interface AudienceCrmProps {
    value: AudienceSelection;
    onChange: (sel: AudienceSelection) => void;
}

type ContactType = "contato" | "lead" | "cliente";

const TYPE_LABELS: Record<ContactType, string> = {
    contato: "Contato",
    lead: "Lead",
    cliente: "Cliente",
};

const DEFAULT_TYPES: Record<ContactType, boolean> = {
    contato: true,
    lead: true,
    cliente: true,
};

export function AudienceCrm({ value, onChange }: AudienceCrmProps) {
    const [stages, setStages] = useState<string[]>(
        value.config?.stages || (value.config?.stage ? [value.config.stage] : [])
    );
    const [from, setFrom] = useState<string>(value.config?.from || "");
    const [to, setTo] = useState<string>(value.config?.to || "");
    const [types, setTypes] = useState<Record<ContactType, boolean>>(
        value.config?.types || DEFAULT_TYPES
    );

    const toggleStage = (s: string) =>
        setStages((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

    const { data: entries } = useQuery({
        queryKey: ["audience-crm", stages, from, to, types],
        queryFn: async (): Promise<AudienceEntry[]> => {
            let query = supabase
                .from("crm_client" as any)
                .select("contact_id, stage, is_active, contact:contacts(client_stage)")
                .in("stage", stages);
            if (from) query = query.gte("stage_changed_at", new Date(from).toISOString());
            if (to) query = query.lte("stage_changed_at", new Date(to + "T23:59:59").toISOString());
            const { data, error } = await query;
            if (error) throw error;
            const seen = new Set<string>();
            const list: AudienceEntry[] = [];
            for (const r of (data || []) as any[]) {
                if (!r.contact_id || seen.has(r.contact_id)) continue;
                // Etapas terminais guardam cards inativos (histórico); nas demais, só ativos
                if (!TERMINAL_STAGES.includes(r.stage) && !r.is_active) continue;
                // Filtro por tipo de contato (switches)
                if (!types[normalizeClientStage(r.contact?.client_stage) as ContactType]) continue;
                seen.add(r.contact_id);
                list.push({ contactId: r.contact_id, vars: { etapa: r.stage || "" } });
            }
            return list;
        },
        enabled: stages.length > 0,
    });

    useEffect(() => {
        if (stages.length === 0) return;
        const list = entries || [];
        const sig = (e: AudienceEntry[]) => e.map((x) => x.contactId).join(",");
        const cfg = { stages, from, to, types };
        if (sig(list) === sig(value.entries) && JSON.stringify(value.config) === JSON.stringify(cfg)) return;
        onChange({ entries: list, invalidRows: [], config: cfg });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entries, stages, from, to, types]);

    return (
        <div className="space-y-3">
            <div>
                <p className="text-xs text-muted-foreground mb-1">Etapas do CRM * (selecione uma ou mais)</p>
                <div className="flex flex-wrap gap-1.5">
                    {CRM_STAGES.map((s) => {
                        const selected = stages.includes(s);
                        return (
                            <button
                                key={s}
                                type="button"
                                onClick={() => toggleStage(s)}
                                className={cn(
                                    "flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-colors",
                                    selected
                                        ? "border-primary bg-primary/10 text-foreground font-medium"
                                        : "border-border text-muted-foreground hover:bg-accent"
                                )}
                            >
                                <span
                                    className="w-1.5 h-1.5 rounded-full shrink-0"
                                    style={{ backgroundColor: STAGE_COLORS[s] }}
                                />
                                {s}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div>
                <p className="text-xs text-muted-foreground mb-1.5">Tipo de contato (incluir/excluir)</p>
                <div className="flex flex-wrap gap-4">
                    {(Object.keys(TYPE_LABELS) as ContactType[]).map((t) => (
                        <label key={t} className="flex items-center gap-2 cursor-pointer">
                            <Switch
                                checked={types[t]}
                                onCheckedChange={(checked) =>
                                    setTypes((prev) => ({ ...prev, [t]: checked }))
                                }
                            />
                            <span className="text-sm">{TYPE_LABELS[t]}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
                <div>
                    <p className="text-xs text-muted-foreground mb-1">Na etapa desde</p>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
                </div>
                <div>
                    <p className="text-xs text-muted-foreground mb-1">Até</p>
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
                </div>
            </div>
            {stages.length > 0 && (
                <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{entries?.length ?? "..."}</span> contatos encontrados
                </p>
            )}
        </div>
    );
}
