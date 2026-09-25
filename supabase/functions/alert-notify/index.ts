// alert-notify — leva o incidente para o WhatsApp do Super Admin.
//
// POR QUE E UMA FUNCAO NOVA, E NAO O CAMINHO DE ENVIO NORMAL:
// meta-send-message resolve a instancia a partir de conversation_id, e
// evolution-send-message exige JWT de usuario para criar conversa. Usar o caminho
// normal criaria contato + conversa + card de CRM + ticket no inbox do tenant
// Bruno Admin A CADA ERRO da plataforma. Aqui o Graph e chamado direto
// (POST /{phone_number_id}/messages) com o token da instancia remetente.
// Zero contato, zero conversa, zero linha em `messages`. O rastro do envio fica
// em `incident_notifications`.
//
// FORMATO (23/09/2026): quatro blocos, nenhum vazio — o que o servico faz, o
// que falhou (ou o que foi DETECTADO, quando o componente e um detector e nao
// quebrou nada), a causa provavel e o que fazer. O alerta anterior saia com
// "falha em openai:daily_anomaly / causa: analise ainda nao feita / acao: abrir
// o painel e investigar": o nome do componente repetido tres vezes e nenhuma
// informacao. Cada bloco tem fonte propria e nenhuma delas e "invente":
//   o que faz    -> incident_component_catalog (tabela estatica, sem IA)
//   o que falhou -> incident_events, o evento BRUTO (mensagem, codigo, valores)
//   causa        -> incident-analyze; sem analise sai "análise indisponível"
//   o que fazer  -> IA, senao a acao padrao do catalogo
//
// SEGUNDA VIA (23/09/2026): critica/alta que o WhatsApp recusou sai por E-MAIL
// (Resend, `_shared/emails.ts`). Nunca em paralelo — so quando o WhatsApp ja
// falhou, porque alerta duplicado ensina a ignorar alerta. Media/baixa ficam de
// fora: elas ja viajam no resumo de 2 em 2 horas. O e-mail NAO zera a falha: o
// incidente continua na fila para ser retentado quando o canal voltar; o que ele
// garante e que ninguem ficou sem saber. Quem vigia o canal como um todo e a
// funcao `alert-channel-watch`.
//
// ORDEM DE ENVIO (corrigida em 24/09/2026): a JANELA DE 24h e consultada ANTES
// de enviar, em alert_recipients.last_inbound_at.
//   aberta  -> texto livre (gratuito e aceita \n, que parametro de template nao
//              aceita), com o template como plano B se a Meta recusar na hora.
//   fechada -> template direto. Os dois (sys_alerta_incidente_v2 e
//              sys_alerta_resumo_v2) estao APPROVED na WABA desde 22/09.
//
// POR QUE NAO DA PARA SO "TENTAR TEXTO LIVRE E VER SE FALHA": fora da janela a
// Meta responde HTTP 200 COM WAMID DE VERDADE e so depois derruba a mensagem,
// por webhook assincrono de status, com {"code":131047}. O OK sincrono nao e
// prova de entrega. Em 23-24/09 isso deixou o canal 19h mudo com o painel
// verde: 13 alertas gravados como 'sent' que nunca chegaram.
//
// A rede de seguranca do erro acima e a reconciliacao: meta-webhook casa o
// wamid pela RPC `alert_notification_status`, o 'sent' vira 'failed', o
// incidente volta para a fila e o last_inbound_at e zerado (na proxima o alerta
// ja sai como template). `delivered_at` passa a ser a unica prova de entrega.
//
// Acoes:
//   { action: "dispatch", limit?: 10 }  -> drena a fila de avisos (cron de 1 min)
//   { action: "notify",  incident_id }  -> alerta individual, um incidente so
//   { action: "summary", hours?: 2 }    -> resumo agrupado de media/baixa
//   { action: "test",    message? }     -> alerta ficticio, nao toca em incidents
//
// `dispatch` e a acao que faltava. Ate 23/09/2026 esta funcao so existia: nenhum
// cron a chamava e `notify` exige incident_id explicito no corpo, que ninguem
// fornecia. O incidente critico dos 182 resumos (22/09 23:33) foi gravado
// corretamente e nunca virou mensagem por causa disso.
//
// Autenticacao: service role key em `x-service-key` ou `Authorization: Bearer`.
// Nunca e chamada pelo navegador.

import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emailAlertaIncidente, sendEmail } from "../_shared/emails.ts";
import { fetchProvider } from "../_shared/provider-errors.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-service-key, x-origin",
    "Content-Type": "application/json; charset=utf-8",
};

const GRAPH_API = "https://graph.facebook.com/v22.0";
const PAINEL_URL = "https://app.clinbia.ai/admin?tab=alertas";

// v2 porque a categoria de um template e imutavel: as v1 foram registradas como
// MARKETING (a Meta reclassificou na criacao) e MARKETING esta sujeito a opt-out
// e a throttling por qualidade — ou seja, a Meta poderia engolir justamente o
// aviso de que o sistema caiu. As v2 nasceram UTILITY em 23/09/2026.
const TPL_INCIDENTE = "sys_alerta_incidente_v2";
const TPL_RESUMO = "sys_alerta_resumo_v2";

// v3 criados em 24/09/2026. O v2 e uma lista chapada de "rotulo: valor" — sem
// linha em branco, sem titulo de secao, e com dois blocos inteiros espremidos
// em {{3}}. Enquanto o texto livre era o caminho normal isso passava
// despercebido; desde a correcao de 24/09 o template e o caminho NORMAL (a
// janela de 24h so reabre se o destinatario responder), entao o layout DELE
// virou o layout do alerta. O v3 leva a hierarquia para o CORPO do template,
// que e o unico lugar onde a quebra de linha sobrevive: parametro nao aceita
// \n (ver sanitizeParam).
const TPL_INCIDENTE_V3 = "sys_alerta_incidente_v3";
const TPL_RESUMO_V3 = "sys_alerta_resumo_v3";

/**
 * v4, 24/09/2026. Titulo pedido por ele: "Componente | Origem da falha | Cliente
 * | Resolucao", para entender problema, impacto e solucao SO pelo titulo.
 *
 * Por que nome novo em vez de editar o v3: a Meta recusa edicao de template que
 * nao esteja REJEITADO (erro 2388003, "Apenas e possivel editar modelos de
 * mensagem caso estes tenham sido rejeitados"). Medido, nao suposto.
 */
const TPL_INCIDENTE_V4 = "sys_alerta_incidente_v4";
const TPL_LANG = "pt_BR";

/**
 * Codigos da Meta que significam "esse template nao esta disponivel" — e SO
 * esses. Qualquer outro erro e do envio, nao do template, e cair no v2 ali
 * esconderia a falha real.
 *   132001 nao existe nessa lingua · 132015 pausado · 132016 desabilitado
 */
const TPL_INDISPONIVEL = new Set(["132001", "132015", "132016"]);

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: corsHeaders });

// `src/integrations/supabase/types.ts` e vazio de proposito (nao ha tipos gerados
// do banco), entao o client fica destipado, como no resto das edge functions.
// deno-lint-ignore no-explicit-any
type Db = any;

type Severity = "critica" | "alta" | "media" | "baixa";

const SEV_RANK: Record<Severity, number> = { baixa: 1, media: 2, alta: 3, critica: 4 };
const SEV_LABEL: Record<Severity, string> = {
    critica: "🔴 CRITICO",
    alta: "🟠 ALTA",
    media: "🟡 MEDIA",
    baixa: "🔵 BAIXA",
};

/** Severidade que acorda alguem fora da janela de silencio do destinatario. */
const IGNORA_JANELA: Severity[] = ["critica", "alta"];

/** Severidade que, se o WhatsApp recusar, ainda sai por e-mail. */
const SEGUNDA_VIA: Severity[] = ["critica", "alta"];

/** Severidade que o teto por hora NAO segura.
 *
 *  REGRA DO DONO: nao existe teto de envio para critica e alta. Se derem 40
 *  criticos num dia, os 40 saem. Barulho se corta na ORIGEM (catalogo do
 *  componente, `somente_painel`, calibragem do cron), nunca na porta de saida.
 *  O que o teto ainda protege e o que ja e agregado por natureza — o resumo de
 *  2 em 2 horas e a rajada de media/baixa. */
const IGNORA_TETO: Severity[] = ["critica", "alta"];

type Recipient = {
    id: string;
    nome: string;
    telefone: string;
    /**
     * Segunda via. So e usada quando o WhatsApp NAO entregou — nunca em paralelo:
     * o WhatsApp acorda de madrugada, o e-mail nao, e alerta duplicado ensina a
     * ignorar alerta. Nulo aqui significa que o aviso desta pessoa morre junto
     * com o canal.
     */
    email: string | null;
    instance_id: string;
    min_severity: Severity;
    window_start: string;
    window_end: string;
    timezone: string;
    /**
     * Ultima mensagem RECEBIDA deste telefone — define a janela de 24h da Meta.
     * Mantido pelo meta-webhook (RPC alert_recipient_inbound) e zerado pela
     * reconciliacao quando a Meta devolve 131047.
     */
    last_inbound_at: string | null;
};

/**
 * Margem sobre as 24h da Meta. A janela conta a partir do horario que a META
 * registrou, que nao e exatamente o nosso `created_at`, e um alerta que sai aos
 * 23h59 corre o risco de chegar do outro lado como 131047. Meia hora de folga
 * custa um template de US$0,008 e evita o silencio.
 */
const JANELA_LIVRE_MS = 23.5 * 60 * 60 * 1000;

/**
 * A janela de 24h esta aberta? NULL (nunca respondeu, ou a Meta acabou de
 * recusar por 131047) conta como FECHADA — o padrao seguro e o template, que
 * funciona dentro E fora da janela.
 */
function janelaLivreAberta(r: Recipient): boolean {
    if (!r.last_inbound_at) return false;
    const t = new Date(r.last_inbound_at).getTime();
    if (isNaN(t)) return false;
    return Date.now() - t < JANELA_LIVRE_MS;
}

/** Colunas do destinatario — uma constante so, porque `dispatch` e `notify`
 *  carregam a mesma lista e esquecer `email` em um dos dois deixaria metade dos
 *  alertas sem segunda via, calado. */
const CAMPOS_DESTINATARIO =
    "id, nome, telefone, email, instance_id, min_severity, window_start, window_end, timezone, last_inbound_at";

type Sender = {
    phone_number_id: string;
    token: string;
};

/**
 * Parametro de template da Meta: uma linha, sem tabulacao e sem sequencia de 4+
 * espacos (a Meta recusa o envio com erro 132000 quando isso aparece).
 */
function sanitizeParam(value: unknown, max = 900): string {
    const s = String(value ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim();
    if (!s) return "-";
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function saoPaulo(d: Date): { data: string; hora: string; minutosDoDia: number } {
    // sv-SE devolve YYYY-MM-DD HH:mm — o truque de fuso ja usado em _shared/timezone.ts
    const s = d.toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const [data, hora] = s.split(" ");
    const [hh, mm] = hora.split(":").map(Number);
    return { data, hora: hora.slice(0, 5), minutosDoDia: hh * 60 + mm };
}

function ddmmHHmm(iso: string | null | undefined): string {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    const { data, hora } = saoPaulo(d);
    const [, m, dia] = data.split("-");
    return `${dia}/${m} ${hora}`;
}

function minutosDaHora(hhmm: string): number {
    const [hh, mm] = String(hhmm || "00:00").split(":").map(Number);
    return (hh || 0) * 60 + (mm || 0);
}

/** Janela do destinatario, avaliada no fuso dele. Janela invertida (22:00–06:00) cruza a meia-noite. */
function dentroDaJanela(r: Recipient, agora: Date): boolean {
    const s = agora.toLocaleString("sv-SE", { timeZone: r.timezone || "America/Sao_Paulo" });
    const [hh, mm] = s.split(" ")[1].split(":").map(Number);
    const atual = hh * 60 + mm;
    const ini = minutosDaHora(r.window_start);
    const fim = minutosDaHora(r.window_end);
    return ini <= fim ? atual >= ini && atual <= fim : atual >= ini || atual <= fim;
}

// ── Graph ────────────────────────────────────────────────────────────────────

type SendResult = {
    ok: boolean;
    wamid?: string;
    errorCode?: string;
    errorMessage?: string;
};

async function graphSend(sender: Sender, payload: Record<string, unknown>): Promise<SendResult> {
    try {
        const resp = await fetchProvider(`${GRAPH_API}/${sender.phone_number_id}/messages`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${sender.token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...payload }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data?.error) {
            const err = data?.error ?? {};
            return {
                ok: false,
                errorCode: String(err.code ?? resp.status),
                errorMessage: String(err.error_user_msg || err.message || `HTTP ${resp.status}`),
            };
        }
        return { ok: true, wamid: data?.messages?.[0]?.id };
    } catch (e) {
        return { ok: false, errorCode: "network", errorMessage: (e as Error).message };
    }
}

function textPayload(to: string, body: string) {
    return { to, type: "text", text: { preview_url: false, body } };
}

function templatePayload(to: string, name: string, params: string[]) {
    return {
        to,
        type: "template",
        template: {
            name,
            language: { code: TPL_LANG },
            components: [{
                type: "body",
                parameters: params.map((p) => ({ type: "text", text: sanitizeParam(p) })),
            }],
        },
    };
}

type EnvioTemplate = SendResult & { templateName: string };

/**
 * Tenta o v3 e, so se ele ainda nao estiver disponivel, cai no v2 aprovado.
 *
 * O teste de disponibilidade e o proprio erro da Meta, nao uma consulta de
 * status: enquanto o v3 estiver PENDING o alerta sai no v2 e, no minuto em que
 * a Meta aprovar, passa a sair no v3 sozinho — sem redeploy e sem depender de
 * `message_templates` estar sincronizada com a WABA.
 */
async function enviarTemplate(
    sender: Sender,
    to: string,
    candidatos: { name: string; params: string[] }[],
): Promise<EnvioTemplate> {
    let ultimo!: EnvioTemplate;
    for (const c of candidatos) {
        const r = await graphSend(sender, templatePayload(to, c.name, c.params));
        ultimo = { ...r, templateName: c.name };
        if (r.ok || !TPL_INDISPONIVEL.has(String(r.errorCode))) return ultimo;
    }
    // Todos indisponiveis: devolve o ultimo erro, que e o da reserva mais antiga
    // — a que deveria estar aprovada. Se nem ela responde, o problema nao e o
    // template.
    return ultimo;
}

// ── Montagem da mensagem ─────────────────────────────────────────────────────

type Alerta = {
    severidade: Severity;
    /**
     * servico  -> o componente QUEBROU. O bloco do meio e "O QUE FALHOU".
     * detector -> o componente FUNCIONOU e achou algo. O bloco vira "O QUE FOI
     *             DETECTADO". Sao coisas opostas e nao podem sair com o mesmo
     *             texto: em 23/09 um alerta anunciou "falha em
     *             openai:daily_anomaly" quando o detector de anomalia de custo
     *             tinha acabado de fazer exatamente o trabalho dele.
     */
    natureza: "servico" | "detector";
    componente: string;
    conta: string;
    ocorrencias: string;
    /**
     * De onde veio a chamada que quebrou. Linha propria na mensagem porque e a
     * primeira pergunta de quem le: "isso e a IA, o front ou terceiro?" — sem
     * ela o nome do componente sozinho nao separa um defeito nosso de uma
     * integracao de fora batendo errado na nossa porta.
     */
    origem: string;
    /**
     * Mesma origem em rotulo CURTO, para caber no titulo de 4 campos sem virar
     * a parede de texto que o titulo existe para evitar. "Webhook de terceiro
     * (Meta/UAZAPI/Instagram)" tem 43 caracteres e sozinho ja estoura a linha.
     */
    origemCurta: string;
    /**
     * Quem consegue consertar. Quarta parte do titulo, pedida por ele: "Claude
     * Code se voce conseguir resolver, humano se for algo que voce nao tem
     * acesso como o n8n".
     */
    resolucao: string;
    /** Catalogo estatico. Nunca vem da IA: e barato, nao falha e nao alucina. */
    oQueFaz: string;
    /** Erro BRUTO: mensagem real, codigo, valores. Nunca o nome do componente. */
    oQueFalhou: string;
    causa: string;
    acao: string;
    painel: string;
};

/**
 * Texto livre: quatro blocos, nenhum vazio. Passa dentro da janela de 24h, que e
 * o caminho normal — o template e plano B e nao tem espaco para esta estrutura.
 *
 * A regra que este layout existe para cumprir: quem le tem que entender o que
 * houve SEM abrir o painel. "Componente X falhou, abra o painel" e um lembrete
 * de que algo deu errado, nao um alerta.
 */
/**
 * O titulo de 4 campos: "Componente | Origem da falha | Cliente | Resolucao".
 * Fonte unica para o texto livre e para o template v4 — se cada caminho montar
 * o seu, eles divergem, e ja divergiram antes (a causa provavel saia com dois
 * textos diferentes em `dispatch` e `notify`).
 */
/**
 * O componente do n8n embute o nome do cliente ("n8n:FLUXO CLIENTE - PELE
 * DERMATOLOGIA (meta-123)"), que agora tem campo proprio no titulo. Repetido, o
 * titulo chega a 114 caracteres com o mesmo nome duas vezes — a parede de texto
 * que este titulo existe para evitar.
 *
 * Tira SO o nome duplicado e preserva o que esta entre parenteses: a instancia e
 * a chave para achar o incidente no painel depois, e encurtar a ponto de perde-la
 * trocaria uma leitura boa por uma busca impossivel.
 */
function componenteNoTitulo(a: Alerta): string {
    if (a.conta.length < 4 || !a.componente.includes(a.conta)) return a.componente;
    return a.componente
        .replace(a.conta, "")
        .replace(/\s*-\s*\(/, " (")
        .replace(/\s*-\s*$/, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

function tituloDoAlerta(a: Alerta): string {
    return [componenteNoTitulo(a), a.origemCurta, a.conta, a.resolucao].join(" | ");
}

function alertaTexto(a: Alerta): string {
    const tituloMeio = a.natureza === "detector" ? "O QUE FOI DETECTADO" : "O QUE FALHOU";
    return [
        `${SEV_LABEL[a.severidade]} — Alerta Clinbia`,
        // Titulo de 4 campos: componente, onde quebrou, quem sentiu, quem
        // conserta. Igual ao do template v4 de proposito — o texto livre e o
        // template sao o MESMO alerta por caminhos diferentes, e ja divergiram
        // uma vez.
        tituloDoAlerta(a),
        `Ocorrências: ${a.ocorrencias}`,
        ``,
        `O QUE ESSE SERVIÇO FAZ`,
        a.oQueFaz,
        ``,
        tituloMeio,
        a.oQueFalhou,
        ``,
        `CAUSA PROVÁVEL`,
        a.causa,
        ``,
        `O QUE FAZER`,
        a.acao,
        ``,
        `Painel: ${a.painel}`,
    ].join("\n");
}

/** Texto livre do resumo: os mesmos 3 campos do template, mas um por linha. */
function resumoTexto([periodo, total, destaques]: string[]): string {
    return [
        `🟡 Resumo do monitoramento — ${periodo}`,
        ``,
        `Incidentes: ${total}`,
        ``,
        ...destaques.split(" · ").map((d) => `• ${d}`),
        ``,
        `Painel: ${PAINEL_URL}`,
        ``,
        `Mensagem automática do monitoramento da plataforma.`,
    ].join("\n");
}

/**
 * Ordem das variaveis conferida na WABA em 22/09/2026 (corpo real do template,
 * que difere da §0.3 do plano — ali {{3}} juntava erro+contagem e {{6}} era a
 * origem provavel). Se o template for recriado, conferir de novo antes de mexer.
 *   {{1}} severidade · {{2}} componente · {{3}} erro · {{4}} ocorrencias
 *   {{5}} conta · {{6}} causa provavel · {{7}} o que fazer · {{8}} painel
 */
function alertaParams(a: Alerta): string[] {
    // O v2 tem 8 variaveis e nenhuma sobra para "o que esse servico faz" nem para
    // a origem, entao dois blocos se espremem em {{3}} e a origem cola na conta em
    // {{5}}. E exatamente isso que produz a parede de texto — resolvido no v3; o v2
    // fica so como reserva enquanto a Meta nao aprova o novo.
    const rotulo = a.natureza === "detector" ? "DETECTADO" : "FALHOU";
    return [
        SEV_LABEL[a.severidade],
        // O titulo de 4 campos entra AQUI, na variavel que o corpo aprovado
        // prefixa com "Componente:". Fica um rotulo torto ("Componente: x | y |
        // z | w"), e e de proposito: esperar a aprovacao do v4 para so entao
        // entregar o titulo deixaria ele sem o titulo por tempo indeterminado —
        // a Meta nao promete prazo. Rotulo torto hoje vale mais que rotulo certo
        // em data desconhecida; quando o v4 aprovar, este caminho para de ser
        // usado sozinho.
        tituloDoAlerta(a),
        `${a.oQueFaz} — ${rotulo}: ${a.oQueFalhou}`,
        a.ocorrencias,
        // A origem saiu daqui porque ja esta no titulo. Repetir gastaria a unica
        // linha que ainda diz de quem e a conta.
        a.conta,
        a.causa,
        a.acao,
        a.painel,
    ];
}

/**
 * v3: uma variavel por campo, nenhuma acumulando dois blocos, e os titulos de
 * secao ("O QUE ACONTECEU", "CAUSA PROVAVEL", ...) morando no corpo do
 * template. E a mesma estrutura do texto livre — a diferenca e que aqui ela
 * sobrevive a janela de 24h fechada.
 *   {{1}} severidade · {{2}} componente · {{3}} origem · {{4}} conta
 *   {{5}} ocorrencias · {{6}} o que faz · {{7}} o que aconteceu
 *   {{8}} causa · {{9}} acao · {{10}} painel
 */
function alertaParamsV3(a: Alerta): string[] {
    // A distincao servico/detector nao pode virar titulo fixo: "O QUE FALHOU"
    // num detector que funcionou seria o erro de 23/09 de volta.
    const rotulo = a.natureza === "detector" ? "Detectado" : "Falhou";
    return [
        SEV_LABEL[a.severidade],
        // O v3 ja tem linha propria para origem e para conta, entao aqui nao cabe
        // o titulo inteiro — repetiria dois dos quatro campos em linhas vizinhas.
        // So a `resolucao`, que e o campo que o v3 nao tem em lugar nenhum, sobe
        // para ca. O resultado carrega os 4 campos dele sem duplicar nada.
        `${componenteNoTitulo(a)} | ${a.resolucao}`,
        a.origemCurta,
        a.conta,
        a.ocorrencias,
        a.oQueFaz,
        `${rotulo}: ${a.oQueFalhou}`,
        a.causa,
        a.acao,
        a.painel,
    ];
}

/**
 * v4: o titulo de 4 campos ganha 4 variaveis proprias ({{2}}..{{5}}), e a linha
 * "Origem:" some do corpo porque a origem passou a morar no titulo.
 *   {{1}} severidade · {{2}} componente · {{3}} origem curta · {{4}} cliente
 *   {{5}} resolucao · {{6}} ocorrencias · {{7}} o que faz · {{8}} o que aconteceu
 *   {{9}} causa · {{10}} acao · {{11}} painel
 */
function alertaParamsV4(a: Alerta): string[] {
    const rotulo = a.natureza === "detector" ? "Detectado" : "Falhou";
    return [
        SEV_LABEL[a.severidade],
        componenteNoTitulo(a),
        a.origemCurta,
        a.conta,
        a.resolucao,
        a.ocorrencias,
        a.oQueFaz,
        `${rotulo}: ${a.oQueFalhou}`,
        a.causa,
        a.acao,
        a.painel,
    ];
}

/** v3 do resumo: {{1}} periodo · {{2}} incidentes · {{3}} destaques · {{4}} painel */
function resumoParamsV3([periodo, total, destaques]: string[]): string[] {
    return [periodo, total, destaques, PAINEL_URL];
}

/**
 * Melhor disponivel, na ordem: v4 (titulo de 4 campos + hierarquia), v3 (so
 * hierarquia) e v2 (lista chapada, mas APROVADO). Enquanto a Meta nao aprova os
 * novos o alerta sai no que houver, e sobe de degrau sozinho a cada aprovacao.
 */
function enviarTemplateIncidente(sender: Sender, to: string, a: Alerta) {
    return enviarTemplate(sender, to, [
        { name: TPL_INCIDENTE_V4, params: alertaParamsV4(a) },
        { name: TPL_INCIDENTE_V3, params: alertaParamsV3(a) },
        { name: TPL_INCIDENTE, params: alertaParams(a) },
    ]);
}

/**
 * Resumo de 2h: v3 com reserva no v2. NAO ganhou titulo de 4 campos de
 * proposito — ele agrega N incidentes de componentes, clientes e origens
 * diferentes, entao componente/cliente/resolucao nao tem valor unico.
 */
function enviarTemplateResumo(sender: Sender, to: string, params: string[]) {
    return enviarTemplate(sender, to, [
        { name: TPL_RESUMO_V3, params: resumoParamsV3(params) },
        { name: TPL_RESUMO, params },
    ]);
}

// ── Os quatro blocos ─────────────────────────────────────────────────────────

/**
 * Chave de contexto que so serve para o banco. Identificador interno nao cabe na
 * mensagem: "project_id=proj_D4cs..." nao diz nada para quem le no WhatsApp e
 * ainda ocupa o lugar do numero que importa. Quem precisar do id abre o painel,
 * que tem o evento inteiro.
 */
const CHAVE_INTERNA = /(^|_)(id|ids|uuid|ref|hash|token|wamid|request|execution)$/i;
/** Valor opaco: uuid, `proj_…`/`sk-…`/`org-…` e afins. Mesmo motivo. */
const VALOR_OPACO =
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(proj|org|sk|key|user|acct|asst|wamid)[-_][A-Za-z0-9_-]{6,})$/i;

/**
 * Valores envolvidos, tirados do `context` do evento. Sao eles que transformam
 * "gasto acima do esperado" em "US$ 13,76 contra media de US$ 2,27" — e so isso.
 */
function valoresDoContexto(ctx: unknown, max = 4): string {
    if (!ctx || typeof ctx !== "object" || Array.isArray(ctx)) return "";
    const pares: string[] = [];
    for (const [k, v] of Object.entries(ctx as Record<string, unknown>)) {
        if (pares.length >= max) break;
        if (v === null || typeof v === "object") continue;
        if (CHAVE_INTERNA.test(k)) continue;
        const s = String(v);
        if (!s || s.length > 120) continue;
        if (VALOR_OPACO.test(s)) continue;
        pares.push(`${k}=${s}`);
    }
    return pares.join(", ");
}

/**
 * Erro BRUTO do ultimo evento do incidente. E o bloco que o alerta de 23/09 nao
 * tinha: ele dizia "falha em openai:daily_anomaly", que e o nome do componente
 * repetido, nao o que aconteceu. A linha em incident_events sempre teve o texto
 * real — quem nao o lia era esta funcao.
 */
async function erroBruto(supabase: Db, incidentId: string | null): Promise<string | null> {
    if (!incidentId) return null;
    const { data, error } = await supabase
        .from("incident_events")
        .select("error_name, error_message, error_description, http_code, failed_node, context")
        .eq("incident_id", incidentId)
        .order("received_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error || !data) return null;

    const partes: string[] = [];
    const msg = data.error_message || data.error_description;
    if (msg) partes.push(String(msg));
    if (data.error_name && !String(msg ?? "").includes(data.error_name)) {
        partes.push(`tipo: ${data.error_name}`);
    }
    if (data.http_code) partes.push(`HTTP ${data.http_code}`);
    if (data.failed_node) partes.push(`nó: ${data.failed_node}`);
    const valores = valoresDoContexto(data.context);
    if (valores) partes.push(valores);

    const s = partes.join(" · ").trim();
    return s || null;
}

type Catalogo = {
    natureza: "servico" | "detector";
    oQueFaz: string;
    acaoPadrao: string | null;
    /**
     * Gravidade que vale enquanto a IA nao analisou. E a MESMA coluna que o banco
     * usa para rotear (`incident_severidade_efetiva`): se a mensagem mostrasse
     * outra coisa, o alerta diria "media" para algo que acordou o telefone como
     * critico.
     */
    severidadePadrao: Severity;
};

/**
 * "O QUE ESSE SERVICO FAZ" vem de tabela, nunca da IA: e barato, nunca falha e
 * nunca alucina. Componente fora do catalogo sai declarado como tal E abre um
 * incidente proprio — o buraco no catalogo tem que incomodar, senao fica.
 */
async function catalogoDoComponente(supabase: Db, componente: string): Promise<Catalogo> {
    const { data, error } = await supabase.rpc("incident_component_info", { p_component: componente });
    const row = Array.isArray(data) ? data[0] : data;

    // "Nao catalogado" e a AUSENCIA de linha, nao uma coluna: a funcao devolve
    // zero linhas quando o componente nao esta no catalogo. Ate 24/09 isso era
    // lido por uma coluna `catalogado` que valia sempre `true` — a re-emissao da
    // funcao em 20260924180000 a removeu, `row.catalogado` virou `undefined` e
    // TODO componente passou a ser tratado como fora do catalogo.
    if (error || !row) {
        await supabase.rpc("incident_record", {
            p_payload: {
                source: "db_job",
                component: "monitoramento:componente-nao-catalogado",
                route: componente,
                // Sem data no request_id de proposito: um aviso por componente,
                // para sempre. Repetir todo dia seria o mesmo ruido que este
                // sistema existe para remover.
                request_id: `componente-nao-catalogado:${componente}`,
                error_name: "componente_nao_catalogado",
                error_message:
                    `O componente "${componente}" disparou alerta sem linha em incident_component_catalog, `
                    + `entao o bloco "O QUE ESSE SERVICO FAZ" saiu vazio para quem recebeu.`,
                context: { componente },
            },
        }).then(
            () => {},
            (e: Error) => console.warn("[alert-notify] aviso de catalogo falhou:", e.message),
        );

        return {
            natureza: "servico",
            // Sem recado de desenvolvedor: o pedido de cadastro vive no
            // incidente 'monitoramento:componente-nao-catalogado' acima, que e
            // somente_painel e nunca chega ao WhatsApp. A mensagem de operacao
            // declara a lacuna e para.
            oQueFaz: "componente não catalogado",
            acaoPadrao: null,
            severidadePadrao: "media",
        };
    }

    return {
        natureza: row.natureza === "detector" ? "detector" : "servico",
        oQueFaz: row.descricao,
        acaoPadrao: row.acao_padrao ?? null,
        severidadePadrao: (row.severidade_padrao as Severity) ?? "media",
    };
}

// deno-lint-ignore no-explicit-any
type IncidenteRow = any;

/**
 * Rotulo humano da origem. Gemeo em pt-BR de `public.incident_origem_rotulo`,
 * que serve o painel; a versao do banco e sem acento (padrao dos arquivos de
 * migration) e esta mensagem vai para o WhatsApp de uma pessoa.
 *
 * `(inferida)` nao e detalhe de implementacao: e a diferenca entre "o n8n disse
 * que foi ele" e "deduzi pelo formato do evento". No dia em que a deducao
 * estiver errada, quem le precisa saber que era deducao.
 */
const ORIGEM_ROTULO: Record<string, string> = {
    ia_n8n: "IA (fluxo do n8n)",
    front: "Front (navegador do usuário)",
    webhook_externo: "Webhook de terceiro (Meta/UAZAPI/Instagram)",
    cron: "Rotina agendada (cron)",
    edge_interna: "Chamada interna da plataforma",
    integracao_externa: "Integração externa (provedor)",
    multiplas: "Múltiplas origens no mesmo incidente",
    nao_identificada: "Não identificada",
};

/**
 * Rotulo curto para o titulo. Os nomes sao os que ELE usou ao pedir o formato
 * ("front end, n8n, banco de dados, edge functions").
 *
 * FALTA DE PROPOSITO: nao existe "banco de dados" aqui porque o classificador
 * nunca emite esse valor — um erro de Postgres chega como `cron` ou
 * `edge_interna`, conforme quem chamou. Inventar a etiqueta faria o titulo
 * prometer uma distincao que o dado nao tem.
 */
const ORIGEM_CURTA: Record<string, string> = {
    ia_n8n: "n8n",
    front: "Front-end",
    webhook_externo: "Webhook externo",
    cron: "Cron",
    edge_interna: "Edge function",
    integracao_externa: "Integração externa",
    multiplas: "Múltiplas origens",
    nao_identificada: "Origem indefinida",
};

/**
 * Onde o conserto mora — e por isso quem consegue faze-lo.
 *
 * Derivado da ORIGEM, e nao de `ai_fix_system` x `ai_fix_n8n`: medido em 24/09,
 * dos 9 incidentes com origem `ia_n8n`, 7 tinham os DOIS campos preenchidos. A
 * IA escreve os dois quase sempre, entao como discriminador binario eles nao
 * servem.
 */
const RESOLUCAO: Record<string, string> = {
    // Codigo deste repositorio: edge function, cron, front. Eu alcanco.
    cron: "Claude Code",
    edge_interna: "Claude Code",
    front: "Claude Code",
    // O n8n so aceita PUT do workflow inteiro e recusa campos que os 9 fluxos
    // carregam — decisao ja fechada: os workflows vao a mao.
    ia_n8n: "Humano (n8n)",
    // Meta, UAZAPI, Instagram, OpenAI: o defeito esta do lado de la.
    webhook_externo: "Humano (provedor)",
    integracao_externa: "Humano (provedor)",
};

function resolucaoRotulo(origem: unknown): string {
    // `multiplas` e `nao_identificada` caem aqui de proposito: sem saber de onde
    // veio nao da para dizer quem conserta, e chutar "Claude Code" faria o
    // titulo mentir justamente no campo que ele criou para decidir se age.
    return RESOLUCAO[String(origem ?? "")] ?? "A definir";
}

function origemRotulo(origem: unknown, inferida: unknown): string {
    const base = ORIGEM_ROTULO[String(origem ?? "")] ?? "Não identificada";
    // "Nao identificada" ja diz que e palpite; repetir "(inferida)" ali so
    // alonga a linha sem acrescentar nada.
    return inferida && origem && origem !== "nao_identificada"
        ? `${base} (inferida)`
        : base;
}

/**
 * Fonte UNICA do alerta de incidente. `dispatch` e `notify` montavam a mensagem
 * cada um do seu jeito e por isso divergiam — a causa provavel dizia "ainda nao
 * feita" num e "ainda nao concluida" no outro.
 */
async function montarAlerta(
    supabase: Db,
    inc: IncidenteRow,
    ocorrencias: string,
): Promise<Alerta> {
    const [cat, bruto, conta] = await Promise.all([
        catalogoDoComponente(supabase, inc.component),
        erroBruto(supabase, inc.id),
        resolverConta(supabase, inc.owner_id, inc.affected_tenants, inc.component, inc.origem),
    ]);

    return {
        // Mesma regra do banco: a IA vence o catalogo, o catalogo vence o
        // silencio. Sem isto um incidente roteado como critico pela severidade
        // do catalogo chegaria escrito "MEDIA" no WhatsApp.
        severidade: (inc.ai_severity as Severity) ?? cat.severidadePadrao,
        natureza: cat.natureza,
        componente: inc.component,
        conta,
        ocorrencias,
        origem: origemRotulo(inc.origem, inc.origem_inferida),
        // O "(inferida)" acompanha o rotulo curto tambem: 39 de 41 incidentes da
        // serie tem origem deduzida, e quem le o titulo precisa saber que a
        // atribuicao — e portanto o campo Resolucao — e palpite.
        origemCurta: (ORIGEM_CURTA[String(inc.origem ?? "")] ?? "Origem indefinida")
            + (inc.origem_inferida && inc.origem && inc.origem !== "nao_identificada"
                ? " (inferida)"
                : ""),
        resolucao: resolucaoRotulo(inc.origem),
        oQueFaz: cat.oQueFaz,
        // O bruto vem primeiro: o resumo da IA e util, mas e parafrase. Quem vai
        // consertar precisa da mensagem literal, do codigo e dos valores.
        oQueFalhou: bruto
            ?? inc.ai_summary
            ?? `o evento bruto de ${inc.component} chegou sem mensagem de erro — `
                + `a captura desse caminho precisa ser corrigida na origem`,
        causa: inc.ai_probable_cause
            ? `${inc.ai_probable_cause}${inc.ai_origin ? ` — ${inc.ai_origin}` : ""}`
            : (inc.analyzed_at ? "a análise não apontou causa" : "análise indisponível"),
        // Ordem: o que a IA descobriu para ESTE erro, depois a acao padrao do
        // catalogo. "Abrir o painel e investigar" nao e acao — so entra quando
        // nem a IA nem o catalogo tem o que dizer, e ai diz por onde comecar.
        acao: inc.ai_fix_system
            || inc.ai_fix_n8n
            || cat.acaoPadrao
            || "sem ação catalogada: comece pelo erro bruto acima e pelo histórico do componente no painel",
        painel: `${PAINEL_URL}&i=${inc.id}`,
    };
}

// ── Envio com registro ───────────────────────────────────────────────────────

async function enviarAlerta(
    supabase: Db,
    sender: Sender,
    r: Recipient,
    a: Alerta,
    incidentId: string | null,
    kind: "individual" | "resumo" | "recorrencia" | "rajada",
): Promise<SendResult & { via: "texto" | "template" | null }> {
    const registrar = async (
        status: string,
        via: "texto" | "template" | null,
        res?: SendResult,
        // Qual template de fato saiu — v3 ou a reserva v2. Gravar o nome fixo
        // deixaria o log mentindo justamente sobre o layout que ele recebeu.
        templateName?: string,
    ) => {
        await supabase.from("incident_notifications").insert({
            incident_id: incidentId,
            recipient_id: r.id,
            kind,
            status,
            template_name: via === "template" ? (templateName ?? TPL_INCIDENTE) : null,
            wamid: res?.wamid ?? null,
            error_code: res?.errorCode ?? null,
            error_message: res?.errorMessage ?? null,
        });
    };

    // A ORDEM E A CORRECAO DE 24/09/2026. Antes o texto livre vinha sempre
    // primeiro e o template era plano B "se falhar". So que fora da janela de
    // 24h a Meta NAO falha na hora: responde 200 com wamid de verdade e derruba
    // a mensagem depois, por webhook assincrono (131047). `livre.ok` ficava
    // verdadeiro, o template nunca era tentado, a segunda via por e-mail
    // tambem nao — e o telefone ficou 19h mudo com o painel verde.
    //
    // Agora a janela e consultada ANTES de enviar. Fechada = template direto,
    // que esta APROVADO na WABA e entrega dentro e fora da janela.
    const aberta = janelaLivreAberta(r);

    if (aberta) {
        const livre = await graphSend(sender, textPayload(r.telefone, alertaTexto(a)));
        if (livre.ok) {
            await registrar("sent", "texto", livre);
            return { ...livre, via: "texto" };
        }
        const tpl = await enviarTemplateIncidente(sender, r.telefone, a);
        if (tpl.ok) {
            await registrar("sent", "template", tpl, tpl.templateName);
            return { ...tpl, via: "template" };
        }
        // Guarda os DOIS motivos: sem o erro do texto livre nao da para saber se a
        // janela fechou ou se o token/numero e que estao errados.
        const combinado: SendResult = {
            ok: false,
            errorCode: tpl.errorCode,
            errorMessage:
                `template: ${tpl.errorMessage} | texto livre: ${livre.errorCode} ${livre.errorMessage}`,
        };
        await registrar("failed", "template", combinado, tpl.templateName);
        return { ...combinado, via: null };
    }

    const tpl = await enviarTemplateIncidente(sender, r.telefone, a);
    if (tpl.ok) {
        await registrar("sent", "template", tpl, tpl.templateName);
        return { ...tpl, via: "template" };
    }
    // Nada de tentar texto livre aqui: fora da janela ele seria aceito com 200 e
    // morreria calado, gravando um 'sent' falso por cima da falha real.
    const fora: SendResult = {
        ok: false,
        errorCode: tpl.errorCode,
        errorMessage: `template (janela de 24h fechada): ${tpl.errorMessage}`,
    };
    await registrar("failed", "template", fora, tpl.templateName);
    return { ...fora, via: null };
}

/**
 * Segunda via: o alerta que o WhatsApp recusou sai por e-mail.
 *
 * So vale para critica/alta. Media e baixa ja viajam no resumo de 2 em 2 horas;
 * mandar e-mail delas encheria a caixa de entrada de coisa que pode esperar, e
 * caixa cheia e a forma mais rapida de o alerta virar ruido ignorado.
 *
 * NUNCA lanca: o e-mail e o plano B: se ele tambem falhar, o que nao pode
 * acontecer e derrubar o laco e deixar os outros destinatarios sem tentativa.
 */
async function segundaViaEmail(
    supabase: Db,
    r: Recipient,
    a: Alerta,
    incidentId: string | null,
    kind: "individual" | "resumo" | "recorrencia" | "rajada",
    motivoDaFalha: string,
): Promise<boolean> {
    if (!SEGUNDA_VIA.includes(a.severidade)) return false;
    const para = (r.email ?? "").trim();
    if (!para) return false;

    let ok = false;
    let erro: string | null = null;
    try {
        const mail = emailAlertaIncidente({
            severidade: a.severidade,
            natureza: a.natureza,
            componente: a.componente,
            conta: a.conta,
            ocorrencias: a.ocorrencias,
            origem: a.origem,
            o_que_faz: a.oQueFaz,
            o_que_falhou: a.oQueFalhou,
            causa: a.causa,
            acao: a.acao,
            painel: a.painel,
            motivo_email: `O WhatsApp de alertas não entregou esta mensagem (${motivoDaFalha}).`,
            destinatario: r.nome,
        });
        const { id } = await sendEmail({ to: para, ...mail });
        ok = true;
        console.log(`[alert-notify] segunda via por e-mail para ${para} (${id})`);
    } catch (e) {
        erro = (e as Error).message;
        console.error(`[alert-notify] segunda via falhou para ${para}:`, erro);
    }

    await supabase.from("incident_notifications").insert({
        incident_id: incidentId,
        recipient_id: r.id,
        kind,
        via: "email",
        status: ok ? "sent" : "failed",
        error_code: ok ? null : "email_falhou",
        error_message: ok ? `WhatsApp recusou: ${motivoDaFalha}` : erro,
    });

    return ok;
}

// ── Destinatarios e remetente ────────────────────────────────────────────────

async function carregarSender(
    supabase: Db,
    instanceId: string,
): Promise<Sender | null> {
    const { data, error } = await supabase
        .from("instances")
        .select("meta_phone_number_id, meta_access_token")
        .eq("id", instanceId)
        .maybeSingle();
    if (error) throw new Error(`instancia remetente: ${error.message}`);
    if (!data?.meta_phone_number_id || !data?.meta_access_token) return null;
    return { phone_number_id: data.meta_phone_number_id, token: data.meta_access_token };
}

async function estourouORateLimit(
    supabase: Db,
    recipientId: string,
    teto: number,
): Promise<boolean> {
    const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
        .from("incident_notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", recipientId)
        .eq("status", "sent")
        .gte("sent_at", desde);
    if (error) throw new Error(`rate limit: ${error.message}`);
    return (count ?? 0) >= teto;
}

/** Nome da empresa de um owner, ou null se o perfil nao tem nome nenhum. */
async function nomeDaEmpresa(supabase: Db, ownerId: string): Promise<string | null> {
    const { data: p } = await supabase
        .from("profiles")
        .select("company_name, full_name")
        .eq("id", ownerId)
        .maybeSingle();
    return p?.company_name || p?.full_name || null;
}

/**
 * Ultimo recurso antes de desistir do campo Cliente: o componente do incidente do
 * n8n carrega a instancia entre parenteses — "n8n:FLUXO CLIENTE - X (meta-123)" ou
 * "... (pelemaceio - INSTAGRAM)". Medido em 24/09: dos incidentes `n8n:` com
 * parenteses, os de WhatsApp casam em `instances.instance_name` e os de Direct em
 * `instagram_instances.account_name` depois de tirar o sufixo " - INSTAGRAM".
 *
 * Vale a consulta porque e exatamente a familia de incidente que NAO tem owner_id
 * gravado e que mais aparece — sem isto o campo Cliente fica cego justo onde ele
 * tem dono conhecido.
 */
async function contaPeloComponente(supabase: Db, componente: string): Promise<string | null> {
    const m = componente.match(/\(([^)]+)\)\s*$/);
    if (!m) return null;
    const alvo = m[1].trim();

    const { data: inst } = await supabase
        .from("instances")
        .select("user_id")
        .eq("instance_name", alvo)
        .maybeSingle();
    if (inst?.user_id) return await nomeDaEmpresa(supabase, inst.user_id);

    const conta = alvo.replace(/\s*-\s*INSTAGRAM$/i, "").trim();
    const { data: ig } = await supabase
        .from("instagram_instances")
        .select("user_id")
        .eq("account_name", conta)
        .maybeSingle();
    if (ig?.user_id) return await nomeDaEmpresa(supabase, ig.user_id);

    return null;
}

/**
 * Origens cujo defeito mora em codigo/rotina compartilhada: quando nao ha dono,
 * o certo e mesmo dizer "Todos os clientes". Fora daqui, a ausencia de dono NAO
 * significa que todo mundo foi afetado — significa que nao sabemos de quem e.
 */
const ORIGEM_GLOBAL = new Set(["cron", "front"]);

/** Nome da conta afetada, do jeito que aparece na mensagem. */
async function resolverConta(
    supabase: Db,
    ownerId: string | null,
    afetados: string[] | null,
    componente: string,
    origem: unknown,
): Promise<string> {
    if (ownerId) {
        return (await nomeDaEmpresa(supabase, ownerId)) ?? "Conta não identificada";
    }
    if (Array.isArray(afetados) && afetados.length > 1) {
        return `${afetados.length} contas afetadas`;
    }
    // Um tenant afetado e UMA conta, e nao "geral". Antes caia no mesmo ramo do
    // cron e era anunciado como "Todos os clientes" — o campo que ele criou para
    // medir impacto era justamente o que exagerava o impacto.
    if (Array.isArray(afetados) && afetados.length === 1) {
        return (await nomeDaEmpresa(supabase, afetados[0])) ?? "Conta não identificada";
    }

    const doComponente = await contaPeloComponente(supabase, componente);
    if (doComponente) return doComponente;

    // Medido em 24/09: 44 dos 50 incidentes da base nao tem dono NEM tenant
    // afetado, e entre eles ha `api-public-booking`, `instagram` e
    // `delivery-automation-worker`, que sao de UM cliente. Carimbar "Todos os
    // clientes" neles faria o titulo mentir no campo de impacto. Por isso o
    // "todos" dele fica restrito a origem de codigo/rotina compartilhada.
    return ORIGEM_GLOBAL.has(String(origem ?? "")) ? "Todos os clientes" : "Conta não identificada";
}

type Espalhamento = {
    enviados: number;
    /**
     * Destinatarios que passaram no filtro de severidade minima. Zero aqui nao e
     * falha: e a decisao de que ninguem precisa saber deste incidente — e por isso
     * o despachante o encerra em vez de tentar de novo para sempre.
     */
    elegiveis: number;
    resultados: Record<string, unknown>[];
    /** Motivo consolidado quando NINGUEM recebeu — e o que vai para notify_last_error. */
    erro: string | null;
};

/**
 * Manda um alerta para todos os destinatarios elegiveis.
 * Extraida do handler porque `dispatch` roda este mesmo laco N vezes, uma por
 * incidente da fila — e o laco carrega as regras de severidade minima, janela
 * de silencio e teto por hora, que nao podem divergir entre as acoes.
 */
async function espalhar(
    supabase: Db,
    recipients: Recipient[],
    alerta: Alerta,
    incidentId: string | null,
    kind: "individual" | "resumo" | "recorrencia" | "rajada",
    teto: number,
    resumoParams: string[] | null,
    emailLigado: boolean,
): Promise<Espalhamento> {
    const agora = new Date();
    const resultados: Record<string, unknown>[] = [];
    const motivos: string[] = [];
    let enviados = 0;
    let elegiveis = 0;

    /** O e-mail salva o aviso, mas nao apaga a falha: `enviados` continua
     *  contando so o WhatsApp para que o incidente seja retentado quando o canal
     *  voltar. O que o e-mail garante e que ninguem ficou sem saber. */
    const tentarEmail = async (r: Recipient, a: Alerta, motivo: string) => {
        if (!emailLigado || resumoParams) return false;
        return await segundaViaEmail(supabase, r, a, incidentId, kind, motivo);
    };

    for (const r of recipients) {
        if (SEV_RANK[alerta.severidade] < SEV_RANK[r.min_severity]) {
            resultados.push({ destinatario: r.nome, status: "abaixo_da_severidade_minima" });
            continue;
        }
        elegiveis += 1;

        if (!IGNORA_JANELA.includes(alerta.severidade) && !dentroDaJanela(r, agora)) {
            await supabase.from("incident_notifications").insert({
                incident_id: incidentId, recipient_id: r.id, kind, status: "skipped_window",
            });
            resultados.push({ destinatario: r.nome, status: "skipped_window" });
            continue;
        }

        if (
            !IGNORA_TETO.includes(alerta.severidade) &&
            await estourouORateLimit(supabase, r.id, teto)
        ) {
            await supabase.from("incident_notifications").insert({
                incident_id: incidentId, recipient_id: r.id, kind, status: "skipped_ratelimit",
            });
            resultados.push({ destinatario: r.nome, status: "skipped_ratelimit" });
            continue;
        }

        const sender = await carregarSender(supabase, r.instance_id);
        if (!sender) {
            await supabase.from("incident_notifications").insert({
                incident_id: incidentId, recipient_id: r.id, kind, status: "failed",
                error_code: "sender_sem_token",
                error_message: "instância remetente sem meta_phone_number_id ou meta_access_token",
            });
            const porEmail = await tentarEmail(r, alerta, "instância remetente sem token");
            resultados.push({
                destinatario: r.nome, status: "failed", motivo: "sender_sem_token",
                segunda_via: porEmail ? "email_enviado" : null,
            });
            motivos.push(
                `${r.nome}: instância remetente sem token${porEmail ? " (avisado por e-mail)" : ""}`,
            );
            continue;
        }

        let res: SendResult & { via: "texto" | "template" | null };
        if (resumoParams) {
            // Qual template de fato saiu — v3 ou a reserva v2. Sem isso o log
            // mentiria justamente sobre o layout que chegou no telefone dele.
            let templateEnviado: string | null = null;
            // Mesma correcao de enviarAlerta: fora da janela de 24h o texto
            // livre e aceito com 200 e derrubado depois. O resumo de 2 em 2
            // horas foi metade dos alertas perdidos em 23-24/09.
            if (!janelaLivreAberta(r)) {
                const tpl = await enviarTemplateResumo(sender, r.telefone, resumoParams);
                templateEnviado = tpl.templateName;
                res = tpl.ok ? { ...tpl, via: "template" } : {
                    ok: false,
                    errorCode: tpl.errorCode,
                    errorMessage: `template (janela de 24h fechada): ${tpl.errorMessage}`,
                    via: null,
                };
            } else {
                const livre = await graphSend(sender, textPayload(r.telefone, resumoTexto(resumoParams)));
                if (livre.ok) {
                    res = { ...livre, via: "texto" };
                } else {
                    const tpl = await enviarTemplateResumo(sender, r.telefone, resumoParams);
                    templateEnviado = tpl.templateName;
                    res = tpl.ok ? { ...tpl, via: "template" } : {
                        ok: false,
                        errorCode: tpl.errorCode,
                        errorMessage:
                            `template: ${tpl.errorMessage} | texto livre: ${livre.errorCode} ${livre.errorMessage}`,
                        via: null,
                    };
                }
            }
            await supabase.from("incident_notifications").insert({
                incident_id: incidentId, recipient_id: r.id, kind,
                status: res.ok ? "sent" : "failed",
                template_name: res.via === "template" ? templateEnviado : null,
                wamid: res.wamid ?? null,
                error_code: res.errorCode ?? null,
                error_message: res.errorMessage ?? null,
            });
        } else {
            res = await enviarAlerta(supabase, sender, r, alerta, incidentId, kind);
        }

        const porEmail = res.ok
            ? false
            : await tentarEmail(r, alerta, `${res.errorCode}: ${res.errorMessage}`);

        resultados.push({
            destinatario: r.nome,
            status: res.ok ? "sent" : "failed",
            via: res.via,
            wamid: res.wamid ?? null,
            erro: res.ok ? null : `${res.errorCode}: ${res.errorMessage}`,
            segunda_via: porEmail ? "email_enviado" : null,
        });

        if (res.ok) enviados += 1;
        else {
            motivos.push(
                `${r.nome}: ${res.errorCode} ${res.errorMessage}${porEmail ? " (avisado por e-mail)" : ""}`,
            );
        }
    }

    // Pulado por janela de silencio ou teto por hora tambem precisa de motivo:
    // sem ele o incidente voltaria para a fila com "falha sem motivo informado"
    // e o painel nao distinguiria "a Meta recusou" de "ainda nao era hora".
    const erro = enviados > 0 || elegiveis === 0
        ? null
        : (motivos.length
            ? motivos.join(" | ")
            : "adiado: janela de silêncio do destinatário ou teto por hora atingido");

    return { enviados, elegiveis, resultados, erro };
}

// ── Handler ──────────────────────────────────────────────────────────────────

serveMonitored("alert-notify", async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    try {
        const apresentado = req.headers.get("x-service-key")
            || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
        if (apresentado !== serviceKey) {
            return json({ success: false, error: "Não autorizado", code: "unauthorized" }, 401);
        }

        const body = await req.json().catch(() => ({}));
        const action = typeof body?.action === "string" ? body.action : "notify";

        const { data: cfg } = await supabase
            .from("llm_platform_settings")
            // Uma string so, sem concatenacao: o supabase-js infere o tipo da
            // linha a partir do LITERAL do select, e concatenar joga tudo fora.
            .select("alert_notify_enabled, alert_summary_enabled, alert_max_per_hour, alert_email_enabled, alert_rajada_enabled, alert_rajada_min")
            .limit(1)
            .maybeSingle();

        const notifyLigado = cfg?.alert_notify_enabled !== false;
        const resumoLigado = cfg?.alert_summary_enabled !== false;
        const teto = Number(cfg?.alert_max_per_hour ?? 10);
        // Segunda via LIGADA por omissao: a coluna pode nao existir ainda num
        // ambiente que esteja atras desta migration, e nesse caso o certo e
        // tentar o e-mail, nao ficar calado.
        const emailLigado = cfg?.alert_email_enabled !== false;
        const rajadaLigada = cfg?.alert_rajada_enabled !== false;
        const rajadaMin = Math.max(2, Number(cfg?.alert_rajada_min ?? 3));

        // Desligar o envio NUNCA desliga a gravacao do incidente nem o painel.
        // `test` ignora a chave de proposito: e a sonda manual do Super Admin.
        if (action !== "test" && !notifyLigado) {
            return json({ success: true, skipped: "alert_notify_enabled=false" });
        }
        if (action === "summary" && !resumoLigado) {
            return json({ success: true, skipped: "alert_summary_enabled=false" });
        }

        // ── dispatch: drena a fila, um incidente por vez ──────────────────────
        // Chamada pelo cron `alert-dispatch` (* * * * *), que so acorda esta
        // funcao quando incident_notify_pending_count() > 0.
        if (action === "dispatch") {
            const limite = Math.min(Math.max(Number(body?.limit ?? 10), 1), 50);

            const { data: fila, error: fErr } = await supabase
                .rpc("incident_claim_for_notification", { p_limit: limite });
            if (fErr) throw new Error(`incident_claim_for_notification: ${fErr.message}`);
            if (!fila?.length) return json({ success: true, action, despachados: 0 });

            const { data: dests, error: dErr } = await supabase
                .from("alert_recipients")
                .select(CAMPOS_DESTINATARIO)
                .eq("is_active", true);
            if (dErr) throw new Error(`alert_recipients: ${dErr.message}`);

            const despachos: Record<string, unknown>[] = [];

            // Sem destinatario ativo NENHUM incidente pode ser dado por avisado:
            // eles ficam na fila e saem assim que alguem for cadastrado.
            if (!dests?.length) {
                for (const inc of fila) {
                    await supabase.rpc("incident_notification_done", {
                        p_incident_id: inc.id,
                        p_ok: false,
                        p_event_count: inc.event_count,
                        p_error: "nenhum destinatário ativo cadastrado",
                    });
                    despachos.push({ incidente: inc.id, status: "sem_destinatario" });
                }
                return json({ success: true, action, despachados: despachos.length, despachos });
            }

            // Monta todos os alertas ANTES de enviar: e o unico jeito de saber a
            // severidade EFETIVA de cada um (ela sai de `montarAlerta`, nao do
            // retorno cru da fila) e, com isso, decidir quem pode ir agrupado.
            const preparados: { inc: Record<string, any>; alerta: Alerta }[] = [];
            for (const inc of fila) {
                const recorrencia = inc.kind === "recorrencia";
                preparados.push({
                    inc,
                    alerta: await montarAlerta(
                        supabase,
                        inc,
                        recorrencia
                            ? `+${inc.ocorrencias_novas} desde o último aviso (${ddmmHHmm(inc.desde)}) — ${inc.event_count} no total`
                            : `${inc.event_count} desde ${ddmmHHmm(inc.first_seen)}`,
                    ),
                });
            }

            // RAJADA: 3+ incidentes NAO-criticos na mesma passada quase sempre sao
            // uma causa raiz so — em 23/09 uma varredura do `cron-health-watch`
            // rendeu 8 WhatsApps no mesmo minuto. Eles viram UMA mensagem com a
            // lista. Critico nunca entra aqui: continua saindo individual, sempre.
            const agrupaveis = rajadaLigada
                ? preparados.filter((p) => p.alerta.severidade !== "critica")
                : [];
            const emRajada = agrupaveis.length >= rajadaMin
                ? new Set(agrupaveis.map((p) => p.inc.id))
                : new Set<string>();

            if (emRajada.size > 0) {
                const destaques = agrupaveis
                    .map((p) => `${p.alerta.componente} (${SEV_LABEL[p.alerta.severidade]})`)
                    .join(" · ");
                const r = await espalhar(
                    supabase,
                    (dests ?? []) as Recipient[],
                    agrupaveis[0].alerta,
                    // A notificacao fica pendurada no primeiro incidente do grupo;
                    // os outros sao encerrados junto. O painel continua com os N.
                    agrupaveis[0].inc.id,
                    "rajada",
                    teto,
                    [`rajada de ${ddmmHHmm(new Date().toISOString())}`, String(agrupaveis.length), destaques],
                    emailLigado,
                );

                // Rajada recusada NAO vira silencio: os incidentes voltam para a
                // fila com o recuo de sempre e saem individuais na proxima passada.
                const ok = r.enviados > 0 || r.elegiveis === 0;
                for (const p of agrupaveis) {
                    await supabase.rpc("incident_notification_done", {
                        p_incident_id: p.inc.id,
                        p_ok: ok,
                        p_event_count: p.inc.event_count,
                        p_error: r.erro,
                    });
                }
                despachos.push({
                    tipo: "rajada",
                    incidentes: agrupaveis.length,
                    componentes: agrupaveis.map((p) => p.alerta.componente),
                    enviados: r.enviados,
                    elegiveis: r.elegiveis,
                    erro: r.erro,
                });
                // Nada de reenviar individualmente na MESMA passada quando a
                // rajada falha: `incident_notification_done(ok=false)` ja marcou o
                // recuo, e insistir agora seria mandar duas vezes o mesmo aviso.
            }

            for (const { inc, alerta: alertaInc } of preparados) {
                if (emRajada.has(inc.id)) continue;
                const recorrencia = inc.kind === "recorrencia";

                const r = await espalhar(
                    supabase,
                    (dests ?? []) as Recipient[],
                    alertaInc,
                    inc.id,
                    recorrencia ? "recorrencia" : "individual",
                    teto,
                    null,
                    emailLigado,
                );

                // elegiveis === 0 encerra o incidente: ninguem pediu para ser
                // avisado nesta severidade, entao nao ha o que retentar.
                const ok = r.enviados > 0 || r.elegiveis === 0;
                if (r.elegiveis === 0) {
                    await supabase.from("incident_notifications").insert({
                        incident_id: inc.id,
                        recipient_id: dests[0].id,
                        kind: recorrencia ? "recorrencia" : "individual",
                        status: "skipped_severity",
                    });
                }

                const { error: doneErr } = await supabase.rpc("incident_notification_done", {
                    p_incident_id: inc.id,
                    p_ok: ok,
                    p_event_count: inc.event_count,
                    p_error: r.erro,
                });
                if (doneErr) console.error("[alert-notify] done falhou:", inc.id, doneErr.message);

                despachos.push({
                    incidente: inc.id,
                    componente: inc.component,
                    // a efetiva, nao a crua: o retorno do dispatch tem que dizer
                    // por que aquele incidente foi tratado como urgente
                    severidade: alertaInc.severidade,
                    tipo: inc.kind,
                    enviados: r.enviados,
                    elegiveis: r.elegiveis,
                    erro: r.erro,
                });
            }

            return json({ success: true, action, despachados: despachos.length, despachos });
        }

        // ── monta o alerta ────────────────────────────────────────────────────
        let alerta: Alerta;
        let incidentId: string | null = null;
        let kind: "individual" | "resumo" | "recorrencia" = "individual";
        // Preenchido so na acao `summary`: o resumo tem template proprio, de 3 variaveis.
        let resumoParams: string[] | null = null;
        // Quantos eventos o incidente tinha quando avisamos — e o que permite o
        // "continua acontecendo" avisar de novo so quando piora, e nao a cada evento.
        let eventCountNoEnvio = 0;

        if (action === "test") {
            alerta = {
                severidade: "baixa",
                natureza: "servico",
                componente: "alert-notify",
                conta: "nenhuma identificada",
                origem: "Disparo manual de teste",
                // O titulo de um teste precisa dizer que e teste na PRIMEIRA
                // palavra depois do componente: se ele nao distinguir alerta real
                // de ensaio pelo titulo, o canal inteiro perde valor.
                origemCurta: "Teste manual",
                resolucao: "Nada a fazer",
                ocorrencias: `1 desde ${ddmmHHmm(new Date().toISOString())}`,
                oQueFaz: "entrega os alertas de incidente da plataforma no WhatsApp do Super Admin",
                oQueFalhou: sanitizeParam(body?.message ?? "teste manual do canal de alerta — nada falhou"),
                causa: "nenhuma — este alerta foi disparado à mão para validar o canal",
                acao: "se esta mensagem chegou, o canal está funcionando",
                painel: PAINEL_URL,
            };
        } else if (action === "summary") {
            kind = "resumo";
            const horas = Number(body?.hours ?? 2);
            // A lista vem do MESMO RPC que serve de portao ao cron
            // `alert-summary`. Montar a consulta aqui de novo faria o portao
            // acordar a function para uma lista que ela nao encontra — foi
            // exatamente assim que o despachante ficou acordando a toa antes.
            const { data, error } = await supabase
                .rpc("incident_summary_pending", { p_hours: horas });
            if (error) throw new Error(`incident_summary_pending: ${error.message}`);
            const abertos = (data ?? []) as {
                component: string;
                ai_summary: string | null;
                event_count: number;
            }[];
            if (!abertos.length) {
                return json({ success: true, skipped: "nenhum incidente media/baixa na janela" });
            }
            const destaques = abertos
                .map((i) => `${i.component}: ${i.ai_summary ?? "sem análise"} (${i.event_count}x)`)
                .join(" · ");
            // Falha de envio da Meta e ruido individual e sinal COLETIVO: cada
            // recusa vira incidente so-painel, mas o numero do dia contra a media
            // de 7 dias e o que diz se a conta esta piorando. Nunca derruba o
            // resumo: se a contagem falhar, o resumo sai sem a linha.
            let linhaFalhasMeta = "";
            try {
                const { data: falhas } = await supabase.rpc("meta_send_failure_counts");
                const linha = Array.isArray(falhas) ? falhas[0] : falhas;
                if (linha) {
                    const hoje = Number(linha.hoje ?? 0);
                    const media = Number(linha.media_7d ?? 0);
                    linhaFalhasMeta =
                        `${hoje} mensagem(ns) falharam ao serem enviadas pela Meta hoje ` +
                        `(média 7 dias: ${media.toFixed(1).replace(".", ",")})`;
                }
            } catch (err) {
                console.error("[alert-notify] meta_send_failure_counts falhou:", err);
            }
            const destaquesComMeta = linhaFalhasMeta
                ? `${linhaFalhasMeta} · ${destaques}`
                : destaques;
            const inicio = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
            // O resumo tem texto e template proprios (resumoTexto/TPL_RESUMO) e
            // NAO passa pelos quatro blocos; este objeto so alimenta o filtro de
            // severidade e o registro em incident_notifications.
            alerta = {
                severidade: "media",
                natureza: "servico",
                componente: "resumo",
                conta: "-",
                // O resumo agrupa incidentes de origens diferentes; uma origem
                // unica aqui seria mentira. Cada linha do painel tem a sua.
                origem: "-",
                // Mesmo motivo para os dois campos novos: o resumo nao tem
                // componente, cliente nem responsavel unicos, e o titulo de 4
                // campos so vale quando os 4 tem UM valor. Por isso o resumo
                // manteve o cabecalho antigo (ver enviarTemplateResumo).
                origemCurta: "-",
                resolucao: "-",
                ocorrencias: `${ddmmHHmm(inicio)} às ${ddmmHHmm(new Date().toISOString())}`,
                oQueFaz: "-",
                oQueFalhou: `${abertos.length} incidente(s) aberto(s)`,
                causa: "-",
                acao: "abra o painel para ver os detalhes",
                painel: PAINEL_URL,
            };
            // {{1}} periodo · {{2}} incidentes · {{3}} destaques (corpo real conferido na WABA)
            resumoParams = [
                `${ddmmHHmm(inicio)} às ${ddmmHHmm(new Date().toISOString())}`,
                String(abertos.length),
                destaquesComMeta,
            ];
        } else {
            incidentId = typeof body?.incident_id === "string" ? body.incident_id : "";
            if (!incidentId) {
                return json(
                    { success: false, error: "incident_id não fornecido", code: "missing_incident_id" },
                    400,
                );
            }
            const { data: inc, error } = await supabase
                .from("incidents")
                .select(
                    "id, component, source, ai_severity, ai_summary, ai_probable_cause, ai_origin, ai_fix_n8n, ai_fix_system, event_count, first_seen, owner_id, affected_tenants, analyzed_at, origem, origem_inferida",
                )
                .eq("id", incidentId)
                .maybeSingle();
            if (error) throw new Error(`incidents: ${error.message}`);
            if (!inc) {
                return json(
                    { success: false, error: "Incidente não encontrado", code: "incident_not_found" },
                    404,
                );
            }

            eventCountNoEnvio = inc.event_count ?? 0;
            alerta = await montarAlerta(
                supabase,
                inc,
                `${inc.event_count} desde ${ddmmHHmm(inc.first_seen)}`,
            );
        }

        // ── destinatarios ─────────────────────────────────────────────────────
        const { data: recipients, error: rErr } = await supabase
            .from("alert_recipients")
            .select(CAMPOS_DESTINATARIO)
            .eq("is_active", true);
        if (rErr) throw new Error(`alert_recipients: ${rErr.message}`);
        if (!recipients?.length) {
            return json({ success: true, skipped: "nenhum destinatario ativo" });
        }

        const r = await espalhar(
            supabase,
            recipients as Recipient[],
            alerta,
            incidentId,
            kind,
            teto,
            resumoParams,
            emailLigado,
        );

        // A contabilidade do envio e a MESMA do despachante automatico: quem
        // dispara pela mao (acao `notify`) tambem limpa a reserva, zera o backoff
        // e grava o motivo da falha. Duas contabilidades divergentes foi o que
        // deixou o incidente critico de 22/09 sem rastro nenhum.
        if (incidentId) {
            await supabase.rpc("incident_notification_done", {
                p_incident_id: incidentId,
                p_ok: r.enviados > 0 || r.elegiveis === 0,
                p_event_count: eventCountNoEnvio,
                p_error: r.erro,
            });
        }

        return json({
            success: true,
            action,
            incident_id: incidentId,
            enviados: r.enviados,
            resultados: r.resultados,
        });
    } catch (e) {
        console.error("[alert-notify] erro inesperado:", (e as Error).message);
        return json(
            { success: false, error: (e as Error).message, code: "unexpected_error" },
            500,
        );
    }
});
