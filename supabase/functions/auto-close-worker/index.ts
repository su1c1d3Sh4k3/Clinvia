import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * auto-close-worker (pg_cron a cada 5 min)
 *
 * Encerramento Automático de Mensagens (Configurações → Automações):
 * - RPC auto_close_scan() cancela avisos respondidos e devolve candidatos:
 *   'warning'      → envia a mensagem de aviso (editável por conta) e marca
 *                    conversations.auto_close_warning_at
 *   'close'        → envia a mensagem final (editável) e encerra o ticket
 *   'close_silent' → encerra sem mensagem (backlog além do limite — janela
 *                    Meta fechada — ou conversa em que o cliente nunca falou)
 * - Encerrar = card ativo do contato vai para 'Sem Contato' (terminal; trigger
 *   resolve as conversas do contato) + resolve defensivo da conversa.
 * - Envio via evolution-send-message (roteia Meta/UAZAPI e persiste a msg).
 * - Timer sempre da última msg do CLIENTE; Meta usa 22h30/23h30 fixos, UAZAPI
 *   tempos configuráveis. Grupos e Instagram fora (filtrados na RPC).
 * - Cap de 30 envios por rodada (espaçamento 1s) — o resto fica p/ o próximo
 *   ciclo de 5 min; encerramentos silenciosos não contam no cap.
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json; charset=utf-8",
};

const MAX_SENDS_PER_RUN = 30;
const SEND_SPACING_MS = 1000;

type Candidate = {
    conv_id: string;
    owner_id: string;
    contact_ref: string | null;
    action: "warning" | "close" | "close_silent";
    msg: string | null;
};

function getSupabase() {
    return createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
}

/** Envia texto livre pela conversa (evolution-send-message roteia o provider e salva a msg). */
async function sendConversationText(conversationId: string, text: string): Promise<boolean> {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/evolution-send-message`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
                conversationId,
                body: text,
                messageType: "text",
                message: { wasSentByApi: true },
            }),
        });
        const body = await resp.json().catch(() => ({}));
        if (!resp.ok || body?.success === false) {
            console.error(`[auto-close] send failed conv=${conversationId}:`, JSON.stringify(body));
            return false;
        }
        return true;
    } catch (e) {
        console.error(`[auto-close] send error conv=${conversationId}:`, e);
        return false;
    }
}

/** Encerra: card ativo → 'Sem Contato' (terminal resolve a conv) + resolve defensivo. */
async function closeConversation(supabase: ReturnType<typeof getSupabase>, cand: Candidate) {
    if (cand.contact_ref) {
        // RPC com escopo: encerra SÓ esta conversa — o contato pode ter ticket
        // aberto em outra instância e ele não pode ser encerrado junto.
        const { error: crmError } = await supabase.rpc("crm_close_conversation_negotiation", {
            p_conversation_id: cand.conv_id,
            p_stage: "Sem Contato",
            p_loss_reason: null,
            p_loss_reason_other: null,
        });
        if (crmError) console.error(`[auto-close] crm move error conv=${cand.conv_id}:`, crmError);
    }
    // Defensivo: sem card ativo o trigger terminal não roda — resolve direto
    const { error: convError } = await supabase
        .from("conversations")
        .update({ status: "resolved" })
        .eq("id", cand.conv_id)
        .neq("status", "resolved");
    if (convError) console.error(`[auto-close] resolve error conv=${cand.conv_id}:`, convError);
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const supabase = getSupabase();
    const stats = { warnings: 0, closed: 0, closed_silent: 0, send_failures: 0 };

    try {
        const { data, error } = await supabase.rpc("auto_close_scan");
        if (error) throw error;

        const candidates = (data ?? []) as Candidate[];
        let sends = 0;

        for (const cand of candidates) {
            if (cand.action === "close_silent") {
                await closeConversation(supabase, cand);
                stats.closed_silent++;
                continue;
            }

            if (sends >= MAX_SENDS_PER_RUN) continue; // fica p/ a próxima rodada
            sends++;

            if (cand.action === "warning") {
                const ok = await sendConversationText(cand.conv_id, cand.msg ?? "");
                if (ok) {
                    const { error: warnError } = await supabase
                        .from("conversations")
                        .update({ auto_close_warning_at: new Date().toISOString() })
                        .eq("id", cand.conv_id);
                    if (warnError) console.error(`[auto-close] warning mark error conv=${cand.conv_id}:`, warnError);
                    else stats.warnings++;
                } else {
                    stats.send_failures++;
                }
            } else if (cand.action === "close") {
                // Mensagem final é best-effort: o encerramento acontece de qualquer forma
                const ok = await sendConversationText(cand.conv_id, cand.msg ?? "");
                if (!ok) stats.send_failures++;
                await closeConversation(supabase, cand);
                stats.closed++;
            }

            await new Promise((r) => setTimeout(r, SEND_SPACING_MS));
        }

        console.log(`[auto-close] done: ${JSON.stringify(stats)} (candidates=${candidates.length})`);
        return new Response(JSON.stringify({ success: true, ...stats }), { headers: corsHeaders });
    } catch (e) {
        console.error("[auto-close] fatal:", e);
        return new Response(JSON.stringify({ success: false, error: String(e) }), {
            status: 500,
            headers: corsHeaders,
        });
    }
});
