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

        // Regra do projeto: o mesmo cliente chega ora com o 9o digito ora sem
        // (Meta manda 12 digitos, UAZAPI manda 13), entao a identidade e sempre
        // pelos ULTIMOS 8 DIGITOS. Buscar por prefixo (`5511...%`) nao cruza os
        // dois formatos e era o que fazia esta API criar cadastro duplicado.
        const findContactByPhone = async (phone: string) => {
            const last8 = cleanPhone(String(phone)).slice(-8);
            if (last8.length < 8) return { data: null, error: null };
            return await supabase
                .from("contacts")
                .select("*")
                .eq("user_id", user_id)
                .like("number", `%${last8}%`)
                .order("created_at", { ascending: true })
                .limit(1)
                .maybeSingle();
        };

        // contacts.number nunca guarda @s.whatsapp.net (o banco tambem tira via
        // trigger); @g.us/@lid/instagram: seguem intactos.
        const stripWaSuffix = (value: string) => value.replace(/@(s\.whatsapp\.net|c\.us)$/i, "");

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

            const { data, error } = await findContactByPhone(String(phone_number));

            if (error) {
                return dbErrorResponse(corsHeaders, "contact_read_failed",
                    `buscar o contato com telefone terminando em ${cleaned.slice(-8)} na conta ${user_id}`, error);
            }

            return new Response(JSON.stringify(data || null), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (action === "create_contact") {
            const invalidData = ensureContactDataObject();
            if (invalidData) return invalidData;
            const payload = { ...contact_data, user_id };
            if (typeof payload.number === "string") payload.number = stripWaSuffix(payload.number);

            // Nunca criar um segundo cadastro pro mesmo telefone: se ja existe
            // contato com os mesmos 8 ultimos digitos, completa o que estiver
            // faltando nele e devolve. (Sem isto, o n8n abria um cadastro novo
            // toda vez que mandava o numero num formato diferente.)
            if (typeof payload.number === "string" && payload.number) {
                const { data: existente, error: lookupError } = await findContactByPhone(payload.number);
                if (lookupError) {
                    return dbErrorResponse(corsHeaders, "contact_read_failed",
                        `verificar se já existe contato com o telefone ${payload.number} na conta ${user_id}`, lookupError);
                }
                if (existente) {
                    const merge: Record<string, unknown> = {};
                    for (const [campo, valor] of Object.entries(payload)) {
                        if (campo === "number" || campo === "user_id" || campo === "id") continue;
                        if (valor === null || valor === undefined || valor === "") continue;
                        if (existente[campo] === null || existente[campo] === undefined || existente[campo] === "") {
                            merge[campo] = valor;
                        }
                    }
                    if (Object.keys(merge).length === 0) {
                        return new Response(JSON.stringify(existente), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
                    }
                    const { data: atualizado, error: mergeError } = await supabase
                        .from("contacts").update(merge).eq("id", existente.id).select().single();
                    if (mergeError) {
                        return dbErrorResponse(corsHeaders, "contact_update_failed",
                            `completar o contato ${existente.id} já existente com o telefone ${payload.number}`, mergeError);
                    }
                    return new Response(JSON.stringify(atualizado), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
                }
            }

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
                const last8 = cleanPhone(String(phone_number)).slice(-8);
                query = query.like("number", `%${last8}%`);
                identificador = `telefone terminando em ${last8}`;
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
