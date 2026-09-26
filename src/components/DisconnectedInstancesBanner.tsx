import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useInitialInstanceValidation } from "@/hooks/useInitialInstanceValidation";
import { AlertTriangle, Wifi, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

/** Faixa visual única — WhatsApp desconectado e Instagram vencido usam a MESMA. */
function Faixa({
    tom,
    titulo,
    detalhe,
    rotuloBotao,
    onAgir,
    onDispensar,
}: {
    tom: "vermelho" | "ambar";
    titulo: string;
    detalhe: string;
    rotuloBotao: string;
    onAgir: () => void;
    onDispensar: () => void;
}) {
    const v = tom === "vermelho";
    return (
        <div
            className={`flex items-center gap-3 px-4 py-2.5 border-b text-sm animate-in slide-in-from-top-2 duration-300 ${v ? "bg-red-500/10 border-red-500/30" : "bg-amber-500/10 border-amber-500/30"
                }`}
        >
            <AlertTriangle
                className={`w-4 h-4 flex-shrink-0 ${v ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}
            />
            <div className="flex-1 min-w-0">
                <span className={`font-semibold ${v ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>
                    {titulo}
                </span>
                <span
                    className={`ml-2 truncate ${v ? "text-red-700/80 dark:text-red-300/80" : "text-amber-700/80 dark:text-amber-300/80"}`}
                >
                    {detalhe}
                </span>
            </div>
            <Button
                size="sm"
                variant={v ? "destructive" : "outline"}
                className="h-7 text-xs px-3 flex-shrink-0"
                onClick={onAgir}
            >
                <Wifi className="w-3.5 h-3.5 mr-1.5" />
                {rotuloBotao}
            </Button>
            <Button
                size="icon"
                variant="ghost"
                className={`h-7 w-7 flex-shrink-0 ${v ? "text-red-700/70 hover:text-red-700 dark:text-red-300/70" : "text-amber-700/70 hover:text-amber-700 dark:text-amber-300/70"}`}
                onClick={onDispensar}
                title="Dispensar (voltará a aparecer após reload)"
            >
                <X className="w-3.5 h-3.5" />
            </Button>
        </div>
    );
}

/**
 * Banner mostrado quando existem instâncias desconectadas do owner atual.
 * Oculta-se quando todas estão conectadas. Usuário pode dispensar temporariamente.
 *
 * Cobre também o Instagram: token vencido é o mesmo problema de conexão do
 * cliente, e a única saída é ele reconectar por OAuth. Por isso o aviso mora
 * AQUI, e não num alerta para o super admin — o dono da ação é quem vê a tela.
 */
export function DisconnectedInstancesBanner() {
    const { user } = useAuth();
    const { data: ownerId } = useOwnerId();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [dismissed, setDismissed] = useState(false);
    const [igDismissed, setIgDismissed] = useState(false);

    // Valida o status real das instâncias com a UZAPI ANTES de renderizar.
    // Evita o "flash" do banner vermelho logo após o login com estado obsoleto.
    const { validated } = useInitialInstanceValidation(ownerId);

    const { data: disconnected } = useQuery({
        queryKey: ["instances-disconnected", ownerId],
        queryFn: async () => {
            if (!ownerId) return [];
            const { data, error } = await supabase
                .from("instances")
                .select("id, name, status, last_disconnect_reason, restriction_active, restriction_until")
                .eq("user_id", ownerId)
                .eq("status", "disconnected")
                // Instancia removida do provedor nao pode ser reconectada: cobrar
                // a clinica por ela seria um banner vermelho eterno e sem saida.
                .is("removed_at", null);
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
        // Só roda após a validação inicial — o estado no banco pode estar
        // desatualizado até o cron / o on-login health-check rodar.
        enabled: !!user && !!ownerId && validated,
        // 60s de polling (era 15s). Mudanças reais de status chegam imediatamente
        // via realtime subscription abaixo — o poll só serve como fallback caso o
        // realtime caia. Alívio de carga: 4x menos requests/min por cliente ativo.
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
        staleTime: 30_000,
    });

    // Instagram: o que decide é o TOKEN, não o `status` da linha. O cron só
    // carimba 'expired' na passada da madrugada, então olhar o status faria a
    // tela mentir por até 24h — justamente na janela em que ainda dá para
    // renovar sem perder o atendimento.
    const { data: contasInstagram } = useQuery({
        queryKey: ["instagram-token-aviso", ownerId],
        queryFn: async () => {
            if (!ownerId) return [];
            const { data, error } = await supabase
                .from("instagram_instances" as any)
                .select("id, account_name, token_expires_at, status")
                .eq("user_id", ownerId);
            if (error) throw error;
            return (data ?? []) as any[];
        },
        enabled: !!user && !!ownerId,
        refetchInterval: 60 * 60_000,
        staleTime: 30 * 60_000,
    });

    // Realtime: invalida o cache imediatamente quando qualquer instance do
    // owner muda de status, evitando que o banner mostre estado obsoleto.
    useEffect(() => {
        if (!ownerId) return;
        const channel = supabase
            .channel(`instances-realtime-${ownerId}`)
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "instances",
                    filter: `user_id=eq.${ownerId}`,
                },
                () => {
                    queryClient.invalidateQueries({ queryKey: ["instances-disconnected", ownerId] });
                    queryClient.invalidateQueries({ queryKey: ["instances-restricted", ownerId] });
                },
            )
            .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [ownerId, queryClient]);

    const agora = Date.now();
    const igVencidas = (contasInstagram ?? []).filter(
        (c) => c.token_expires_at && new Date(c.token_expires_at).getTime() <= agora,
    );
    const igVencendo = (contasInstagram ?? [])
        .filter((c) => {
            if (!c.token_expires_at) return false;
            const t = new Date(c.token_expires_at).getTime();
            return t > agora && t <= agora + 7 * 86400_000;
        })
        .sort(
            (a, b) =>
                new Date(a.token_expires_at).getTime() - new Date(b.token_expires_at).getTime(),
        );

    const reconectarInstagram = () => navigate("/connections?reconectar=instagram");

    // Não renderiza a faixa do WhatsApp enquanto a validação inicial não conclui —
    // evita mostrar banner vermelho com estado obsoleto durante o login. A do
    // Instagram não depende dessa validação: ela lê uma data, não um estado vivo.
    const mostraWhats = validated && !dismissed && !!disconnected && disconnected.length > 0;

    if (!mostraWhats && igDismissed) return null;
    if (!mostraWhats && igVencidas.length === 0 && igVencendo.length === 0) return null;

    const names = (disconnected ?? []).map((i) => i.name).join(", ");
    const plural = (disconnected ?? []).length > 1;
    // Pega o motivo da primeira instância com motivo populado (caso comum: 1 só)
    const reason = (disconnected ?? []).find((i) => (i as any).last_disconnect_reason)
        ?.["last_disconnect_reason" as keyof NonNullable<typeof disconnected>[number]] as
        | string
        | undefined;

    const diasPara = (iso: string) =>
        Math.max(1, Math.ceil((new Date(iso).getTime() - agora) / 86400_000));

    return (
        <>
            {mostraWhats && (
                <Faixa
                    tom="vermelho"
                    titulo={
                        plural
                            ? `${disconnected!.length} instâncias desconectadas`
                            : "Instância desconectada"
                    }
                    detalhe={`${names} — ${reason ?? "mensagens não serão entregues até reconectar"}`}
                    rotuloBotao="Reconectar agora"
                    onAgir={() => navigate("/connections")}
                    onDispensar={() => setDismissed(true)}
                />
            )}
            {!igDismissed && igVencidas.length > 0 && (
                <Faixa
                    tom="vermelho"
                    titulo={
                        igVencidas.length > 1
                            ? `${igVencidas.length} conexões do Instagram vencidas`
                            : "Conexão do Instagram vencida"
                    }
                    detalhe={`${igVencidas
                        .map((c) => `@${c.account_name ?? "conta"}`)
                        .join(", ")} — o Direct não entra nem sai até você reconectar.`}
                    rotuloBotao="Reconectar"
                    onAgir={reconectarInstagram}
                    onDispensar={() => setIgDismissed(true)}
                />
            )}
            {!igDismissed && igVencidas.length === 0 && igVencendo.length > 0 && (
                <Faixa
                    tom="ambar"
                    titulo="Instagram"
                    detalhe={`Sua conexão com o Instagram vence em ${diasPara(
                        igVencendo[0].token_expires_at,
                    )} dias. Reconecte para não interromper o atendimento.`}
                    rotuloBotao="Reconectar"
                    onAgir={reconectarInstagram}
                    onDispensar={() => setIgDismissed(true)}
                />
            )}
        </>
    );
}
