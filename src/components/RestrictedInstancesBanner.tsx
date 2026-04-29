import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOwnerId } from "@/hooks/useOwnerId";
import { Clock, X, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";

/**
 * Banner amarelo exibido quando o WhatsApp aplicou RESTRICT_ALL_COMPANIONS
 * (warmup de companion Multi-Device recém-pareado). A instância UZAPI está
 * conectada e funcionando — só não pode INICIAR novas conversas até a data
 * `restriction_until`. Conversas onde o contato mandou mensagem nas últimas
 * 24h continuam funcionando normalmente.
 *
 * Diferente do DisconnectedInstancesBanner (vermelho, instance offline).
 */

interface RestrictedInstance {
    id: string;
    name: string;
    restriction_active: boolean;
    restriction_until: string | null;
    restriction_type: string | null;
}

function formatBRT(iso: string): string {
    try {
        return new Date(iso).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    } catch {
        return iso;
    }
}

function formatRelative(iso: string): string {
    const target = new Date(iso).getTime();
    const now = Date.now();
    const diffMs = target - now;
    if (diffMs <= 0) return "expirando agora";

    const totalMin = Math.floor(diffMs / 60_000);
    const days = Math.floor(totalMin / (60 * 24));
    const hours = Math.floor((totalMin % (60 * 24)) / 60);
    const minutes = totalMin % 60;

    if (days >= 1) {
        return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    }
    if (hours >= 1) {
        return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
    }
    return `${minutes}min`;
}

export function RestrictedInstancesBanner() {
    const { user } = useAuth();
    const { data: ownerId } = useOwnerId();
    const [dismissed, setDismissed] = useState(false);
    // Re-render a cada 60s para atualizar o countdown
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick((t) => t + 1), 60_000);
        return () => clearInterval(id);
    }, []);

    const { data: restricted } = useQuery({
        queryKey: ["instances-restricted", ownerId],
        queryFn: async () => {
            if (!ownerId) return [] as RestrictedInstance[];
            const { data, error } = await supabase
                .from("instances")
                .select("id, name, restriction_active, restriction_until, restriction_type")
                .eq("user_id", ownerId)
                .eq("restriction_active", true);
            if (error) throw error;
            return (data ?? []) as RestrictedInstance[];
        },
        enabled: !!user && !!ownerId,
        refetchInterval: 60_000,
        staleTime: 30_000,
    });

    // Filtra entradas cuja data já passou (restrição expirou) — defesa em profundidade
    // contra o DB ficar com flag desatualizada antes do próximo envio.
    const stillRestricted = (restricted ?? []).filter((r) => {
        if (!r.restriction_until) return false;
        return new Date(r.restriction_until).getTime() > Date.now();
    });

    if (dismissed || stillRestricted.length === 0) return null;

    // Pega a restrição mais longa (worst case)
    const target = stillRestricted.reduce((acc, cur) => {
        if (!acc.restriction_until) return cur;
        if (!cur.restriction_until) return acc;
        return new Date(cur.restriction_until).getTime() > new Date(acc.restriction_until).getTime()
            ? cur
            : acc;
    }, stillRestricted[0]);

    const names = stillRestricted.map((i) => i.name).join(", ");
    const plural = stillRestricted.length > 1;
    const untilLabel = target.restriction_until ? formatBRT(target.restriction_until) : "desconhecido";
    const relative = target.restriction_until ? formatRelative(target.restriction_until) : "";

    return (
        <div className="flex items-start gap-3 px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/30 text-sm animate-in slide-in-from-top-2 duration-300">
            <Clock className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-amber-700 dark:text-amber-300">
                        {plural ? "Instâncias com restrição temporária" : "Instância com restrição temporária"}
                    </span>
                    <span className="text-amber-700/80 dark:text-amber-300/80 truncate">
                        {names} — liberação em <strong>{untilLabel}</strong>
                        {relative ? <span className="opacity-80"> (em {relative})</span> : null}
                    </span>
                </div>
                <div className="text-xs text-amber-700/70 dark:text-amber-300/70 mt-0.5 flex items-start gap-1.5">
                    <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>
                        O WhatsApp restringiu o envio de <strong>novas conversas</strong> deste dispositivo
                        (RESTRICT_ALL_COMPANIONS). Você pode continuar <strong>respondendo mensagens recebidas
                        nas últimas 24h</strong>; envios para contatos que ainda não responderam serão
                        recusados até a data acima.
                    </span>
                </div>
            </div>
            <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 flex-shrink-0 text-amber-700/70 hover:text-amber-700 dark:text-amber-300/70"
                onClick={() => setDismissed(true)}
                title="Dispensar (voltará a aparecer após reload)"
            >
                <X className="w-3.5 h-3.5" />
            </Button>
        </div>
    );
}
