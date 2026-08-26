import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
    apiError,
    dbErrorResponse,
    missingFields,
    readJsonBody,
    requireApiKey,
    unexpectedErrorResponse,
} from "../_shared/api-errors.ts";

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
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const userId: string | undefined = body!.user_id;
        const text: string | undefined = typeof body!.text === "string" ? body!.text.trim() : undefined;
        const conversationId: string | undefined = body!.conversation_id;
        const authorName: string = (typeof body!.author_name === "string" && body!.author_name.trim()) || "IA";

        const missing = missingFields(corsHeaders, body!, ["user_id", "text", "conversation_id"],
            "user_id é bd_data.user_id, conversation_id é bd_data.conversation_id e text é o conteúdo da nota interna.");
        if (missing) return missing;

        // `text` pode chegar preenchido só com espaços — missingFields já corta string vazia,
        // mas o trim acima é o valor que vai ao banco
        if (!text) {
            return apiError(corsHeaders, {
                status: 400,
                code: "empty_note_text",
                message: "O campo `text` da nota está vazio depois de remover os espaços. Envie o texto da nota que deve ficar registrado na conversa.",
            });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const { data: conv, error: convError } = await supabase
            .from("conversations")
            .select("id, user_id, contact_id")
            .eq("id", conversationId)
            .eq("user_id", userId)
            .maybeSingle();
        if (convError) {
            return dbErrorResponse(corsHeaders, "conversation_lookup_failed",
                `buscar a conversa ${conversationId} onde a nota seria anexada`, convError);
        }
        if (!conv) {
            return apiError(corsHeaders, {
                status: 404,
                code: "conversation_not_found",
                message: `Conversa não encontrada: nenhuma conversa com o id ${conversationId} pertence ao user_id ${userId}. Confira se o conversation_id veio de bd_data.conversation_id e se o user_id é o da mesma conta.`,
            });
        }
        const contactId: string | null = conv.contact_id;
        if (!contactId) {
            return apiError(corsHeaders, {
                status: 400,
                code: "conversation_without_contact",
                message: `A conversa ${conversationId} não tem contato vinculado (é uma conversa de grupo) e a nota é catalogada no histórico do cliente. Anexe a nota em uma conversa individual.`,
            });
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
            return dbErrorResponse(corsHeaders, "note_insert_failed",
                `gravar a nota "${title}" no histórico do contato ${contactId} (client_documents, categoria 'notas')`, error);
        }

        return json({
            success: true,
            note_id: note.id,
            title: note.title,
            conversation_id: conversationId,
            contact_id: contactId,
        });
    } catch (err) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de notas de conversa (api-add-note)", err);
    }
});
