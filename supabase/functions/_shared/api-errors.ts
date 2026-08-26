/**
 * Erros padronizados das APIs públicas (n8n, link de agendamento).
 *
 * Regra: NENHUMA resposta de erro pode ser genérica. Toda falha diz o que
 * aconteceu, em qual etapa, e — quando o motivo é técnico — carrega o detalhe
 * do banco em `details` em vez de escondê-lo atrás de "Erro".
 *
 * Formato da resposta (compatível com os dois formatos que já existiam):
 *   {
 *     success: false,
 *     error:   "<texto legível>",   // quem lê `.error` (n8n, PublicBooking)
 *     message: "<mesmo texto>",     // quem lê `.message`
 *     code:    "<código estável>",  // para o n8n ramificar sem parsear texto
 *     details: "<detalhe técnico>"  // opcional, só quando existe
 *   }
 */

export interface ApiErrorInit {
    status: number;
    /** código estável, snake_case, para o chamador ramificar */
    code: string;
    /** texto legível — nunca "Erro", "Unauthorized" ou similar */
    message: string;
    /** detalhe técnico (mensagem do Postgres, corpo de resposta HTTP, ...) */
    details?: string;
    /** campos extras que o chamador já lia antes (ex.: deal_id) */
    extra?: Record<string, unknown>;
}

export function apiError(headers: Record<string, string>, init: ApiErrorInit): Response {
    const body: Record<string, unknown> = {
        success: false,
        error: init.message,
        message: init.message,
        code: init.code,
        ...(init.extra || {}),
    };
    if (init.details) body.details = init.details;

    console.error(`[api-error ${init.status} ${init.code}] ${init.message}${init.details ? ` | ${init.details}` : ""}`);

    return new Response(JSON.stringify(body), {
        status: init.status,
        headers: { ...headers, "Content-Type": "application/json" },
    });
}

/**
 * Descreve um erro do supabase-js sem perder o motivo real.
 * `operation` deve completar a frase "Falha ao ...": "gravar o agendamento".
 */
export function describeDbError(operation: string, error: unknown): string {
    const e = error as Record<string, unknown> | null;
    const raw = String(e?.message ?? e ?? "").trim();
    const extra = [e?.details, e?.hint].filter(Boolean).map(String).join(" — ");
    const code = e?.code ? ` [${e.code}]` : "";
    const detail = [raw, extra].filter(Boolean).join(" — ");
    return `Falha ao ${operation}: ${detail || "o banco recusou a operação sem detalhar o motivo"}${code}`;
}

/** Resposta 500 para erro de banco, já com o motivo real em `details`. */
export function dbErrorResponse(
    headers: Record<string, string>,
    code: string,
    operation: string,
    error: unknown,
): Response {
    return apiError(headers, {
        status: 500,
        code,
        message: describeDbError(operation, error),
        details: String((error as Record<string, unknown>)?.message ?? error ?? ""),
    });
}

/** Lança para o catch externo preservando status e código. */
export class ApiError extends Error {
    status: number;
    code: string;
    details?: string;
    constructor(init: ApiErrorInit) {
        super(init.message);
        this.status = init.status;
        this.code = init.code;
        this.details = init.details;
    }
}

/** Converte qualquer exceção do catch externo numa resposta descritiva. */
export function unexpectedErrorResponse(
    headers: Record<string, string>,
    context: string,
    error: unknown,
): Response {
    const e = error as Record<string, unknown> | null;

    // ApiError e ConversationResolutionError (duck-typing evita import circular):
    // já vêm com status/código/mensagem descritiva prontos.
    if (
        error instanceof ApiError ||
        (e && typeof e.status === "number" && typeof e.code === "string" && typeof e.message === "string")
    ) {
        return apiError(headers, {
            status: Number(e!.status),
            code: String(e!.code),
            message: String(e!.message),
            details: e!.details ? String(e!.details) : undefined,
        });
    }
    // erro do supabase-js/PostgREST vazando pelo catch: tem code/details/hint
    if (e && (e.code || e.details || e.hint) && e.message) {
        return apiError(headers, {
            status: 500,
            code: "database_error",
            message: describeDbError(context, error),
            details: String(e.message),
        });
    }

    const raw = String(e?.message ?? e ?? "").trim();
    return apiError(headers, {
        status: 500,
        code: "unexpected_error",
        message: raw
            ? `${context}: ${raw}`
            : `${context}: a função encerrou com um erro sem mensagem. Verifique os logs desta edge function no painel do Supabase.`,
        details: raw || undefined,
    });
}

/**
 * Valida o `x-api-key` contra `SCHEDULING_API_KEY`.
 * Distingue os 3 casos (segredo não configurado / header ausente / chave errada)
 * — "Unauthorized" seco não diz qual é o problema.
 */
export function requireApiKey(req: Request, headers: Record<string, string>): Response | null {
    const envApiKey = Deno.env.get("SCHEDULING_API_KEY");
    if (!envApiKey) {
        return apiError(headers, {
            status: 500,
            code: "api_key_not_configured",
            message: "O segredo SCHEDULING_API_KEY não está configurado nesta edge function. Configure-o em Supabase > Edge Functions > Secrets e faça o deploy novamente.",
        });
    }

    const apiKey = req.headers.get("x-api-key");
    if (!apiKey) {
        return apiError(headers, {
            status: 401,
            code: "api_key_missing",
            message: "Header x-api-key ausente. Envie o header x-api-key com a chave da API de agendamento.",
        });
    }
    if (apiKey !== envApiKey) {
        return apiError(headers, {
            status: 401,
            code: "api_key_invalid",
            message: "Header x-api-key inválido — a chave enviada não confere com a configurada nesta conta.",
        });
    }
    return null;
}

/** Lê o corpo JSON dizendo exatamente o que veio errado quando falha. */
export async function readJsonBody(
    req: Request,
    headers: Record<string, string>,
): Promise<{ body?: Record<string, any>; response?: Response }> {
    let raw: string;
    try {
        raw = await req.text();
    } catch (err) {
        return {
            response: apiError(headers, {
                status: 400,
                code: "body_unreadable",
                message: "Não foi possível ler o corpo da requisição.",
                details: String((err as Error)?.message ?? err),
            }),
        };
    }

    if (!raw.trim()) {
        return {
            response: apiError(headers, {
                status: 400,
                code: "body_empty",
                message: "Corpo da requisição vazio. Envie um JSON com os campos da ação (POST com Content-Type: application/json).",
            }),
        };
    }

    try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
            return {
                response: apiError(headers, {
                    status: 400,
                    code: "body_not_object",
                    message: "O corpo da requisição precisa ser um objeto JSON (ex.: {\"user_id\": \"...\"}).",
                    details: `Recebido: ${Array.isArray(parsed) ? "array" : typeof parsed}`,
                }),
            };
        }
        return { body: parsed };
    } catch (err) {
        return {
            response: apiError(headers, {
                status: 400,
                code: "body_invalid_json",
                message: "O corpo da requisição não é um JSON válido.",
                details: `${String((err as Error)?.message ?? err)} | recebido: ${raw.slice(0, 200)}`,
            }),
        };
    }
}

/** 400 listando exatamente quais campos faltaram. */
export function missingFields(
    headers: Record<string, string>,
    body: Record<string, any>,
    required: string[],
    hint?: string,
): Response | null {
    const missing = required.filter((f) => {
        const v = body?.[f];
        return v === undefined || v === null || (typeof v === "string" && !v.trim());
    });
    if (missing.length === 0) return null;

    return apiError(headers, {
        status: 400,
        code: "missing_fields",
        message: `Campo${missing.length > 1 ? "s" : ""} obrigatório${missing.length > 1 ? "s" : ""} ausente${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.${hint ? ` ${hint}` : ""}`,
        details: `Campos recebidos: ${Object.keys(body || {}).join(", ") || "(nenhum)"}`,
    });
}

/** 400 para action desconhecida, sempre enumerando as válidas. */
export function unknownAction(
    headers: Record<string, string>,
    action: unknown,
    valid: string[],
): Response {
    return apiError(headers, {
        status: 400,
        code: "unknown_action",
        message: `Ação ${action ? `"${action}"` : "não informada"} não existe nesta API. Ações válidas: ${valid.join(", ")}.`,
    });
}
