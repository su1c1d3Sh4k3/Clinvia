import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { AudienceSelection } from "../audienceTypes";

interface AudienceSalesProps {
    value: AudienceSelection;
    onChange: (sel: AudienceSelection) => void;
}

export function AudienceSales({ value, onChange }: AudienceSalesProps) {
    const [from, setFrom] = useState<string>(value.config?.from || "");
    const [to, setTo] = useState<string>(value.config?.to || "");

    const { data: contactIds } = useQuery({
        queryKey: ["audience-sales", from, to],
        queryFn: async (): Promise<string[]> => {
            let query = supabase
                .from("sales" as any)
                .select("contact_id")
                .not("contact_id", "is", null)
                .limit(10000);
            if (from) query = query.gte("sale_date", from);
            if (to) query = query.lte("sale_date", to);
            const { data, error } = await query;
            if (error) throw error;
            return [...new Set(((data || []) as any[]).map((r) => r.contact_id))] as string[];
        },
    });

    useEffect(() => {
        const ids = contactIds || [];
        if (ids.join(",") === value.contactIds.join(",")) return;
        onChange({ contactIds: ids, invalidRows: [], config: { from, to } });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contactIds]);

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <p className="text-xs text-muted-foreground mb-1">Vendas de</p>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
                </div>
                <div>
                    <p className="text-xs text-muted-foreground mb-1">Até</p>
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
                </div>
            </div>
            <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{contactIds?.length ?? "..."}</span> contatos com vendas no período
            </p>
        </div>
    );
}
