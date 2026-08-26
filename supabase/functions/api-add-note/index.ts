import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * api-add-note
 *
 * API externa (n8n / IA) para anexar uma Nota de Conversa — nota interna
 * visível só no front (inbox + modal + Histórico > Notas do cliente),
 * nunca enviada ao cliente. Armazenada em client_documents (category 'notas',
 * conversation_id preenchido). Notas nunca são apagadas.
 *
 * Auth: header `x-api-key` = SCHEDULING_API_KEY (mesmo das demais api-*).
 *
 * Body:
 *   user_id         (obrigatório) — dono da conta (bd_data.user_id)
 *   text            (obrigatório) — texto da nota
 *   conversation_id (obrigatório) — conversa à qual anexar a nota (bd_data.conversation_id)
 *   author_name     (opcional)    — autor exibido no título (default "IA")
 *
 * Título gerado: "Nota de Conversa - <autor> - dd/MM/yyyy HH:mm" (horário de São Paulo)
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
}

/** dd/MM/yyyy HH:mm no fuso America/Sao_Paulo (truque sv-SE: YYYY-MM-DD HH:mm:ss) */
function saoPauloTimestamp(date = new Date()): string {
    const sv = date.toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }); // "2026-08-18 15:30:00"
    const [d, t] = sv.split(" ");
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y} ${t.slice(0, 5)}`;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const apiKey = req.headers.get("x-api-key");
        const envApiKey = Deno.env.get("SCHEDULING_API_KEY");
        if (!envApiKey || apiKey !== envApiKey) {
            return json({ success: false, error: "unauthorized", message: "Unauthorized" }, 401);
        }

        const body = await req.json();
        const userId: string | undefined = body.user_id;
        const text: string | undefined = typeof body.text === "string" ? body.text.trim() : undefined;
        const conversationId: string | undefined = body.conversation_id;
        const authorName: string = (typeof body.author_name === "string" && body.author_name.trim()) || "IA";

        if (!userId || !text || !conversationId) {
            return json({
                success: false,
                error: "missing_params",
                message: "Campos obrigatórios: user_id, text, conversation_id",
            }, 400);
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const { data: conv } = await supabase
            .from("conversations")
            .select("id, user_id, contact_id")
            .eq("id", conversationId)
            .eq("user_id", userId)
            .maybeSingle();
        if (!conv) {
            return json({ success: false, error: "conversation_not_found", message: "Conversa não encontrada para este user_id" }, 404);
        }
        const contactId: string | null = conv.contact_id;
        if (!contactId) {
            return json({ success: false, error: "no_contact", message: "Conversa sem contato vinculado — nota não pode ser catalogada" }, 400);
        }

        const title = `Nota de Conversa - ${authorName} - ${saoPauloTimestamp()}`;

        // REGRA: escrita service-role em tabela RLS user_id SEMPRE seta user_id explícito
        const { data: note, error } = await supabase
            .from("client_documents")
            .insert({
                user_id: userId,
                contact_id: contactId,
                conversation_id: conversationId,
                category: "notas",
                title,
                description: text,
                author_name: authorName,
            })
            .select("id, title, created_at")
            .single();

        if (error) {
            console.error("[api-add-note] insert error:", error);
            return json({ success: false, error: "insert_failed", message: error.message }, 500);
        }

        return json({
            success: true,
            note_id: note.id,
            title: note.title,
            conversation_id: conversationId,
            contact_id: contactId,
        });
    } catch (err) {
        console.error("[api-add-note] error:", err);
        return json({ success: false, error: "internal_error", message: String(err) }, 500);
    }
});
