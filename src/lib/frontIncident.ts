// Reporte de erro do front para o monitoramento.
//
// O buraco que isto fecha: até aqui, monitoramos o banco, os crons, as edge
// functions e os provedores. O front era o único lugar onde uma tela podia
// quebrar para um cliente inteiro e ninguém ficar sabendo — a descoberta
// dependia de alguém ligar para reclamar. Os casos Bruno/Aline/Lucilene
// (bundle antigo) e o inbox vazio do PGRST201 foram exatamente isso.
//
// TRÊS REGRAS, e elas mandam em cima de qualquer conveniência:
//
// 1. NUNCA quebrar nem atrasar o que estava acontecendo. Tudo é disparado e
//    esquecido, e o próprio erro do reporte é engolido. Um monitor que derruba
//    a tela que ele deveria vigiar é pior que monitor nenhum.
//
// 2. NUNCA mandar dado pessoal. Isto sai do navegador de um usuário real, onde
//    a URL costuma carregar nome e telefone. Por isso a rota vai MASCARADA e a
//    query string é descartada inteira — `/agendar?d=<base64>` carrega nome do
//    paciente, e mandar isso para o painel seria vazar dado de paciente para
//    resolver um bug de JavaScript.
//
// 3. Teto de volume. Uma tela que quebra em loop de render dispararia centenas
//    de reportes por minuto. O freio é duplo: aqui na sessão, e no servidor por
//    janela horária. O daqui sozinho não basta — cada aba é uma sessão.

const ROTA_INGEST = "frontend-error-ingest";

/** Teto por sessão (aba). Passou disso, o front cala a boca até recarregar. */
const MAX_POR_SESSAO = 8;
/** Mesma mensagem repetida na mesma sessão só vale uma vez. */
const jaVistos = new Set<string>();
let enviadosNaSessao = 0;

/**
 * Tira da rota tudo que pode identificar alguém.
 *
 * Mantém a forma do caminho, que é o que importa para agrupar ("quebrou em
 * /crm/:id", não "quebrou 40 vezes em 40 URLs diferentes"), e joga fora id,
 * telefone e a query string inteira.
 */
export function rotaSegura(href: string): string {
    try {
        const url = new URL(href, window.location.origin);
        return url.pathname
            .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
            .replace(/\/\d{4,}/g, "/:num")
            .slice(0, 120) || "/";
    } catch {
        return "(rota ilegivel)";
    }
}

/**
 * Família do navegador, não a user-agent inteira.
 *
 * A UA completa é uma impressão digital razoavelmente única; para achar
 * "quebra só no Safari" basta a família, e é só isso que atravessa a rede.
 */
function navegador(): string {
    const ua = navigator.userAgent;
    const nome = /Edg\//.test(ua) ? "Edge"
        : /OPR\//.test(ua) ? "Opera"
        : /Chrome\//.test(ua) ? "Chrome"
        : /Firefox\//.test(ua) ? "Firefox"
        : /Safari\//.test(ua) ? "Safari"
        : "outro";
    const so = /Windows/.test(ua) ? "Windows"
        : /Android/.test(ua) ? "Android"
        : /iPhone|iPad|iPod/.test(ua) ? "iOS"
        : /Mac OS X/.test(ua) ? "macOS"
        : /Linux/.test(ua) ? "Linux"
        : "outro";
    const pwa = window.matchMedia?.("(display-mode: standalone)")?.matches ? " PWA" : "";
    return `${nome}/${so}${pwa}`;
}

/**
 * Erros que NÃO são defeito nosso e por isso não entram no painel.
 *
 * Os dois primeiros grupos já eram tratados em silêncio no ErrorBoundary e no
 * main.tsx muito antes deste arquivo existir: extensão de navegador mexendo no
 * DOM, e chunk que sumiu porque saiu build novo (a página se recarrega
 * sozinha). Reportá-los seria encher o painel com o ruído que o código já
 * tinha decidido ignorar.
 */
function ruidoConhecido(msg: string, nome: string): boolean {
    return (
        msg.includes("removeChild") ||
        msg.includes("insertBefore") ||
        msg.includes("not a child of this node") ||
        msg.includes("dynamically imported module") ||
        msg.includes("Loading chunk") ||
        msg.includes("Loading CSS chunk") ||
        nome === "ChunkLoadError" ||
        // Erro de rede do próprio reporte ou de qualquer fetch: já é coberto
        // pelo monitoramento do lado do servidor, e offline não é incidente.
        msg === "Failed to fetch" ||
        msg === "NetworkError when attempting to fetch resource." ||
        // Ruído clássico de <script> de terceiro em outro domínio: chega sem
        // mensagem e sem pilha, não dá para agir.
        msg === "Script error."
    );
}

export interface ErroDoFront {
    /** De onde veio: render do React, promise sem catch, ou erro global. */
    tipo: "render" | "promise" | "global";
    erro: unknown;
    /** Nome do ErrorBoundary que pegou, quando houver. */
    onde?: string;
}

export function reportarErroDoFront({ tipo, erro, onde }: ErroDoFront): void {
    try {
        const e = erro as Error | undefined;
        const nome = String(e?.name ?? "Error").slice(0, 80);
        const mensagem = String(e?.message ?? erro ?? "").trim().slice(0, 400);

        if (!mensagem || ruidoConhecido(mensagem, nome)) return;

        const rota = rotaSegura(window.location.href);
        const chave = `${tipo}|${rota}|${nome}|${mensagem}`;
        if (jaVistos.has(chave)) return;
        if (enviadosNaSessao >= MAX_POR_SESSAO) return;
        jaVistos.add(chave);
        enviadosNaSessao += 1;

        const corpo = JSON.stringify({
            versao: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "desconhecida",
            tipo,
            rota,
            onde: onde ? String(onde).slice(0, 60) : undefined,
            navegador: navegador(),
            nome,
            mensagem,
            // A pilha de um bundle minificado não é dado pessoal, mas também
            // não é infinita: 2 KB cobrem os quadros que interessam.
            pilha: String(e?.stack ?? "").slice(0, 2000),
        });

        const url = `${(import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL
            ?? "https://swfshqvvbohnahdyndch.supabase.co"}/functions/v1/${ROTA_INGEST}`;

        // `keepalive` para o reporte sobreviver a uma navegação logo em seguida
        // — erro de render costuma vir junto com o usuário saindo da tela.
        void fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: corpo,
            keepalive: true,
        }).catch(() => {
            // Regra 1. Se o monitoramento cair, ele cai sozinho e em silêncio.
        });
    } catch {
        // Idem: nem a montagem do reporte pode escapar.
    }
}

/**
 * Liga os dois coletores globais. Chamado uma vez no main.tsx.
 *
 * O ErrorBoundary pega o que o React consegue capturar — que é só erro durante
 * render. Erro dentro de `onClick`, de `setTimeout` ou de promise sem `catch`
 * passa direto por ele, e é a maioria. Por isso os dois listeners abaixo não
 * são redundância: são a parte que o boundary não vê.
 */
export function instalarCapturaGlobalDeErros(): void {
    window.addEventListener("error", (ev) => {
        reportarErroDoFront({ tipo: "global", erro: ev.error ?? new Error(ev.message) });
    });

    window.addEventListener("unhandledrejection", (ev) => {
        reportarErroDoFront({ tipo: "promise", erro: ev.reason });
    });
}
