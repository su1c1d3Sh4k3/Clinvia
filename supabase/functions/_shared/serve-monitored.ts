// serve-monitored — um `serve` que enxerga a propria falha.
//
// POR QUE ISTO EXISTE, e nao mais uma linha em cada catch:
//
// A varredura de 7 dias mostrou 268 respostas 5xx em producao e quase nenhuma
// no painel. Nao era falta de reporter: era falta de CHAMADA. Cada function tem
// o seu jeito de responder erro — `unexpectedErrorResponse`, um catch externo
// escrito a mao, um `return new Response(..., {status:500})` no meio do fluxo —
// e instrumentar os tres jeitos em 136 arquivos e o tipo de trabalho que nasce
// com furo e envelhece pior: o proximo `return 500` escrito daqui a um mes nao
// vai lembrar de reportar.
//
// Entao a leitura muda de lugar. Em vez de perguntar "este caminho reportou?",
// o envelope olha a RESPOSTA: status >= 500 saindo desta function e incidente,
// tenha vindo de onde tiver vindo. Caminho de erro novo ja nasce coberto, e
// nao existe caminho esquecido — so existe resposta.
//
// As tres regras do report-incident continuam valendo aqui: nao entra no
// caminho da resposta (a leitura do corpo acontece depois do `return`), nao
// lanca (o envelope nunca pode ser o motivo de uma function cair) e so reporta
// quem se declarou — o `component` e argumento obrigatorio.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { HEADER_JA_REPORTADO, reportIncident, setIncidentComponent } from "./report-incident.ts";
import { comRequisicao } from "./request-context.ts";

export { HEADER_JA_REPORTADO };

/** Corpo grande ou binario nao vira mensagem de alerta — nem e lido. */
const LIMITE_CORPO = 600;

function rotaDaRequisicao(req: Request): string {
    try {
        const p = new URL(req.url).pathname.replace(/\/+$/, "");
        const ultimo = p.slice(p.lastIndexOf("/") + 1) || "/";
        return `${req.method} ${ultimo}`;
    } catch {
        return req.method;
    }
}

/**
 * Le o corpo da resposta SEM tocar na que vai para o cliente.
 *
 * `clone()` tem que acontecer antes do `return` (depois o corpo ja pode ter
 * sido consumido), mas a LEITURA acontece no microtask — e por isso que o
 * cliente nao espera por ela. So texto/JSON: clonar um stream binario faria o
 * runtime bufferizar as duas pontas, e um PDF de 4 MB no caminho de erro e
 * exatamente o tipo de custo escondido que nao se aceita num monitor.
 */
function corpoLegivel(res: Response): Response | null {
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!ct.includes("json") && !ct.startsWith("text/")) return null;
    const tamanho = Number(res.headers.get("content-length") ?? "0");
    if (tamanho > 20_000) return null;
    try {
        return res.clone();
    } catch {
        return null;
    }
}

export type ManipuladorHttp = (req: Request) => Response | Promise<Response>;

/**
 * Envelopa o handler da function.
 *
 *     serveMonitored("api-scheduling", async (req) => { ... });
 *
 * Faz tres coisas, nesta ordem de importancia:
 *
 *   1. toda resposta 5xx vira incidente (salvo quem ja se declarou reportado);
 *   2. excecao que escapou do handler vira incidente E resposta 500 descritiva,
 *      em vez de derrubar o isolate e virar um 502 do gateway — 502 nao carrega
 *      mensagem nenhuma, e um erro sem mensagem no painel nao serve para nada;
 *   3. declara o componente para o `reportIncident` de dentro da function.
 */
export function serveMonitored(component: string, handler: ManipuladorHttp): void {
    setIncidentComponent(component);

    serve(async (req: Request) => {
        let res: Response;

        try {
            // O handler roda DENTRO do contexto: assim qualquer `reportIncident`
            // no fundo da pilha sabe de onde veio a requisicao sem que ninguem
            // tenha precisado carregar o `req` ate la.
            res = await comRequisicao(req, () => handler(req));
        } catch (error) {
            reportIncident({
                route: rotaDaRequisicao(req),
                httpCode: 500,
                error,
                request: req,
                context: { escapou_do_handler: true },
            });
            return new Response(
                JSON.stringify({
                    success: false,
                    error: "unexpected_error",
                    message: `A função ${component} encerrou com um erro não tratado: ${
                        String((error as Error)?.message ?? error ?? "").trim() || "erro sem mensagem"
                    }`,
                }),
                { status: 500, headers: { "Content-Type": "application/json" } },
            );
        }

        // Handler que devolveu algo que nao e Response: deixa estourar como
        // antes em vez de mascarar — mas registra, porque isso e sempre bug.
        if (!(res instanceof Response)) {
            reportIncident({
                route: rotaDaRequisicao(req),
                httpCode: 500,
                message: `A função ${component} devolveu ${typeof res} no lugar de uma Response.`,
                request: req,
            });
            return res as unknown as Response;
        }

        if (res.status >= 500 && !res.headers.get(HEADER_JA_REPORTADO)) {
            const rota = rotaDaRequisicao(req);
            const copia = corpoLegivel(res);

            if (!copia) {
                reportIncident({ route: rota, httpCode: res.status, request: req, message: `${component} respondeu ${res.status}.` });
            } else {
                queueMicrotask(() => {
                    copia.text()
                        .then((t) => {
                            reportIncident({
                                route: rota,
                                httpCode: res.status,
                                request: req,
                                message: `${component} respondeu ${res.status}: ${t.slice(0, LIMITE_CORPO)}`,
                            });
                        })
                        .catch(() => {
                            reportIncident({ route: rota, httpCode: res.status, request: req, message: `${component} respondeu ${res.status}.` });
                        });
                });
            }
        }

        return res;
    });
}
