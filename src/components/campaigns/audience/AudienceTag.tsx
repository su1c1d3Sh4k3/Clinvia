import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AudienceSelection, AudienceEntry } from "../audienceTypes";

interface AudienceTagProps {
    value: AudienceSelection;
    onChange: (sel: AudienceSelection) => void;
    onLoadingChange?: (loading: boolean) => void;
}

export function AudienceTag({ value, onChange, onLoadingChange }: AudienceTagProps) {
    const [tagId, setTagId] = useState<string>(value.config?.tag_id || "");

    const { data: tags } = useQuery({
        queryKey: ["audience-tags"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tags")
                .select("id, name, color")
                .eq("is_active", true)
                .order("name");
            if (error) throw error;
            return data || [];
        },
    });

    const { data: entries, isLoading } = useQuery({
        queryKey: ["audience-tag-contacts", tagId],
        queryFn: async (): Promise<AudienceEntry[]> => {
            // Paginação: PostgREST corta em 1000 linhas por requisição
            const PAGE = 1000;
            const rows: { contact_id: string | null }[] = [];
            for (let off = 0; off < 20000; off += PAGE) {
                const { data, error } = await supabase
                    .from("contact_tags")
                    .select("contact_id")
                    .eq("tag_id", tagId)
                    .order("contact_id", { ascending: true })
                    .range(off, off + PAGE - 1);
                if (error) throw error;
                rows.push(...(data || []));
                if ((data || []).length < PAGE) break;
            }
            const ids = [...new Set(rows.map((r) => r.contact_id).filter(Boolean))] as string[];
            return ids.map((id) => ({ contactId: id, vars: {} }));
        },
        enabled: !!tagId,
    });

    // Informa o wizard que a audiência está carregando (bloqueia o "Próximo")
    useEffect(() => {
        onLoadingChange?.(!!tagId && isLoading);
        return () => onLoadingChange?.(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, tagId]);

    useEffect(() => {
        // undefined = query em andamento; não sobrescrever com lista vazia
        if (!tagId || entries === undefined) return;
        const list = entries;
        const sig = (e: AudienceEntry[]) => e.map((x) => x.contactId).join(",");
        if (sig(list) === sig(value.entries) && value.config?.tag_id === tagId) return;
        onChange({ entries: list, invalidRows: [], config: { tag_id: tagId } });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entries, tagId]);

    return (
        <div className="space-y-3">
            <div>
                <p className="text-xs text-muted-foreground mb-1">Etiqueta *</p>
                <Select value={tagId} onValueChange={setTagId}>
                    <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecione a etiqueta" />
                    </SelectTrigger>
                    <SelectContent>
                        {(tags || []).map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                                <span className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                                    {t.name}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            {tagId && (
                <p className="text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{entries?.length ?? "..."}</span> contatos encontrados
                </p>
            )}
        </div>
    );
}
