import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CRM_STAGES } from "@/types/crm-client";
import { AudienceSelection } from "../audienceTypes";

interface AudienceCrmProps {
    value: AudienceSelection;
    onChange: (sel: AudienceSelection) => void;
}

export function AudienceCrm({ value, onChange }: AudienceCrmProps) {
    const [stage, setStage] = useState<string>(value.config?.stage || "");
    const [from, setFrom] = useState<string>(value.config?.from || "");
    const [to, setTo] = useState<string>(value.config?.to || "");

    const { data: contactIds } = useQuery({
        queryKey: ["audience-crm", stage, from, to],
        queryFn: async (): Promise<string[]> => {
            let query = supabase
                .from("crm_client" as any)
                .select("contact_id")
                .eq("is_active", true)
                .eq("stage", stage);
            if (from) query = query.gte("stage_changed_at", new Date(from).toISOString());
            if (to) query = query.lte("stage_changed_at", new Date(to + "T23:59:59").toISOString());
            const { data, error } = await query;
            if (error) throw error;
            return [...new Set(((data || []) as any[]).map((r) => r.contact_id).filter(Boolean))] as string[];
        },
        enabled: !!stage,
    });

    useEffect(() => {
        if (!stage) return;
        const ids = contactIds || [];
        if (ids.join(",") === value.contactIds.join(",") && value.config?.stage === stage) return;
        onChange({ contactIds: ids, invalidRows: [], config: { stage, from, to } });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contactIds, stage, from, to]);

    return (
        <div className="space-y-3">
            <div>
                <p className="text-xs text-muted-foreground mb-1">Etapa do CRM *</p>
                <Select value={stage} onValueChange={setStage}>
                    <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecione a etapa" />
                    </SelectTrigger>
                    <SelectContent>
                        {CRM_STAGES.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
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
            {stage && (
                <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{contactIds?.length ?? "..."}</span> contatos encontrados
                </p>
            )}
        </div>
    );
}
