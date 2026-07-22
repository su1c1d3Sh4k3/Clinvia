import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AudienceSelection } from "../audienceTypes";

const STATUS_OPTIONS = [
    { value: "all", label: "Todos os status" },
    { value: "pending", label: "Pendente" },
    { value: "confirmed", label: "Confirmado" },
    { value: "completed", label: "Concluído" },
    { value: "cancelled", label: "Cancelado" },
    { value: "rescheduled", label: "Reagendado" },
    { value: "no_show", label: "Não compareceu" },
];

interface AudienceAppointmentsProps {
    value: AudienceSelection;
    onChange: (sel: AudienceSelection) => void;
}

export function AudienceAppointments({ value, onChange }: AudienceAppointmentsProps) {
    const [professionalId, setProfessionalId] = useState<string>(value.config?.professional_id || "all");
    const [status, setStatus] = useState<string>(value.config?.status || "all");
    const [from, setFrom] = useState<string>(value.config?.from || "");
    const [to, setTo] = useState<string>(value.config?.to || "");

    const { data: professionals } = useQuery({
        queryKey: ["audience-professionals"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("professionals" as any)
                .select("id, name")
                .order("name");
            if (error) throw error;
            return (data || []) as any[];
        },
    });

    const { data: contactIds } = useQuery({
        queryKey: ["audience-appointments", professionalId, status, from, to],
        queryFn: async (): Promise<string[]> => {
            let query = supabase
                .from("appointments" as any)
                .select("contact_id")
                .eq("type", "appointment")
                .not("contact_id", "is", null)
                .limit(10000);
            if (professionalId !== "all") query = query.eq("professional_id", professionalId);
            if (status !== "all") query = query.eq("status", status);
            if (from) query = query.gte("start_time", new Date(from).toISOString());
            if (to) query = query.lte("start_time", new Date(to + "T23:59:59").toISOString());
            const { data, error } = await query;
            if (error) throw error;
            return [...new Set(((data || []) as any[]).map((r) => r.contact_id))] as string[];
        },
    });

    useEffect(() => {
        const ids = contactIds || [];
        if (ids.join(",") === value.contactIds.join(",")) return;
        onChange({
            contactIds: ids,
            invalidRows: [],
            config: { professional_id: professionalId, status, from, to },
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contactIds]);

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <p className="text-xs text-muted-foreground mb-1">Profissional</p>
                    <Select value={professionalId} onValueChange={setProfessionalId}>
                        <SelectTrigger className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos</SelectItem>
                            {(professionals || []).map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <p className="text-xs text-muted-foreground mb-1">Status</p>
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="h-9">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <p className="text-xs text-muted-foreground mb-1">De</p>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
                </div>
                <div>
                    <p className="text-xs text-muted-foreground mb-1">Até</p>
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
                </div>
            </div>
            <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{contactIds?.length ?? "..."}</span> contatos encontrados
            </p>
        </div>
    );
}
