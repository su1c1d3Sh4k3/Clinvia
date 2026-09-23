// report-incident — leva a falha de uma edge function para `incidents`.
//
// TRES REGRAS QUE NAO SE NEGOCIAM, porque um monitor que derruba o que monitora
// e pior do que nenhum monitor:
//
// 1. NUNCA entra no caminho da resposta. O envio sai num `queueMicrotask` sem
//    `await`: a resposta ao cliente e devolvida antes de o fetch acontecer.
// 2. NUNCA lanca. Todo erro do proprio reporter (rede, RPC fora, chave errada)
//    morre num `.catch()`. Se o monitoramento cair, o sistema continua — mas o
//    catch LOGA: um monitor que falha em silencio vira exatamente o tipo de
//    defeito que ele existe para cacar.
// 3. SO reporta quem se declarou. Sem `setIncidentComponent(...)` no topo do
//    modulo, `reportIncident` nao faz nada. Isso e de proposito: o bundler do
//    Deno inlina este arquivo em TODA function que importa `_shared`, e sem esse
//    portao qualquer redeploy futuro de uma function nao instrumentada comecaria
//    a despejar incidente sem nome no painel.
//
// Nao usa o supabase-js: `fetch` direto no endpoint da RPC. E uma dependencia
// menos no caminho de um codigo que precisa funcionar quando as coisas ja estao
// quebradas.

import { chaveDaRequisicao } from "./api-keys.ts";
import { requisicaoAtual } from "./request-context.ts";

/** Preenchido por `setIncidentComponent` no topo da function instrumentada. */
let componenteAtual: string | null = null;

/**
 * Marca posta na resposta por quem JA reportou o erro. O envelope
 * `serveMonitored` reporta toda resposta 5xx; quem ja chamou `reportIncident`
 * poe este header para nao contar duas vezes. Mora aqui, e nao no envelope,
 * para que `api-errors.ts` possa usa-la sem arrastar o servidor HTTP junto.
 */
export const HEADER_JA_REPORTADO = "x-incident-reported";

/**
 * Declara esta function como instrumentada. Chamar UMA vez, no escopo do modulo:
 *
 *     setIncidentComponent("api-scheduling");
 *
 * Constante por isolate — sem estado por requisicao, logo sem corrida entre
 * requisicoes concorrentes.
 */
export function setIncidentComponent(nome: string): void {
    componenteAtual = nome;
}

/** Lista FECHADA: o banco recusa (coage para `nao_identificada`) o que nao esta aqui. */
export type IncidentOrigem =
    | "ia_n8n"
    | "front"
    | "webhook_externo"
    | "cron"
    | "edge_interna"
    | "integracao_externa"
    | "nao_identificada";

const ORIGENS: readonly string[] = [
    "ia_n8n", "front", "webhook_externo", "cron",
    "edge_interna", "integracao_externa", "nao_identificada",
];

/**
 * Descobre quem chamou esta function.
 *
 * DECLARADA vence INFERIDA, sempre. O header `x-origin` e a unica fonte que nao
 * e palpite: quem o manda esta se identificando de proposito. Tudo o mais aqui
 * e leitura de indicio e sai com `inferida: true`, porque no dia em que a
 * inferencia estiver errada e preciso saber que era inferencia.
 *
 * A CHAVE DE API E DECLARACAO, NAO PALPITE — desde 23/09/2026. Antes havia uma
 * chave so (`SCHEDULING_API_KEY`) servindo n8n, chamada interna e terceiro ao
 * mesmo tempo, e por isso este arquivo se recusava a deduzir origem dela. Agora
 * ha uma chave POR ORIGEM (`_shared/api-keys.ts`): quem se autentica com a chave
 * do n8n E o n8n. A legada continua aceita e cai em `ia_n8n` por eliminacao —
 * marcada `inferida: true`, porque eliminacao ainda e deducao.
 */
export function origemDaRequisicao(
    req?: Request,
): { origem: IncidentOrigem; inferida: boolean } {
    if (!req) return { origem: "nao_identificada", inferida: true };

    const h = req.headers;

    // 1. Declaracao explicita.
    const declarada = (h.get("x-origin") ?? "").trim().toLowerCase();
    if (ORIGENS.includes(declarada)) {
        return { origem: declarada as IncidentOrigem, inferida: false };
    }

    // 2. A chave apresentada. Vem antes dos indicios porque e autenticacao: o
    //    chamador provou quem e, nao pareceu quem e.
    const chave = chaveDaRequisicao(req);
    if (chave) return { origem: chave.origem, inferida: !chave.declarada };

    // 3. Indicios, do mais conclusivo para o menos.
    //    A Meta e a UAZAPI assinam o corpo; so um webhook de terceiro faz isso.
    if (h.get("x-hub-signature-256") || h.get("x-hub-signature")) {
        return { origem: "webhook_externo", inferida: true };
    }
    //    O front e o unico que manda um JWT de usuario (3 partes, alg no header).
    const auth = h.get("authorization") ?? "";
    if (auth.startsWith("Bearer eyJ") && auth.split(".").length === 3) {
        return { origem: "front", inferida: true };
    }
    //    Navegador: so ele manda Origin/Referer de dominio nosso.
    const origin = h.get("origin") ?? h.get("referer") ?? "";
    if (/^https?:\/\/[^/]*clin[bv]ia\./i.test(origin)) {
        return { origem: "front", inferida: true };
    }

    return { origem: "nao_identificada", inferida: true };
}

export interface ReportIncidentInit {
    /** rota/acao que quebrou — e o que separa dois erros da mesma function */
    route?: string;
    httpCode?: number;
    /** o erro cru: Error, erro do supabase-js, ou texto */
    error?: unknown;
    /** texto ja montado, quando o chamador tem uma frase melhor que a do erro */
    message?: string;
    /** identidade da linha de origem — torna o registro idempotente */
    requestId?: string;
    ownerId?: string | null;
    /** contexto pequeno e SEM dado de paciente (o banco sanitiza de novo) */
    context?: Record<string, unknown>;
    source?: "edge_function" | "integration";
    /**
     * A requisicao que estava sendo atendida. Passar isto e o que permite dizer
     * se a falha veio da IA, do front ou de terceiro — sem ela a origem sai
     * `nao_identificada`, que e resultado valido mas nao ajuda ninguem.
     */
    request?: Request;
    /** Sobrepoe a leitura do header. Use quando o chamador e sabido (ex.: cron). */
    origem?: IncidentOrigem;
    /**
     * Sobrepoe o componente declarado. Existe para a falha que nao e DA
     * function e sim DE UM TERCEIRO que ela chamou: `openai:sem_credito` visto
     * por dez functions diferentes tem que virar UM incidente, nao dez. Quem
     * usa isto e o `fetchProvider`; no resto do codigo, deixe em branco.
     */
    component?: string;
}

/** So as 3 primeiras linhas: o resto do stack e ruido que nao cabe num alerta. */
function stackCurto(err: unknown): string | undefined {
    const bruto = (err as Error)?.stack;
    if (!bruto || typeof bruto !== "string") return undefined;
    return bruto.split("\n").slice(0, 3).join("\n");
}

function textoDoErro(err: unknown): string {
    if (!err) return "";
    const e = err as Record<string, unknown>;
    // erro do supabase-js/PostgREST: o `code` e o que permite ramificar depois
    // (e o que a regra do 42501 procura no lado do banco).
    const partes = [
        String(e.message ?? err ?? "").trim(),
        e.details ? String(e.details) : "",
        e.hint ? String(e.hint) : "",
        e.code ? `[${e.code}]` : "",
    ].filter(Boolean);
    return partes.join(" — ");
}

/**
 * Erro de ENTRADA: o chamador mandou um valor que o Postgres recusou pelo
 * formato (22P02, 22007, 22008, 23514). Nao e defeito nosso, entao nao pode
 * entrar como falha do componente e acordar ninguem.
 *
 * Mas tambem NAO pode sumir. `report: false` puro viraria cegueira, e foi
 * exatamente essa cegueira que deixou o bug do `appointment_id` viver de 16/09
 * a 23/09/2026: cada ocorrencia individual era irrelevante, o padrao era o
 * defeito.
 *
 * Por isso vai para uma familia PROPRIA de componente, `entrada:<function>`,
 * catalogada com `somente_painel = true`: conta, agrupa e aparece no painel, e
 * nunca vira mensagem sozinha. Quem grita e o detector de taxa
 * `entrada_invalida_scan`, que olha a REPETICAO e nao o evento.
 */
export function reportInputError(init: {
    /** codigo/rota do chamador (ex.: `cancel_appointment_failed`) */
    route?: string;
    /** SQLSTATE do Postgres — entra no agrupamento */
    sqlstate: string;
    /** o valor recusado / mensagem crua do banco, so para o contexto */
    detalhe?: string;
    request?: Request;
}): void {
    if (!componenteAtual) return;

    reportIncident({
        component: `entrada:${componenteAtual}`,
        route: `${init.route ?? "rota_nao_informada"}:${init.sqlstate}`,
        httpCode: 400,
        // Mensagem ESTAVEL de proposito. O valor recusado muda a cada chamada e,
        // se entrasse aqui, entraria no fingerprint — daria um incidente por
        // valor errado em vez de um por defeito, que e o oposto de contar.
        message: `entrada invalida [${init.sqlstate}] em ${init.route ?? "rota nao informada"}`,
        context: {
            sqlstate: init.sqlstate,
            detalhe: init.detalhe ? init.detalhe.slice(0, 300) : undefined,
        },
        request: init.request,
    });
}

/**
 * Registra a falha e devolve na hora. Nao da para `await` de proposito:
 * a assinatura e `void` para que um `await reportIncident(...)` distraido
 * nao segure a resposta.
 */
export function reportIncident(init: ReportIncidentInit): void {
    if (!componenteAtual) return;

    const url = Deno.env.get("SUPABASE_URL");
    const chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !chave) return;

    // `origem` passada na mao e declaracao (quem chamou e sabido no codigo);
    // vinda do header pode ser qualquer um dos dois. Sem `request` explicito,
    // usa a requisicao em curso — e o que salva os 77 `dbErrorResponse` que
    // moram em funcoes auxiliares sem acesso ao `req`.
    const req = init.request ?? requisicaoAtual();
    const org = init.origem
        ? { origem: init.origem, inferida: false }
        : origemDaRequisicao(req);

    const payload = {
        source: init.source ?? "edge_function",
        origem: org.origem,
        origem_inferida: org.inferida,
        component: init.component ?? componenteAtual,
        route: init.route ?? null,
        http_code: init.httpCode ?? null,
        error_name: (init.error as Error)?.name ?? null,
        error_message: init.message ?? textoDoErro(init.error),
        error_stack: stackCurto(init.error) ?? null,
        request_id: init.requestId ?? null,
        owner_id: init.ownerId ?? null,
        context: init.context ?? null,
        started_at: new Date().toISOString(),
    };

    // Fora do caminho da resposta, e sem `await` em nenhum ponto.
    queueMicrotask(() => {
        fetch(`${url}/rest/v1/rpc/incident_record`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: chave,
                Authorization: `Bearer ${chave}`,
            },
            body: JSON.stringify({ p_payload: payload }),
        })
            .then((r) => {
                // 200 nao basta: a RPC responde {ok:false} sem status de erro
                // quando recusa o payload, e isso some se nao for lido.
                if (!r.ok) {
                    console.error(
                        `[report-incident] ${componenteAtual}: RPC ${r.status}`,
                    );
                }
            })
            .catch((e) => {
                // Nao lanca — mas nao cala. Um monitor que falha em silencio e o
                // proprio defeito que ele existe para achar.
                console.error(
                    `[report-incident] ${componenteAtual}: nao registrou —`,
                    (e as Error)?.message ?? e,
                );
            });
    });
}
