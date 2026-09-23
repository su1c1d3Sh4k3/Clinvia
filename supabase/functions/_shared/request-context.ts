// request-context — a requisicao em curso, disponivel sem ser passada de mao em mao.
//
// POR QUE NAO PASSAR `req` NOS 77 LUGARES:
//
// `reportIncident` so sabe dizer de onde veio a falha (IA, front, webhook,
// cron) se receber a `Request`. Nos handlers isso e facil; dentro dos 77
// `dbErrorResponse(...)` que moram em funcoes auxiliares, nao — metade delas
// teria que ganhar um parametro `req` que nao usa para mais nada, e a outra
// metade e chamada por funcoes que tambem teriam. O resultado seria dezenas de
// assinaturas alteradas para carregar um valor que o runtime ja conhece, e o
// primeiro auxiliar escrito depois disso nasceria sem ele de novo.
//
// E o mesmo raciocinio do `serveMonitored`: em vez de instrumentar todo ponto
// de erro, muda-se o lugar onde a leitura acontece. O envelope roda o handler
// dentro de um contexto, e quem precisar da requisicao pergunta.
//
// SOBRE CONCORRENCIA: um isolate atende varias requisicoes ao mesmo tempo, e
// uma variavel de modulo daria a origem da requisicao ERRADA sempre que duas se
// cruzassem num `await` — origem errada com cara de certa e pior do que
// `nao_identificada`. `AsyncLocalStorage` nao tem esse problema: o valor
// acompanha a cadeia de continuacoes daquela requisicao especifica.
//
// SOBRE O FALLBACK: se `node:async_hooks` nao existir no runtime, isto vira um
// no-op e tudo volta a funcionar exatamente como antes — origem inferida pelo
// que foi passado na mao. Um utilitario de monitoramento nao pode ser motivo de
// function que nao sobe.

interface Armazem {
    run<T>(store: Request, fn: () => T): T;
    getStore(): Request | undefined;
}

let armazem: Armazem | null = null;

try {
    const { AsyncLocalStorage } = await import("node:async_hooks");
    armazem = new AsyncLocalStorage<Request>() as unknown as Armazem;
} catch (err) {
    console.warn("[request-context] AsyncLocalStorage indisponível; origem cairá no que for passado na mão:", (err as Error)?.message ?? err);
    armazem = null;
}

/** Roda `fn` com `req` como requisicao corrente. Usado so pelo `serveMonitored`. */
export function comRequisicao<T>(req: Request, fn: () => T): T {
    if (!armazem) return fn();
    return armazem.run(req, fn);
}

/** A requisicao em curso, quando ha uma. Nunca lanca. */
export function requisicaoAtual(): Request | undefined {
    try {
        return armazem?.getStore();
    } catch {
        return undefined;
    }
}
