import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import {
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
    "list_all", "by_service", "by_name",
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

        const { action, user_id, service_name, name } = body!;

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

        let data, error;
        // preenchidos pela ação escolhida para que a checagem única de erro
        // no fim do switch consiga dizer qual consulta falhou
        let errorCode = "professionals_query_failed";
        let operation = `consultar os profissionais da conta ${user_id}`;

        switch (action) {
            case "list_all":
                errorCode = "professionals_list_failed";
                operation = `listar os profissionais da conta ${user_id}`;
                ({ data, error } = await supabase
                    .from("professionals")
                    .select("*")
                    .eq("user_id", user_id));
                break;

            case "by_service": {
                const missingService = missingFields(corsHeaders, body!, ["service_name"],
                    "A ação by_service filtra pelo nome do serviço: envie service_name.");
                if (missingService) return missingService;

                // First find service IDs matching the name
                const { data: services, error: sError } = await supabase
                    .from("products_services")
                    .select("id")
                    .eq("user_id", user_id)
                    .ilike("name", `%${service_name}%`);

                if (sError) {
                    return dbErrorResponse(corsHeaders, "services_lookup_failed",
                        `buscar os serviços com nome parecido com "${service_name}" na conta ${user_id}`, sError);
                }

                const serviceIds = (services || []).map(s => s.id);

                // Then find professionals who have these service_ids
                // professionals.service_ids is an array of strings (UUIDs)
                // We can use the 'cs' (contains) operator if we had the exact array, but here we want "if professional has ANY of these services"
                // Supabase/Postgres array overlap operator is '&&' (pg) or .overlaps() (js)

                if (serviceIds.length === 0) {
                    data = [];
                } else {
                    errorCode = "professionals_by_service_failed";
                    operation = `listar os profissionais que atendem "${service_name}" na conta ${user_id}`;
                    ({ data, error } = await supabase
                        .from("professionals")
                        .select("*")
                        .eq("user_id", user_id)
                        .overlaps("service_ids", serviceIds));
                }
                break;
            }

            case "by_name": {
                const missingName = missingFields(corsHeaders, body!, ["name"],
                    "A ação by_name filtra pelo nome do profissional: envie name.");
                if (missingName) return missingName;

                errorCode = "professionals_by_name_failed";
                operation = `buscar profissionais com nome parecido com "${name}" na conta ${user_id}`;
                ({ data, error } = await supabase
                    .from("professionals")
                    .select("*")
                    .eq("user_id", user_id)
                    .ilike("name", `%${name}%`));
                break;
            }

            default:
                return unknownAction(corsHeaders, action, VALID_ACTIONS);
        }

        if (error) {
            return dbErrorResponse(corsHeaders, errorCode, operation, error);
        }

        return new Response(
            JSON.stringify(data),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de profissionais (api-professionals)", error);
    }
});
