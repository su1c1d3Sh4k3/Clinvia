import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AudienceSelection, AudienceEntry } from "../audienceTypes";

const STATUS_OPTIONS = [
    { value: "all", label: "Todos os status" },
    { value: "pending", label: "Pendente" },
    { value: "confirmed", label: "Confirmado" },
    { value: "completed", label: "Concluído" },
    { value: "cancelled", label: "Cancelado" },
    { value: "rescheduled", label: "Reagendado" },
    { value: "no_show", label: "Não compareceu" },
];

const STATUS_LABELS: Record<string, string> = Object.fromEntries(
    STATUS_OPTIONS.filter((s) => s.value !== "all").map((s) => [s.value, s.label])
);

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

    // 1 entrada POR CONTATO — se o contato tem vários agendamentos no período,
    // usa o próximo futuro (senão o mais recente) para as variáveis
    const { data: entries } = useQuery({
        queryKey: ["audience-appointments", professionalId, status, from, to],
        queryFn: async (): Promise<AudienceEntry[]> => {
            let query = supabase
                .from("appointments" as any)
                .select("contact_id, start_time, status, professionals(name), products_services(name)")
                .eq("type", "appointment")
                .not("contact_id", "is", null)
                .order("start_time", { ascending: true })
                .limit(10000);
            if (professionalId !== "all") query = query.eq("professional_id", professionalId);
            if (status !== "all") query = query.eq("status", status);
            if (from) query = query.gte("start_time", new Date(from).toISOString());
            if (to) query = query.lte("start_time", new Date(to + "T23:59:59").toISOString());
            const { data, error } = await query;
            if (error) throw error;
            // Dedupe por contato: linhas vêm ordenadas por start_time asc —
            // primeiro agendamento futuro vence; sem futuro, fica o último passado
            const now = Date.now();
            const byContact = new Map<string, any>();
            for (const r of (data || []) as any[]) {
                const ts = r.start_time ? new Date(r.start_time).getTime() : 0;
                const cur = byContact.get(r.contact_id);
                if (!cur) {
                    byContact.set(r.contact_id, r);
                    continue;
                }
                const curTs = cur.start_time ? new Date(cur.start_time).getTime() : 0;
                const curFuture = curTs >= now;
                const isFuture = ts >= now;
                // já temos futuro (o mais próximo, pois asc): não troca
                if (curFuture) continue;
                // atual é passado: futuro ganha; entre passados, o mais recente (asc → substitui)
                if (isFuture || ts > curTs) byContact.set(r.contact_id, r);
            }
            return [...byContact.values()].map((r) => {
                const start = r.start_time ? new Date(r.start_time) : null;
                return {
                    contactId: r.contact_id,
                    vars: {
                        data_agendamento: start ? start.toLocaleDateString("pt-BR") : "",
                        hora_agendamento: start
                            ? start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                            : "",
                        profissional: r.professionals?.name || "",
                        servico_agendado: r.products_services?.name || "",
                        status_agendamento: STATUS_LABELS[r.status] || r.status || "",
                    },
                };
            });
        },
    });

    useEffect(() => {
        const list = entries || [];
        const sig = (e: AudienceEntry[]) => e.map((x) => x.contactId + x.vars.data_agendamento + x.vars.hora_agendamento).join(",");
        if (sig(list) === sig(value.entries)) return;
        onChange({
            entries: list,
            invalidRows: [],
            config: { professional_id: professionalId, status, from, to },
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [entries]);

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
                <span className="font-semibold text-foreground">{entries?.length ?? "..."}</span> contatos
                — 1 mensagem por contato (usa o próximo agendamento ou o mais recente)
            </p>
        </div>
    );
}
