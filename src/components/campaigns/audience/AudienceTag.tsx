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
}

export function AudienceTag({ value, onChange }: AudienceTagProps) {
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

    const { data: entries } = useQuery({
        queryKey: ["audience-tag-contacts", tagId],
        queryFn: async (): Promise<AudienceEntry[]> => {
            const { data, error } = await supabase
                .from("contact_tags")
                .select("contact_id")
                .eq("tag_id", tagId);
            if (error) throw error;
            const ids = [...new Set((data || []).map((r) => r.contact_id).filter(Boolean))] as string[];
            return ids.map((id) => ({ contactId: id, vars: {} }));
        },
        enabled: !!tagId,
    });

    useEffect(() => {
        if (!tagId) return;
        const list = entries || [];
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
