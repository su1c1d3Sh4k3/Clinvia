/**
 * Chave unica da sincronia com o Google Calendar — lado servidor.
 *
 * Fonte da verdade: `llm_platform_settings.google_calendar_enabled`.
 * Mesma celula que o front le pela RPC `public.google_calendar_enabled()`.
 * Uma linha vira os dois lados; nao existe segunda chave para esquecer.
 *
 * DUAS DECISOES QUE PARECEM DETALHE E NAO SAO:
 *
 * 1. O default em QUALQUER falha e DESLIGADO. Se a coluna sumir, se o banco
 *    nao responder, se a chave vier nula — fica desligado. Um recurso que se
 *    religa sozinho quando a leitura falha e pior que um recurso desligado.
 *
 * 2. A resposta de "desligado" e 200, NUNCA 5xx. `serveMonitored` relata
 *    >= 500, e `api-scheduling` relata qualquer resposta nao-ok da sincronia.
 *    Um 503 aqui faria o proprio desligamento virar incidente a cada chamada —
 *    supressao na origem virando ruido na saida, exatamente o contrario do
 *    que foi pedido.
 */

const TTL_MS = 5 * 60 * 1000;

let cache: { valor: boolean; ate: number } | null = null;

export async function googleCalendarLigado(): Promise<boolean> {
    if (cache && cache.ate > Date.now()) return cache.valor;

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !key) return false;

    let valor = false;
    try {
        const r = await fetch(
            `${url}/rest/v1/llm_platform_settings?select=google_calendar_enabled&limit=1`,
            { headers: { apikey: key, Authorization: `Bearer ${key}` } },
        );
        if (r.ok) {
            const linhas = await r.json();
            valor = Array.isArray(linhas) && linhas[0]?.google_calendar_enabled === true;
        }
    } catch {
        valor = false;
    }

    cache = { valor, ate: Date.now() + TTL_MS };
    return valor;
}

/** Resposta padrao de "recurso desligado": 200, para nao gerar incidente. */
export function respostaGoogleCalendarDesligado(
    headers: Record<string, string> = {},
): Response {
    return new Response(
        JSON.stringify({
            success: false,
            skipped: "google_calendar_desativado",
            error: "A sincronia com o Google Calendar esta temporariamente indisponivel.",
            message: "A sincronia com o Google Calendar esta temporariamente indisponivel.",
        }),
        { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
    );
}
