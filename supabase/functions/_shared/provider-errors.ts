// provider-errors — quando quem quebrou nao fomos nos.
//
// Metade dos nossos "erros" e um terceiro fora do ar: a OpenAI sem credito, a
// Meta recusando o envio, a UAZAPI com a instancia caida, o Google Calendar
// devolvendo 401 porque o refresh token morreu. Esses casos tem duas
// propriedades que mudam como precisam ser registrados:
//
// 1. O MESMO defeito aparece em muitas functions. A OpenAI sem credito quebra
//    `ai-suggest-response`, `transcribe-audio`, `support-ai-chat`,
//    `conversation-summary-worker` e mais — e isso e UM problema, com UMA
//    providencia. Registrar por function daria dez incidentes dizendo a mesma
//    coisa e nenhum deles dizendo a coisa certa. Por isso o componente aqui e
//    do PROVEDOR (`openai:sem_credito`), nao da function; a function vai no
//    contexto, que e onde ela e util: para saber o alcance.
//
// 2. Muitos deles NAO viram resposta 5xx. O codigo pega o 429, cai num
//    fallback e responde 200 — do lado de fora parece que funcionou, e o
//    envelope `serveMonitored` nao ve nada. Um provedor caido durante horas
//    passa invisivel exatamente porque o tratamento de erro funcionou.
//
// O que se faz aqui e so classificar. Nao ha retry, nao ha circuit breaker:
// `fetchProvider` devolve a mesma coisa que `fetch` devolveria, inclusive o
// erro. Trocar `fetch(` por `fetchProvider(` nao pode mudar comportamento
// nenhum — se mudar, e bug meu.

import { reportIncident } from "./report-incident.ts";

/** Host -> nome curto do provedor. Host desconhecido nao e classificado. */
function provedorDoHost(url: string): string | null {
    let host: string;
    try {
        host = new URL(url).host.toLowerCase();
    } catch {
        return null;
    }
    if (host.endsWith("api.openai.com")) return "openai";
    if (host.endsWith("graph.facebook.com") || host.endsWith("graph.instagram.com")) return "meta";
    if (host.includes("uazapi")) return "uazapi";
    if (host.endsWith("generativelanguage.googleapis.com")) return "gemini";
    if (host.endsWith("googleapis.com") || host.endsWith("oauth2.googleapis.com")) return "google";
    if (host.endsWith("api.resend.com")) return "resend";
    if (host.endsWith("api.n8n.io") || host.endsWith("webhooks.clinvia.com.br")) return "n8n";
    return null;
}

/**
 * O 429 da OpenAI e ambiguo de proposito: pode ser excesso de chamada (passa
 * sozinho, nao e incidente de ninguem) ou fim do credito (para tudo e so
 * resolve com cartao). O corpo distingue os dois, e a diferenca vale um
 * componente proprio — `openai:sem_credito` ja esta no catalogo como CRITICA.
 */
function semCredito(corpo: string): boolean {
    const t = corpo.toLowerCase();
    return t.includes("insufficient_quota") ||
        t.includes("no credits remaining") ||
        t.includes("exceeded your current quota") ||
        t.includes("billing_hard_limit_reached");
}

interface Classificacao {
    component: string;
    motivo: string;
}

/**
 * O que MERECE incidente, e nada alem disso.
 *
 * 404 e 400 ficam de fora: sao quase sempre resposta correta do provedor a um
 * pedido nosso (contato que nao existe, template que nao aprovou) e entrariam
 * como centenas de linhas por semana dizendo que o sistema funciona. O que
 * entra e o que ninguem consegue resolver do lado de ca: credencial vencida
 * (401/403), limite (429) e provedor fora do ar (5xx).
 */
function classificar(provedor: string, status: number, corpo: string): Classificacao | null {
    if (provedor === "openai" && status === 429 && semCredito(corpo)) {
        return { component: "openai:sem_credito", motivo: "a conta da OpenAI ficou sem crédito" };
    }
    if (status === 401 || status === 403) {
        return {
            component: `${provedor}:credencial_recusada`,
            motivo: `o ${provedor} recusou a credencial (HTTP ${status}) — token vencido, revogado ou sem permissão`,
        };
    }
    if (status === 429) {
        return {
            component: `${provedor}:limite_de_uso`,
            motivo: `o ${provedor} recusou por limite de uso (HTTP 429)`,
        };
    }
    if (status >= 500) {
        return {
            component: `${provedor}:fora_do_ar`,
            motivo: `o ${provedor} respondeu ${status} — a falha é do lado dele`,
        };
    }
    return null;
}

/** Erro de rede/timeout: nao ha status, e a mensagem do runtime e o unico sinal. */
function classificarRede(provedor: string, err: unknown): Classificacao {
    const t = String((err as Error)?.message ?? err ?? "").toLowerCase();
    const ehTempo = t.includes("timed out") || t.includes("timeout") || t.includes("deadline");
    return {
        component: ehTempo ? `${provedor}:timeout` : `${provedor}:fora_do_ar`,
        motivo: ehTempo
            ? `a chamada ao ${provedor} estourou o tempo`
            : `não foi possível falar com o ${provedor}`,
    };
}

/** Rota estavel: host + caminho sem id, para dois erros iguais darem o mesmo fingerprint. */
function rotaDaUrl(url: string): string {
    try {
        const u = new URL(url);
        const caminho = u.pathname
            .replace(/\/\d{6,}/g, "/:id")
            .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "/:uuid");
        return `${u.host}${caminho}`;
    } catch {
        return "url_invalida";
    }
}

export interface ContextoProvedor {
    /** A requisicao que estava sendo atendida — e o que da a origem ao incidente. */
    request?: Request;
    /** Conta afetada, quando conhecida: e o que responde "quantos clientes isso pegou". */
    ownerId?: string | null;
    /** Nada de conteudo de paciente aqui. Ids e nomes de recurso, so. */
    context?: Record<string, unknown>;
}

/**
 * Substituto de `fetch` para chamada a provedor externo.
 *
 * Mesma assinatura, mesmo retorno, mesmas excecoes. A unica diferenca e que
 * uma resposta 401/403/429/5xx, ou uma falha de rede, viram incidente em nome
 * do PROVEDOR antes de voltar para quem chamou. Host que nao e de provedor
 * conhecido passa direto, sem custo nenhum.
 */
export async function fetchProvider(
    input: string | URL | Request,
    init?: RequestInit,
    ctx: ContextoProvedor = {},
): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const provedor = provedorDoHost(url);

    if (!provedor) return await fetch(input as RequestInfo, init);

    let res: Response;
    try {
        res = await fetch(input as RequestInfo, init);
    } catch (err) {
        const c = classificarRede(provedor, err);
        reportIncident({
            component: c.component,
            route: rotaDaUrl(url),
            error: err,
            message: `${c.motivo}: ${String((err as Error)?.message ?? err)}`,
            source: "integration",
            request: ctx.request,
            ownerId: ctx.ownerId,
            context: { provedor, ...ctx.context },
        });
        throw err;
    }

    if (res.ok) return res;

    // O corpo do erro e o que separa "sem credito" de "rapido demais". Ler uma
    // COPIA: quem chamou ainda vai ler o original, e um body ja consumido e
    // uma quebra que eu teria introduzido tentando monitorar.
    let corpo = "";
    try {
        corpo = (await res.clone().text()).slice(0, 800);
    } catch {
        corpo = "";
    }

    const c = classificar(provedor, res.status, corpo);
    if (c) {
        reportIncident({
            component: c.component,
            route: rotaDaUrl(url),
            httpCode: res.status,
            message: `${c.motivo}. Resposta: ${corpo || "(corpo vazio)"}`,
            source: "integration",
            request: ctx.request,
            ownerId: ctx.ownerId,
            context: { provedor, ...ctx.context },
        });
    }

    return res;
}
