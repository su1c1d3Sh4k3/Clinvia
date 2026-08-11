import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ServiceCategory, ServiceName } from "@/types/services";

export interface CascadeApplication {
    id: string; // services_client.id (ou template service_applications.id como fallback)
    name: string;
    price: number;
    min_price: number;
}

interface ServiceCascadePickerProps {
    /** Chamado ao clicar em Adicionar. `quantity` só quando showQuantity=true (senão 1). */
    onAdd: (app: CascadeApplication, quantity: number) => void;
    /** Exibe campo de quantidade ao lado do botão Adicionar */
    showQuantity?: boolean;
    disabled?: boolean;
}

/** Cascata Categoria → Procedimento → Aplicação (services_category → service_name → services_client). */
export function ServiceCascadePicker({ onAdd, showQuantity, disabled }: ServiceCascadePickerProps) {
    const [selCategoryId, setSelCategoryId] = useState("");
    const [selServiceNameId, setSelServiceNameId] = useState("");
    const [selApplicationId, setSelApplicationId] = useState("");
    const [quantity, setQuantity] = useState(1);

    const { data: categories } = useQuery({
        queryKey: ["services-categories"],
        queryFn: async () => {
            const { data, error } = await supabase.from("services_category" as any).select("*").order("name");
            if (error) throw error;
            return data as unknown as ServiceCategory[];
        },
    });

    const { data: serviceNames } = useQuery({
        queryKey: ["service-names", selCategoryId],
        enabled: !!selCategoryId,
        queryFn: async () => {
            const { data, error } = await supabase.from("service_name" as any).select("*").eq("category_id", selCategoryId).order("name");
            if (error) throw error;
            return data as unknown as ServiceName[];
        },
    });

    const { data: applications } = useQuery({
        queryKey: ["deal-applications", selServiceNameId],
        enabled: !!selServiceNameId,
        queryFn: async (): Promise<CascadeApplication[]> => {
            const { data: clientApps } = await supabase
                .from("services_client" as any).select("*")
                .eq("service_name_id", selServiceNameId).eq("status", true).order("name");
            if (clientApps && clientApps.length > 0) {
                return (clientApps as any[]).map((a) => ({ id: a.id, name: a.name, price: a.price, min_price: a.min_price ?? 0 }));
            }
            const { data: tpl, error } = await supabase
                .from("service_applications" as any).select("*")
                .eq("service_name_id", selServiceNameId).order("name");
            if (error) throw error;
            return ((tpl || []) as any[]).map((a) => ({ id: a.id, name: a.name, price: a.default_price, min_price: a.default_min_price ?? 0 }));
        },
    });

    const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
    const nativeSelectClass = "h-8 text-xs w-full rounded-md border border-input bg-background px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

    const handleAdd = () => {
        if (!selApplicationId || !applications) return;
        const app = applications.find((a) => a.id === selApplicationId);
        if (!app) return;
        onAdd(app, showQuantity ? Math.max(1, quantity) : 1);
        setSelApplicationId("");
        setQuantity(1);
    };

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                    <Label className="text-[11px]">Categoria</Label>
                    <select
                        className={nativeSelectClass}
                        value={selCategoryId}
                        disabled={disabled}
                        onChange={(e) => { setSelCategoryId(e.target.value); setSelServiceNameId(""); setSelApplicationId(""); }}
                    >
                        <option value="">Selecione...</option>
                        {(categories || []).map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <Label className="text-[11px]">Procedimento</Label>
                    <select
                        className={nativeSelectClass}
                        value={selServiceNameId}
                        onChange={(e) => { setSelServiceNameId(e.target.value); setSelApplicationId(""); }}
                        disabled={disabled || !selCategoryId}
                    >
                        <option value="">Selecione...</option>
                        {(serviceNames || []).map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <Label className="text-[11px]">Aplicação</Label>
                    <select
                        className={nativeSelectClass}
                        value={selApplicationId}
                        onChange={(e) => setSelApplicationId(e.target.value)}
                        disabled={disabled || !selServiceNameId}
                    >
                        <option value="">Selecione...</option>
                        {(applications || []).map((a) => (
                            <option key={a.id} value={a.id}>{a.name} — {fmt(a.price)}</option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="flex items-end gap-2">
                {showQuantity && (
                    <div className="w-24">
                        <Label className="text-[11px]">Quantidade</Label>
                        <Input
                            type="number"
                            min={1}
                            value={quantity}
                            onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                            className="h-8 text-xs"
                            disabled={disabled}
                        />
                    </div>
                )}
                <Button type="button" size="sm" variant="outline" className="gap-1 text-xs" onClick={handleAdd} disabled={disabled || !selApplicationId}>
                    <Plus className="w-3 h-3" /> Adicionar
                </Button>
            </div>
        </div>
    );
}
