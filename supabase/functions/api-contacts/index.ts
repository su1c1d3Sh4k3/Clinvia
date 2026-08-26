import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import {
    apiError,
    dbErrorResponse,
    missingFields,
    readJsonBody,
    requireApiKey,
    unexpectedErrorResponse,
    unknownAction,
} from "../_shared/api-errors.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const VALID_ACTIONS = [
    "get_contact", "create_contact", "update_contact",
];

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const { action, user_id, phone_number, contact_data } = body!;

        const missingUser = missingFields(corsHeaders, body!, ["user_id"],
            "Envie o id da conta (bd_data.user_id no prompt da IA).");
        if (missingUser) return missingUser;

        if (!action) {
            return unknownAction(corsHeaders, action, VALID_ACTIONS);
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const cleanPhone = (phone: string) => {
            return phone.replace(/\D/g, "");
        };

        // contact_data precisa ser objeto: espalhar string/array monta um payload
        // sem sentido e o erro sairia como violação de coluna do Postgres.
        const ensureContactDataObject = (): Response | null => {
            const missing = missingFields(corsHeaders, body!, ["contact_data"],
                `Envie contact_data com os campos do contato (ex.: {"number": "5511999999999", "push_name": "Maria"}).`);
            if (missing) return missing;
            if (typeof contact_data !== "object" || Array.isArray(contact_data)) {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "contact_data_not_object",
                    message: `O campo contact_data precisa ser um objeto JSON com os campos do contato. Recebido: ${Array.isArray(contact_data) ? "array" : typeof contact_data}.`,
                });
            }
            return null;
        };

        if (action === "get_contact") {
            const missingPhone = missingFields(corsHeaders, body!, ["phone_number"],
                "A ação get_contact busca pelo telefone: envie phone_number (só dígitos, com DDI e DDD).");
            if (missingPhone) return missingPhone;

            const cleaned = cleanPhone(String(phone_number));

            // Search for number starting with cleaned version (matches @s.whatsapp.net or @whatsapp.com)
            const { data, error } = await supabase
                .from("contacts")
                .select("*")
                .eq("user_id", user_id)
                .ilike("number", `${cleaned}%`)
                .single();

            // PGRST116 = nenhuma (ou mais de uma) linha para o .single(): não é
            // falha de banco, é "contato não encontrado" → resposta null, como antes.
            if (error && error.code !== "PGRST116") {
                return dbErrorResponse(corsHeaders, "contact_read_failed",
                    `buscar o contato com telefone começando em ${cleaned} na conta ${user_id}`, error);
            }

            return new Response(JSON.stringify(data || null), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (action === "create_contact") {
            const invalidData = ensureContactDataObject();
            if (invalidData) return invalidData;
            // contact_data should have: name (push_name?), number, etc.
            // Ensure number is formatted if needed, or trust user?
            // Let's assume user sends raw data, but we enforce user_id

            const payload = { ...contact_data, user_id };

            const { data, error } = await supabase
                .from("contacts")
                .insert(payload)
                .select()
                .single();

            if (error) {
                return dbErrorResponse(corsHeaders, "contact_create_failed",
                    `criar o contato na conta ${user_id} com os campos ${Object.keys(contact_data).join(", ") || "(nenhum)"}`, error);
            }
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (action === "update_contact") {
            const invalidData = ensureContactDataObject();
            if (invalidData) return invalidData;

            // Identify by ID if present, else phone
            let query = supabase.from("contacts").update(contact_data).eq("user_id", user_id);
            let identificador: string;

            if (contact_data.id) {
                query = query.eq("id", contact_data.id);
                identificador = `id ${contact_data.id}`;
            } else if (phone_number) {
                const cleaned = cleanPhone(String(phone_number));
                query = query.ilike("number", `${cleaned}%`);
                identificador = `telefone começando em ${cleaned}`;
            } else {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "contact_identifier_missing",
                    message: "Não dá para saber qual contato atualizar: envie contact_data.id ou phone_number para identificá-lo.",
                    details: `Campos recebidos: ${Object.keys(body!).join(", ") || "(nenhum)"}`,
                });
            }

            const { data, error } = await query.select().single();
            if (error) {
                // PGRST116 aqui significa que o filtro não casou com nenhum contato
                // (ou casou com vários) — o update simplesmente não aconteceu.
                if (error.code === "PGRST116") {
                    return apiError(corsHeaders, {
                        status: 404,
                        code: "contact_not_found",
                        message: `Nenhum contato da conta ${user_id} foi atualizado: a busca por ${identificador} não encontrou exatamente um contato. Confira o identificador (use a ação get_contact para obtê-lo).`,
                        details: String(error.message ?? error),
                    });
                }
                return dbErrorResponse(corsHeaders, "contact_update_failed",
                    `atualizar o contato (${identificador}) da conta ${user_id}`, error);
            }
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return unknownAction(corsHeaders, action, VALID_ACTIONS);

    } catch (error) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de contatos (api-contacts)", error);
    }
});
