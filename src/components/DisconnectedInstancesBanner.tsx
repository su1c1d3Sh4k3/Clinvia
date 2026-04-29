import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOwnerId } from "@/hooks/useOwnerId";
import { AlertTriangle, Wifi, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

/**
 * Banner mostrado quando existem instâncias desconectadas do owner atual.
 * Oculta-se quando todas estão conectadas. Usuário pode dispensar temporariamente.
 */
export function DisconnectedInstancesBanner() {
    const { user } = useAuth();
    const { data: ownerId } = useOwnerId();
    const navigate = useNavigate();
    const [dismissed, setDismissed] = useState(false);

    const { data: disconnected } = useQuery({
        queryKey: ["instances-disconnected", ownerId],
        queryFn: async () => {
            if (!ownerId) return [];
            const { data, error } = await supabase
                .from("instances")
                .select("id, name, status, last_disconnect_reason, restriction_active, restriction_until")
                .eq("user_id", ownerId)
                .eq("status", "disconnected");
            if (error) throw error;
            // Exclusividade: se a instância está em restrição temporária ATIVA E ainda
            // dentro do prazo, o RestrictedInstancesBanner cuida dela — não exibimos
            // o banner de desconexão para evitar dois banners simultâneos.
            return (data ?? []).filter((i: any) => {
                if (!i.restriction_active) return true;
                if (!i.restriction_until) return true;
                return new Date(i.restriction_until).getTime() <= Date.now();
            });
        },
        enabled: !!user && !!ownerId,
        refetchInterval: 60_000, // re-consulta a cada 1 min
        staleTime: 30_000,
    });

    if (dismissed || !disconnected || disconnected.length === 0) return null;

    const names = disconnected.map((i) => i.name).join(", ");
    const plural = disconnected.length > 1;
    // Pega o motivo da primeira instância com motivo populado (caso comum: 1 só)
    const reason = disconnected.find((i) => (i as any).last_disconnect_reason)
        ?.["last_disconnect_reason" as keyof (typeof disconnected)[number]] as string | undefined;

    return (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-red-500/10 border-b border-red-500/30 text-sm animate-in slide-in-from-top-2 duration-300">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
                <span className="font-semibold text-red-700 dark:text-red-300">
                    {plural
                        ? `${disconnected.length} instâncias desconectadas`
                        : "Instância desconectada"}
                </span>
                <span className="text-red-700/80 dark:text-red-300/80 ml-2 truncate">
                    {names} — {reason ?? "mensagens não serão entregues até reconectar"}
                </span>
            </div>
            <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs px-3 flex-shrink-0"
                onClick={() => navigate("/connections")}
            >
                <Wifi className="w-3.5 h-3.5 mr-1.5" />
                Reconectar agora
            </Button>
            <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 flex-shrink-0 text-red-700/70 hover:text-red-700 dark:text-red-300/70"
                onClick={() => setDismissed(true)}
                title="Dispensar (voltará a aparecer após reload)"
            >
                <X className="w-3.5 h-3.5" />
            </Button>
        </div>
    );
}
