import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
    apiError,
    dbErrorResponse,
    readJsonBody,
    requireApiKey,
    unexpectedErrorResponse,
    unknownAction,
} from "../_shared/api-errors.ts";
import { loadSandboxContext, logSandboxCall } from "../_shared/sandbox.ts";

/**
 * api-contacts-sandbox
 *
 * Gêmea de `api-contacts` no ambiente de teste. O sandbox tem UM paciente
 * fictício por conta: `create_contact` não cria ninguém, só devolve (e atualiza)
 * esse paciente — é assim que a IA "descobre o nome" durante o teste.
 *
 * Header: x-api-key = SCHEDULING_API_KEY
 * Body: { action, conversation_id | user_id, contact_data? }
 *   actions: get_contact | create_contact | update_contact
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const VALID_ACTIONS = ["get_contact", "create_contact", "update_contact"];
/** O resto do cadastro do paciente fictício é do cliente, não da IA. */
const CAMPOS_EDITAVEIS = ["push_name", "email", "cpf", "company", "instagram", "patient"];

serveMonitored("api-contacts-sandbox", async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
        });

    try {
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const action = body!.action;
        if (!action || !VALID_ACTIONS.includes(action)) {
            return unknownAction(corsHeaders, action, VALID_ACTIONS);
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const ctx = await loadSandboxContext(supabase, {
            conversationId: body!.conversation_id,
            userId: body!.user_id,
        });

        const formatar = (c: Record<string, any>) => ({
            id: c.id,
            push_name: c.push_name,
            number: c.number,
            phone: c.number,
            email: c.email,
            cpf: c.cpf,
            company: c.company,
            instagram: c.instagram,
            patient: c.patient,
            client_stage: c.client_stage,
        });

        if (action === "get_contact") {
            await logSandboxCall(supabase, ctx, {
                function_name: "api-contacts-sandbox",
                label: "Consultou o cadastro do paciente",
                request: body,
            });
            return json({ success: true, contact: formatar(ctx.contact) });
        }

        // create_contact e update_contact caem no mesmo lugar: só existe um paciente
        const contactData = body!.contact_data;
        if (contactData !== undefined && (typeof contactData !== "object" || Array.isArray(contactData))) {
            return apiError(corsHeaders, {
                status: 400,
                code: "contact_data_not_object",
                message: `O campo contact_data precisa ser um objeto JSON com os campos do contato. Recebido: ${Array.isArray(contactData) ? "array" : typeof contactData}.`,
            });
        }

        const patch: Record<string, unknown> = {};
        for (const campo of CAMPOS_EDITAVEIS) {
            if (contactData && contactData[campo] !== undefined) patch[campo] = contactData[campo];
        }

        if (Object.keys(patch).length === 0) {
            await logSandboxCall(supabase, ctx, {
                function_name: "api-contacts-sandbox",
                label: "Consultou o cadastro do paciente",
                request: body,
            });
            return json({ success: true, contact: formatar(ctx.contact), updated: false });
        }

        patch.updated_at = new Date().toISOString();
        const { data: updated, error } = await supabase
            .from("sandbox_contacts")
            .update(patch)
            .eq("id", ctx.contact.id)
            .select("*")
            .single();

        if (error) {
            return dbErrorResponse(corsHeaders, "contact_update_failed",
                "atualizar o cadastro do paciente fictício no ambiente de teste", error);
        }

        await logSandboxCall(supabase, ctx, {
            function_name: "api-contacts-sandbox",
            label: patch.push_name
                ? `Atualizou o nome do paciente para "${patch.push_name}"`
                : `Atualizou o cadastro do paciente (${Object.keys(patch).filter((k) => k !== "updated_at").join(", ")})`,
            request: body,
        });

        return json({ success: true, contact: formatar(updated), updated: true });
    } catch (err) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de contatos do ambiente de teste (api-contacts-sandbox)", err, req);
    }
});
