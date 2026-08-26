import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

/**
 * api-reset-context
 *
 * Zera o histórico que a IA recebe (bd_data.conversation_history) para um
 * contato, sem apagar nada: grava contacts.ia_context_reset_at = agora e a RPC
 * get_conversation_messages_toon passa a considerar só mensagens posteriores.
 * O inbox continua mostrando a conversa inteira.
 *
 * Serve para simular um cliente novo em testes com o mesmo número.
 *
 * Header: x-api-key = SCHEDULING_API_KEY
 * Body (JSON):
 *   - contact_id (obrigatório)
 *   - restore (opcional, bool): true devolve o histórico completo (volta a NULL)
 */
serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    try {
        const apiKey = req.headers.get("x-api-key");
        const envApiKey = Deno.env.get("SCHEDULING_API_KEY");
        if (!envApiKey || apiKey !== envApiKey) {
            return json({ success: false, error: "Unauthorized: Invalid or missing API Key" }, 401);
        }

        const body = await req.json();
        const contactId = body.contact_id;
        const restore = body.restore === true;

        if (!contactId) {
            return json({ success: false, error: "contact_id is required" }, 400);
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const resetAt = restore ? null : new Date().toISOString();

        const { data, error } = await supabase
            .from("contacts")
            .update({ ia_context_reset_at: resetAt })
            .eq("id", contactId)
            .select("id, push_name, number, ia_context_reset_at")
            .maybeSingle();

        if (error) {
            console.error("[api-reset-context] update error:", error);
            return json({ success: false, error: error.message }, 500);
        }
        if (!data) {
            return json({ success: false, error: "Contato não encontrado" }, 404);
        }

        return json({
            success: true,
            contact_id: data.id,
            contact_name: data.push_name,
            number: data.number,
            ia_context_reset_at: data.ia_context_reset_at,
            message: restore
                ? "Histórico completo devolvido para a IA."
                : "Contexto limpo: a IA passa a ver este contato como um cliente novo.",
        });
    } catch (err: any) {
        console.error("[api-reset-context] Error:", err);
        return json({ success: false, error: err.message }, 500);
    }
});
