import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { generateConversationSummary, loadConversationTranscript } from "../_shared/conversation-summary.ts";
import { reportIncident, setIncidentComponent } from "../_shared/report-incident.ts";

setIncidentComponent("conversation-summary-worker");

/**
 * conversation-summary-worker (pg_cron a cada minuto)
 *
 * USER RULE: toda conversa que vira 'resolved', em qualquer circunstância, tem
 * resumo da IA. O trigger zz_conversation_summary_enqueue enfileira; este worker
 * consome `conversation_summary_queue` e grava via RPC finish_conversation_summary
 * (conversations.summary + ai_analysis + contacts.quality, tudo numa transação).
 *
 * O resumo é POR CONVERSA: o material vem do messages_history daquele ticket, não
 * do histórico do contato. Falha volta para 'pending' e é retentada até 3 vezes.
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json; charset=utf-8",
};

/** Teto por rodada: o cron roda a cada minuto, o backfill escoa sozinho. */
const BATCH_SIZE = 15;

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const stats = { claimed: 0, done: 0, failed: 0 };

    try {
        const { data: claimed, error: claimError } = await supabase.rpc("claim_conversation_summaries", {
            p_limit: BATCH_SIZE,
        });
        if (claimError) throw claimError;

        const fila = (claimed ?? []) as { conversation_id: string; user_id: string }[];
        stats.claimed = fila.length;

        for (const item of fila) {
            try {
                const { transcript, ownerId } = await loadConversationTranscript(supabase, item.conversation_id);
                const analise = await generateConversationSummary(supabase, {
                    transcript,
                    ownerId: ownerId ?? item.user_id ?? null,
                    functionName: "conversation-summary-worker",
                });

                const { error: saveError } = await supabase.rpc("finish_conversation_summary", {
                    p_conversation_id: item.conversation_id,
                    p_summary: analise.summary,
                    p_sentiment_score: analise.sentiment_score,
                    p_speed_score: analise.speed_score,
                });
                if (saveError) throw saveError;

                stats.done++;
            } catch (e) {
                console.error(`[conversation-summary] conv=${item.conversation_id} falhou:`, e);
                stats.failed++;
                const { error: failError } = await supabase.rpc("fail_conversation_summary", {
                    p_conversation_id: item.conversation_id,
                    p_error: String((e as Error)?.message ?? e),
                });
                if (failError) console.error("[conversation-summary] erro ao marcar falha:", failError);
            }
        }

        console.log(`[conversation-summary] ${JSON.stringify(stats)}`);
        return new Response(JSON.stringify({ success: true, ...stats }), { headers: corsHeaders });
    } catch (e) {
        console.error("[conversation-summary] fatal:", e);
        reportIncident({ route: "batch", httpCode: 500, error: e });
        return new Response(JSON.stringify({ success: false, error: String(e) }), {
            status: 500,
            headers: corsHeaders,
        });
    }
});
