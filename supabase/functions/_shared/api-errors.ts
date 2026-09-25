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

import { chavesConfiguradas } from "./api-keys.ts";
import { HEADER_JA_REPORTADO, reportIncident, reportInputError } from "./report-incident.ts";

export interface ApiErrorInit {
    status: number;
    /** código estável, snake_case, para o chamador ramificar */
    code: string;
    /** texto legível — nunca "Erro", "Unauthorized" ou similar */
    message: string;
    /** detalhe técnico (mensagem do Postgres, corpo de resposta HTTP, ...) */
    details?: string;
    /**
     * Detalhe técnico que vai para o LOG e para o INCIDENTE, e **nunca** para o
     * corpo da resposta.
     *
     * Existe porque `details` só é seguro quando o chamador é o n8n — que é a
     * premissa deste arquivo. Numa function anônima (`verify_jwt = false`) ou
     * chamada pela tela do cliente, o texto cru do Postgres/Auth nomeia tabela,
     * coluna e policy para quem apenas sabe a URL.
     *
     * Sanitizar o corpo SEM este campo seria trocar vazamento por cegueira: o
     * `serveMonitored` monta a mensagem do incidente lendo o CORPO da resposta
     * 5xx, então um corpo limpo produziria um incidente sem motivo nenhum.
     * Quem usa `internalDetails` precisa de `report: true` junto — é ele que
     * carrega o motivo real para o painel e marca a resposta como já reportada.
     */
    internalDetails?: string;
    /** campos extras que o chamador já lia antes (ex.: deal_id) */
    extra?: Record<string, unknown>;
    /**
     * Abre incidente no monitoramento. Desligado por padrão: `apiError` é o
     * caminho do erro de VALIDAÇÃO do cliente (campo faltando, ação
     * desconhecida, chave errada) e reportar isso encheria o painel de ruído
     * que não é defeito nosso. Os dois caminhos que sempre reportam são
     * `dbErrorResponse` e `unexpectedErrorResponse`, abaixo.
     */
    report?: boolean;
    /**
     * A requisição sendo atendida. É o que permite dizer se a falha veio da IA,
     * do front ou de terceiro (header `x-origin`, ou inferência a partir dele).
     *
     * Opcional de propósito, e NÃO existe um "request atual" global: o isolate do
     * Deno atende requisições concorrentes intercaladas nos `await`, então uma
     * variável de módulo daria origem trocada entre dois chamadores. Sem este
     * campo a origem sai `nao_identificada`, que é resultado honesto.
     */
    request?: Request;
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

    const tecnico = [init.details, init.internalDetails].filter(Boolean).join(" | ");

    console.error(`[api-error ${init.status} ${init.code}] ${init.message}${tecnico ? ` | ${tecnico}` : ""}`);

    // Não bloqueia: reportIncident volta na hora e envia num microtask.
    if (init.report) {
        reportIncident({
            route: init.code,
            httpCode: init.status,
            message: [init.message, tecnico].filter(Boolean).join(" | "),
            request: init.request,
        });
    }

    // O envelope `serveMonitored` reporta toda resposta 5xx que sai da function.
    // Esta marca diz a ele que este erro já tem dono — sem ela o mesmo erro
    // entraria duas vezes e o `event_count`, que é o número usado para decidir
    // prioridade, sairia dobrado.
    const marca: Record<string, string> = init.report ? { [HEADER_JA_REPORTADO]: "1" } : {};

    return new Response(JSON.stringify(body), {
        status: init.status,
        headers: { ...headers, ...marca, "Content-Type": "application/json" },
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

/**
 * SQLSTATEs que só acontecem porque a ENTRADA está errada. LISTA FECHADA, e
 * fechada de propósito — decisão do user em 23/09/2026.
 *
 * O que está aqui são erros de *data exception*: o valor chegou com formato que
 * o Postgres não consegue nem interpretar. Não há como o nosso código produzir
 * isso sozinho a partir de entrada válida.
 *
 * O que NÃO está aqui, e não entra sem análise caso a caso:
 *   23503 (FK) e 23505 (unique). Às vezes é o chamador mandando um id que não
 *   existe; às vezes somos nós gravando duas vezes o que deveria ser único. Os
 *   dois casos têm o mesmo código e desfechos opostos — tratar como 400 esconde
 *   defeito nosso.
 *
 * RESSALVA CONHECIDA sobre 23514 (CHECK): ele também dispara quando somos NÓS
 * que calculamos um valor fora da regra — foi assim que o insert de
 * `skipped_severity` falhou em silêncio em 23/09. Por isso o 400 aqui nunca é
 * mudo: toda ocorrência é contada em `entrada:<function>` e a repetição vira
 * incidente pelo detector de taxa.
 */
const SQLSTATE_ENTRADA_INVALIDA: Record<string, string> = {
    "22P02": "um dos valores enviados não tem o formato que o banco espera (texto onde se espera um identificador UUID, um número ou um valor de lista)",
    "22007": "a data/hora enviada não está num formato que o banco reconheça",
    "22008": "a data/hora enviada está fora da faixa aceita",
    "23514": "um dos valores enviados viola uma regra de validação da tabela",
};

/**
 * Resposta para erro de banco, já com o motivo real em `details`.
 *
 * 500 quando o defeito é nosso; **400 quando o SQLSTATE prova que a entrada é
 * que estava errada** — nesse caso não abre incidente do componente, só conta
 * (ver `reportInputError`). A premissa antiga deste arquivo, "erro de banco é
 * sempre defeito nosso", era falsa e produziu incidente ALTA falso toda vez que
 * o agente do n8n mandou um rótulo humano onde a API pedia UUID.
 */
export function dbErrorResponse(
    headers: Record<string, string>,
    code: string,
    operation: string,
    error: unknown,
    request?: Request,
): Response {
    const e = error as Record<string, unknown> | null;
    const sqlstate = String(e?.code ?? "");
    const explicacao = SQLSTATE_ENTRADA_INVALIDA[sqlstate];
    const cru = String(e?.message ?? error ?? "");

    if (explicacao) {
        // Conta, agrupa, não acorda ninguém.
        reportInputError({ route: code, sqlstate, detalhe: cru, request });

        return apiError(headers, {
            status: 400,
            code,
            request,
            message: `Falha ao ${operation}: ${explicacao}. Corrija o valor e repita a chamada. Detalhe do banco: ${cru || "sem detalhe"} [${sqlstate}]`,
            details: cru || undefined,
            extra: { input_error: true, sqlstate },
        });
    }

    // Erro de banco que NÃO é de formato: defeito nosso (ou regressão de RLS).
    // O `error` cru vai junto para o reporter porque é dele que sai o `code` do
    // Postgres — é o `42501` ali dentro que aciona a regra de RLS no banco.
    reportIncident({ route: code, httpCode: 500, error, message: describeDbError(operation, error), request });

    return apiError(headers, {
        status: 500,
        code,
        request,
        message: describeDbError(operation, error),
        details: cru,
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
    request?: Request,
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
            request,
            // Só 5xx vira incidente: um ApiError 400 foi LANÇADO de propósito
            // para recusar entrada inválida do chamador, não é defeito nosso.
            report: Number(e!.status) >= 500,
        });
    }
    // erro do supabase-js/PostgREST vazando pelo catch: tem code/details/hint
    if (e && (e.code || e.details || e.hint) && e.message) {
        // Mesma lista fechada do `dbErrorResponse`: um 22P02 que escapou pelo
        // catch externo continua sendo entrada inválida, não defeito nosso.
        if (SQLSTATE_ENTRADA_INVALIDA[String(e.code ?? "")]) {
            return dbErrorResponse(headers, "database_error", context, error, request);
        }
        reportIncident({ route: "database_error", httpCode: 500, error, message: describeDbError(context, error), request });
        return apiError(headers, {
            status: 500,
            code: "database_error",
            request,
            message: describeDbError(context, error),
            details: String(e.message),
        });
    }

    const raw = String(e?.message ?? e ?? "").trim();
    // Exceção que chegou até o catch externo: é sempre bug. Reporta com stack.
    reportIncident({ route: "unexpected_error", httpCode: 500, error, message: `${context}: ${raw || "erro sem mensagem"}`, request });

    return apiError(headers, {
        status: 500,
        code: "unexpected_error",
        request,
        message: raw
            ? `${context}: ${raw}`
            : `${context}: a função encerrou com um erro sem mensagem. Verifique os logs desta edge function no painel do Supabase.`,
        details: raw || undefined,
    });
}

/**
 * Valida o `x-api-key` contra as chaves registradas em `_shared/api-keys.ts`
 * (uma por origem: n8n, cron, edge interna, integração; mais a legada
 * `SCHEDULING_API_KEY`, que continua aceita).
 *
 * Distingue os 3 casos (nenhum segredo configurado / header ausente / chave
 * errada) — "Unauthorized" seco não diz qual é o problema.
 */
export function requireApiKey(req: Request, headers: Record<string, string>): Response | null {
    const registro = chavesConfiguradas();
    if (registro.length === 0) {
        return apiError(headers, {
            status: 500,
            code: "api_key_not_configured",
            message: "Nenhuma chave de API está configurada nesta edge function. Configure API_KEY_N8N (ou a legada SCHEDULING_API_KEY) em Supabase > Edge Functions > Secrets e faça o deploy novamente.",
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
    if (!registro.some((c) => c.valor === apiKey)) {
        return apiError(headers, {
            status: 401,
            code: "api_key_invalid",
            message: "Header x-api-key inválido — a chave enviada não confere com nenhuma das configuradas.",
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
