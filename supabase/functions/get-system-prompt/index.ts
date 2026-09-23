// API dos System Prompts da plataforma (x-api-key = SCHEDULING_API_KEY)
//
// Os fluxos do n8n buscam o prompt aqui em vez de guardar uma cópia colada em
// cada workflow: o texto é editado em /admin?tab=system-prompt e passa a valer
// para todos os fluxos na execução seguinte.
//
// Chamada (GET ou POST, sem corpo):
//   GET https://<projeto>.supabase.co/functions/v1/get-system-prompt
//   header: x-api-key: <SCHEDULING_API_KEY>
//
// Resposta 200:
//   {
//     "success": true,
//     "prompts": {
//       "base": "...",
//       "campanhas_qualificacao": "...",
//       "campanhas_agendamento": "...",
//       "instagram": "..."
//     },
//     "updated_at": "2026-09-19T12:00:00.000Z"
//   }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import {
    apiError,
    dbErrorResponse,
    requireApiKey,
    unexpectedErrorResponse,
} from "../_shared/api-errors.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        if (req.method !== "GET" && req.method !== "POST") {
            return apiError(corsHeaders, {
                status: 405,
                code: "method_not_allowed",
                message: `Método ${req.method} não é aceito nesta API. Use GET (ou POST sem corpo).`,
            });
        }

        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        const { data, error } = await supabase
            .from("system_prompts")
            .select("base_prompt, qualificacao_prompt, agendamento_prompt, instagram_prompt, updated_at")
            .eq("id", true)
            .maybeSingle();

        if (error) {
            return dbErrorResponse(corsHeaders, "system_prompts_read_failed", "ler os system prompts", error, req);
        }
        if (!data) {
            return apiError(corsHeaders, {
                status: 404,
                code: "system_prompts_not_initialized",
                message: "A linha de system prompts não existe no banco. Abra /admin?tab=system-prompt e salve uma vez para criá-la.",
            });
        }

        return new Response(
            JSON.stringify({
                success: true,
                prompts: {
                    base: data.base_prompt || "",
                    campanhas_qualificacao: data.qualificacao_prompt || "",
                    campanhas_agendamento: data.agendamento_prompt || "",
                    instagram: data.instagram_prompt || "",
                },
                updated_at: data.updated_at,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    } catch (err) {
        return unexpectedErrorResponse(corsHeaders, "buscar os system prompts", err, req);
    }
});
