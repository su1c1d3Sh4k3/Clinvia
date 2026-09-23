// n8n-error-ingest — recebe a falha do n8n e a transforma em incidente.
//
// AUTENTICACAO: `x-api-key` = N8N_ERROR_INGEST_KEY, um segredo SO desta porta.
// De proposito NAO reusa SCHEDULING_API_KEY: este endpoint e configurado num
// workflow que se edita a mao e que qualquer um da equipe pode abrir — nao pode
// carregar a chave que da acesso a agenda e ao CRM.
//
// O TRABALHO PESADO ESTA NO BANCO (public.incident_ingest): sanitizacao,
// resolucao do tenant e agrupamento por fingerprint acontecem numa transacao so.
// Aqui e porteiro: autentica, limita o tamanho, valida o minimo e repassa.
// Motivo: incidents tem indice unico parcial por fingerprint, e agrupar em duas
// viagens perde a corrida quando o erro vem em rajada — que e o caso normal.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { apiError, describeDbError } from "../_shared/api-errors.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
};

/** 64 KB. Acima disso e stack trace inteiro ou dump de payload — nao cabe num alerta. */
const LIMITE_BYTES = 64 * 1024;

/** O n8n fala 'error_trigger' e 'silent'; o banco fala 'n8n_error' e 'n8n_silent'. */
const FONTES: Record<string, string> = {
    error_trigger: "n8n_error",
    silent: "n8n_silent",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        if (req.method !== "POST") {
            return apiError(corsHeaders, {
                status: 405,
                code: "method_not_allowed",
                message: `Método ${req.method} não é aceito. Use POST com Content-Type: application/json.`,
            });
        }

        // ── chave ──────────────────────────────────────────────────────────
        // Os 3 casos ficam separados: "não autorizado" seco não diz se o
        // problema é o secret do servidor, o header ou o valor.
        const esperada = Deno.env.get("N8N_ERROR_INGEST_KEY");
        if (!esperada) {
            return apiError(corsHeaders, {
                status: 500,
                code: "api_key_not_configured",
                message: "O segredo N8N_ERROR_INGEST_KEY não está configurado nesta edge function. Configure em Supabase > Edge Functions > Secrets e faça o deploy novamente.",
            });
        }
        const recebida = req.headers.get("x-api-key");
        if (!recebida) {
            return apiError(corsHeaders, {
                status: 401,
                code: "api_key_missing",
                message: "Header x-api-key ausente. Envie o header x-api-key com a chave de ingestão de erros do n8n.",
            });
        }
        if (recebida !== esperada) {
            return apiError(corsHeaders, {
                status: 401,
                code: "api_key_invalid",
                message: "Header x-api-key inválido — a chave enviada não confere com N8N_ERROR_INGEST_KEY.",
            });
        }

        // ── tamanho ────────────────────────────────────────────────────────
        // O corpo é lido como texto antes de virar JSON justamente para poder
        // recusar pelo tamanho: content-length pode não vir (chunked).
        const bruto = await req.text();
        const bytes = new TextEncoder().encode(bruto).length;
        if (bytes > LIMITE_BYTES) {
            return apiError(corsHeaders, {
                status: 413,
                code: "payload_too_large",
                message: `Corpo com ${bytes} bytes excede o limite de ${LIMITE_BYTES} bytes. Envie só o nó que falhou e a mensagem do erro — stack trace completo e dump de payload não cabem.`,
            });
        }
        if (!bruto.trim()) {
            return apiError(corsHeaders, {
                status: 400,
                code: "body_empty",
                message: 'Corpo vazio. Envie o JSON da falha: {"source":"error_trigger","workflow_id":"...","error_message":"..."}.',
            });
        }

        let body: Record<string, unknown>;
        try {
            const parsed = JSON.parse(bruto);
            if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "body_not_object",
                    message: "O corpo precisa ser um objeto JSON (não um array nem um valor solto).",
                    details: `Recebido: ${Array.isArray(parsed) ? "array" : typeof parsed}`,
                });
            }
            body = parsed as Record<string, unknown>;
        } catch (err) {
            return apiError(corsHeaders, {
                status: 400,
                code: "body_invalid_json",
                message: "O corpo não é um JSON válido. No n8n, use JSON no campo Body do nó HTTP Request (não Form-Data).",
                details: `${String((err as Error)?.message ?? err)} | recebido: ${bruto.slice(0, 200)}`,
            });
        }

        // ── validação mínima ───────────────────────────────────────────────
        const origem = String(body.source ?? "").trim();
        const fonteDb = FONTES[origem];
        if (!fonteDb) {
            return apiError(corsHeaders, {
                status: 400,
                code: "source_invalid",
                message: `Campo "source" inválido: "${origem || "(vazio)"}". Valores aceitos: ${Object.keys(FONTES).join(", ")}.`,
            });
        }

        const workflowId = String(body.workflow_id ?? "").trim();
        if (!workflowId) {
            return apiError(corsHeaders, {
                status: 400,
                code: "workflow_id_missing",
                message: 'Campo "workflow_id" obrigatório — é o que liga o erro à conta. No n8n use {{ $workflow.id }}.',
                details: `Campos recebidos: ${Object.keys(body).join(", ") || "(nenhum)"}`,
            });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const { data, error } = await supabase.rpc("incident_ingest", {
            p_payload: { ...body, source: fonteDb, workflow_id: workflowId },
        });

        if (error) {
            return apiError(corsHeaders, {
                status: 500,
                code: "ingest_failed",
                message: describeDbError("registrar o incidente vindo do n8n", error),
                details: JSON.stringify(error),
            });
        }

        // owner_id nulo não é erro, é aviso: o incidente foi gravado, mas sem
        // conta — quase sempre porque instances.workflow_code não foi gravado.
        const semConta = !data?.owner_id;

        return new Response(JSON.stringify({
            success: true,
            incident_id: data?.incident_id ?? null,
            event_id: data?.event_id ?? null,
            is_new: data?.is_new ?? false,
            component: data?.component ?? null,
            severity: data?.severidade_catalogo ?? null,
            tenant_warning: semConta
                ? `Nenhuma conta está vinculada ao workflow "${workflowId}". O incidente foi registrado sem dono. A resolução tenta, nesta ordem: instances.workflow_code, instances.workflow_id e ia_config.workflow_id.`
                : null,
        }), { headers: corsHeaders });
    } catch (err) {
        console.error("[n8n-error-ingest] erro inesperado:", err);
        return apiError(corsHeaders, {
            status: 500,
            code: "unexpected_error",
            message: "Erro inesperado ao registrar o incidente.",
            details: String((err as Error)?.message ?? err),
        });
    }
});
