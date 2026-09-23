import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { apiError, readJsonBody, unexpectedErrorResponse } from "../_shared/api-errors.ts";
import { ensureSandboxSession, SANDBOX_N8N_URL } from "../_shared/sandbox.ts";
import { buildSandboxBdData } from "../_shared/sandbox-payload.ts";

/**
 * sandbox-inbound
 *
 * Entrada do ambiente de teste: o que o `webhook-handle-message` faz quando
 * chega uma mensagem de WhatsApp, só que sem WhatsApp e SEM NENHUM PORTÃO
 * (ia_on da conta, da conexão, do contato e fila são ignorados de propósito —
 * o cliente testa a IA sem precisar ligá-la em produção).
 *
 * Auth: JWT do usuário logado (chamada pela página Sandbox da IA).
 * Body: { text: string, reset_context?: boolean }
 *   reset_context = a palavra LIMPAR: manda o gatilho pro n8n limpar o Redis
 *   e marca o corte do histórico, sem gravar a mensagem no chat.
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
}

serveMonitored("sandbox-inbound", async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const authHeader = req.headers.get("Authorization") || "";
        const { data: { user }, error: userError } = await supabase.auth.getUser(
            authHeader.replace("Bearer ", ""),
        );
        if (userError || !user) {
            return apiError(corsHeaders, {
                status: 401,
                code: "not_authenticated",
                message: "Sessão expirada ou token inválido. Entre no sistema novamente para usar o ambiente de teste.",
            });
        }

        let ownerId = user.id;
        const { data: teamMember } = await supabase
            .from("team_members").select("user_id").eq("auth_user_id", user.id).maybeSingle();
        if (teamMember?.user_id) ownerId = teamMember.user_id;

        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const resetContext = body!.reset_context === true;
        const text = String(body!.text ?? "").trim();
        if (!text && !resetContext) {
            return apiError(corsHeaders, {
                status: 400,
                code: "missing_text",
                message: "Escreva a mensagem que o paciente fictício vai enviar para a IA.",
            });
        }

        const ctx = await ensureSandboxSession(supabase, ownerId);

        if (resetContext) {
            // Corta o histórico daqui pra frente (o chat limpa no front)
            const agora = new Date().toISOString();
            await supabase.from("sandbox_contacts")
                .update({ ia_context_reset_at: agora }).eq("id", ctx.contact.id);
            ctx.contact.ia_context_reset_at = agora;
        } else {
            await supabase.from("sandbox_messages").insert({
                session_id: ctx.session.id,
                user_id: ownerId,
                conversation_id: ctx.conversation.id,
                role: "user",
                content: text,
            });
            await supabase.from("sandbox_conversations")
                .update({ last_message_at: new Date().toISOString() }).eq("id", ctx.conversation.id);
        }

        const bdData = await buildSandboxBdData(supabase, ctx);
        const conteudo = resetContext ? "LIMPAR" : text;

        // Mesma forma do payload da UAZAPI para o fluxo não precisar de adaptação
        const forwardedPayload = {
            EventType: "messages",
            event: "messages",
            sandbox: true,
            message: {
                text: conteudo,
                messageType: "conversation",
                fromMe: false,
                sender: ctx.contact.number,
                senderName: ctx.contact.push_name,
                chatid: ctx.contact.number,
                messageid: crypto.randomUUID(),
            },
            bd_data: bdData,
        };

        let n8nStatus = 0;
        let n8nErro: string | null = null;
        try {
            const resp = await fetch(SANDBOX_N8N_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json", "User-Agent": "Clinvia-Sandbox/1.0" },
                body: JSON.stringify(forwardedPayload),
            });
            n8nStatus = resp.status;
            if (!resp.ok) n8nErro = (await resp.text()).slice(0, 500);
        } catch (err) {
            n8nErro = String((err as Error)?.message ?? err);
        }

        await supabase.from("sandbox_api_logs").insert({
            session_id: ctx.session.id,
            user_id: ownerId,
            function_name: "sandbox-inbound",
            label: resetContext
                ? "Memória da IA limpa e contexto reiniciado"
                : `Mensagem do paciente enviada para a IA: "${text.slice(0, 80)}"`,
            ok: !n8nErro,
            status_code: n8nStatus || null,
            request: { text: conteudo },
            response: n8nErro ? { erro: n8nErro } : null,
        });

        if (n8nErro) {
            return apiError(corsHeaders, {
                status: 502,
                code: "sandbox_forward_failed",
                message:
                    "A mensagem foi registrada no ambiente de teste, mas o fluxo da IA não respondeu" +
                    (n8nStatus ? ` (HTTP ${n8nStatus})` : "") +
                    ". Verifique se o fluxo de sandbox está ativo no n8n.",
                details: n8nErro,
                extra: { conversation_id: ctx.conversation.id },
            });
        }

        return json({
            success: true,
            conversation_id: ctx.conversation.id,
            contact_id: ctx.contact.id,
            session_id: ctx.session.id,
            n8n_status: n8nStatus,
        });
    } catch (error) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada ao enviar a mensagem no ambiente de teste (sandbox-inbound)", error, req);
    }
});
