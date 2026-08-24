import { useEffect, useState } from "react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useCurrentTeamMember } from "@/hooks/useStaff";
import { ArrowRightLeft } from "lucide-react";

export interface TransferNoticePayload {
    /** auth uid de quem fez a transferência (não mostra popup pra si mesmo) */
    actor_auth_id: string;
    actor_name: string;
    /** 'admin' | 'supervisor' */
    actor_role: string;
    client_name: string;
    to_agent_name: string;
    /** team_members.id do atendente que PERDEU o cliente */
    from_tm_id: string;
    /** team_members.id do atendente que RECEBEU o cliente */
    to_tm_id: string;
}

const roleLabel = (role: string) => (role === "admin" ? "Admin" : "Supervisor");

/**
 * Envia o aviso de transferência via Realtime broadcast (tenant-scoped).
 * Broadcast é efêmero: só chega a quem está ONLINE — exatamente a regra.
 * Fire-and-forget: falha de envio nunca quebra o fluxo de transferência.
 */
export const sendTransferNotice = async (ownerId: string, payload: TransferNoticePayload) => {
    try {
        // Reusa o channel já inscrito (listener global) se existir — subscribe
        // duplicado no mesmo topic derruba o join anterior no socket.
        const topic = `realtime:transfer-notices-${ownerId}`;
        const existing = supabase.getChannels().find((c) => c.topic === topic);
        if (existing) {
            await existing.send({ type: "broadcast", event: "transfer", payload });
            return;
        }
        // Sem channel inscrito: send() em channel não-joined vai via HTTP
        // (POST /realtime/v1/api/broadcast) — não precisa subscribe.
        const sender = supabase.channel(`transfer-notices-${ownerId}`);
        await sender.send({ type: "broadcast", event: "transfer", payload });
        supabase.removeChannel(sender);
    } catch (e) {
        console.error("[TransferNotice] send failed:", e);
    }
};

/**
 * Listener global (montado no App): popup central quando Admin/Supervisor
 * transfere um cliente entre atendentes — avisa quem PERDEU e quem RECEBEU.
 * Vários avisos em sequência formam fila (um popup por vez).
 */
export function TransferNoticeListener() {
    const { data: ownerId } = useOwnerId();
    const { data: currentTeamMember } = useCurrentTeamMember();
    const [queue, setQueue] = useState<string[]>([]);

    const myTmId = (currentTeamMember as any)?.id as string | undefined;
    const myAuthId = (currentTeamMember as any)?.auth_user_id as string | undefined;

    useEffect(() => {
        if (!ownerId || !myTmId) return;

        const channel = supabase
            .channel(`transfer-notices-${ownerId}`)
            .on("broadcast", { event: "transfer" }, ({ payload }) => {
                const p = payload as TransferNoticePayload;
                if (!p || p.actor_auth_id === myAuthId) return;

                let message: string | null = null;
                if (p.from_tm_id === myTmId) {
                    message = `O cliente ${p.client_name} foi transferido para o atendente ${p.to_agent_name} pelo ${roleLabel(p.actor_role)} ${p.actor_name}.`;
                } else if (p.to_tm_id === myTmId) {
                    message = `O ${roleLabel(p.actor_role)} ${p.actor_name} acabou de transferir para você o cliente ${p.client_name} que estava com outro usuário.`;
                }
                if (message) setQueue((prev) => [...prev, message!]);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [ownerId, myTmId, myAuthId]);

    const current = queue[0];

    return (
        <AlertDialog open={!!current}>
            <AlertDialogContent className="w-[95vw] sm:w-full sm:max-w-md rounded-lg">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2">
                        <ArrowRightLeft className="w-5 h-5 text-primary" />
                        Transferência de atendimento
                    </AlertDialogTitle>
                    <AlertDialogDescription className="text-[15px] text-foreground pt-2">
                        {current}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogAction onClick={() => setQueue((prev) => prev.slice(1))}>
                        Ok
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
