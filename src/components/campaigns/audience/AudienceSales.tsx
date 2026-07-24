import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { AudienceSelection, AudienceEntry } from "../audienceTypes";

interface AudienceSalesProps {
    value: AudienceSelection;
    onChange: (sel: AudienceSelection) => void;
}

export function AudienceSales({ value, onChange }: AudienceSalesProps) {
    const [from, setFrom] = useState<string>(value.config?.from || "");
    const [to, setTo] = useState<string>(value.config?.to || "");

    // 1 entrada POR VENDA — o mesmo contato pode receber várias mensagens
    const { data: entries } = useQuery({
        queryKey: ["audience-sales", from, to],
        queryFn: async (): Promise<AudienceEntry[]> => {
            let query = supabase
                .from("sales" as any)
                .select("contact_id, sale_date, product_name, total_amount")
                .not("contact_id", "is", null)
                .order("sale_date", { ascending: true })
                .limit(10000);
            if (from) query = query.gte("sale_date", from);
            if (to) query = query.lte("sale_date", to);
            const { data, error } = await query;
            if (error) throw error;
            return ((data || []) as any[]).map((r) => ({
                contactId: r.contact_id,
                vars: {
                    data_venda: r.sale_date ? new Date(r.sale_date + "T12:00:00").toLocaleDateString("pt-BR") : "",
                    servico_vendido: r.product_name || "",
                    valor_venda: r.total_amount != null ? formatCurrency(Number(r.total_amount)) : "",
                },
            }));
        },
    });

    useEffect(() => {
        const list = entries || [];
        const sig = (e: AudienceEntry[]) => e.map((x) => x.contactId + x.vars.data_venda + x.vars.valor_venda).join(",");
        if (sig(list) === sig(value.entries)) return;
        onChange({ entries: list, invalidRows: [], config: { from, to } });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entries]);

    const uniqueContacts = new Set((entries || []).map((e) => e.contactId)).size;

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
                <span className="font-semibold text-foreground">{entries?.length ?? "..."}</span> vendas
                {entries != null && uniqueContacts !== entries.length && (
                    <> de <span className="font-semibold text-foreground">{uniqueContacts}</span> contatos</>
                )}{" "}
                no período — cada venda gera uma mensagem
            </p>
        </div>
    );
}
