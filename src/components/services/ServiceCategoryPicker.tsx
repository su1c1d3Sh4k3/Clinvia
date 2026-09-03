import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { useOwnerId } from "@/hooks/useOwnerId";

interface ServiceRow {
    id: string;
    name: string;
    category_id: string | null;
}

interface ServiceCategoryPickerProps {
    /** Ids de services_client selecionados */
    value: string[];
    onChange: (ids: string[]) => void;
    /** Altura máxima da lista (classe Tailwind) */
    maxHeightClass?: string;
    emptyLabel?: string;
}

/**
 * Lista de serviços agrupada por categoria, com check na categoria inteira.
 * Usada no cadastro de convênios e na sala (serviços que a sala atende).
 */
export function ServiceCategoryPicker({
    value,
    onChange,
    maxHeightClass = "max-h-72",
    emptyLabel = "Nenhum serviço ativo cadastrado.",
}: ServiceCategoryPickerProps) {
    const { data: ownerId } = useOwnerId();
    const [expanded, setExpanded] = useState<string[]>([]);

    const { data, isLoading } = useQuery({
        queryKey: ["service-category-picker", ownerId],
        queryFn: async () => {
            const [{ data: services, error: svcErr }, { data: cats, error: catErr }] = await Promise.all([
                supabase.from("services_client")
                    .select("id, name, category_id")
                    .eq("user_id", ownerId)
                    .eq("status", true)
                    .order("name"),
                supabase.from("services_category").select("id, name"),
            ]);
            if (svcErr) throw svcErr;
            if (catErr) throw catErr;
            return { services: (services || []) as ServiceRow[], cats: cats || [] };
        },
        enabled: !!ownerId,
    });

    const groups = useMemo(() => {
        const byId = new Map((data?.cats || []).map((c: any) => [c.id, c.name]));
        const map = new Map<string, { id: string; name: string; items: ServiceRow[] }>();
        for (const svc of data?.services || []) {
            const key = svc.category_id || "sem-categoria";
            if (!map.has(key)) {
                map.set(key, { id: key, name: byId.get(svc.category_id as string) || "Sem categoria", items: [] });
            }
            map.get(key)!.items.push(svc);
        }
        return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    }, [data]);

    const selected = new Set(value);

    const toggleService = (id: string) => {
        onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);
    };

    const toggleCategory = (items: ServiceRow[], allSelected: boolean) => {
        const ids = items.map((i) => i.id);
        onChange(allSelected
            ? value.filter((v) => !ids.includes(v))
            : [...new Set([...value, ...ids])]);
    };

    if (isLoading) {
        return (
            <div className="border rounded-xl p-6 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className={`${maxHeightClass} overflow-y-auto border rounded-xl divide-y`}>
            {groups.length === 0 && <p className="text-sm text-muted-foreground p-3">{emptyLabel}</p>}
            {groups.map((cat) => {
                const isOpen = expanded.includes(cat.id);
                const selectedCount = cat.items.filter((s) => selected.has(s.id)).length;
                const allSelected = selectedCount === cat.items.length && cat.items.length > 0;
                return (
                    <div key={cat.id}>
                        <div className="w-full flex items-center gap-2 p-2.5 hover:bg-muted/40">
                            <Checkbox
                                checked={allSelected ? true : selectedCount > 0 ? "indeterminate" : false}
                                onCheckedChange={() => toggleCategory(cat.items, allSelected)}
                                aria-label={`Selecionar todos os serviços de ${cat.name}`}
                            />
                            <button
                                type="button"
                                onClick={() => setExpanded((prev) =>
                                    prev.includes(cat.id) ? prev.filter((id) => id !== cat.id) : [...prev, cat.id])}
                                className="flex items-center gap-2 flex-1 text-left"
                            >
                                <ChevronDown
                                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`}
                                />
                                <span className="text-sm font-medium flex-1">{cat.name}</span>
                                <span className="text-[10px] text-muted-foreground">
                                    {selectedCount > 0
                                        ? `${selectedCount} de ${cat.items.length}`
                                        : `${cat.items.length} serviço${cat.items.length === 1 ? "" : "s"}`}
                                </span>
                            </button>
                        </div>
                        {isOpen && (
                            <div className="divide-y border-t bg-muted/20">
                                {cat.items.map((svc) => (
                                    <label
                                        key={svc.id}
                                        className="flex items-center gap-3 p-2.5 pl-9 cursor-pointer hover:bg-muted/40"
                                    >
                                        <Checkbox
                                            checked={selected.has(svc.id)}
                                            onCheckedChange={() => toggleService(svc.id)}
                                        />
                                        <span className="text-sm flex-1">{svc.name}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
