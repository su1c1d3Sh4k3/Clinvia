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
// ORDEM DE ENVIO: texto livre primeiro, template como plano B.
// Dentro da janela de 24h o texto livre e gratuito e aceita quebra de linha
// (parametro de template NAO aceita \n). Fora da janela a Meta recusa com 131047
// e ai o template entra. Enquanto os templates nao estiverem APPROVED, o plano B
// tambem falha — o incidente continua gravado e a recusa fica registrada em
// incident_notifications.error_message. Nada quebra.
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-service-key",
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
const TPL_LANG = "pt_BR";

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

type Recipient = {
    id: string;
    nome: string;
    telefone: string;
    instance_id: string;
    min_severity: Severity;
    window_start: string;
    window_end: string;
    timezone: string;
};

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
        const resp = await fetch(`${GRAPH_API}/${sender.phone_number_id}/messages`, {
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
function alertaTexto(a: Alerta): string {
    const tituloMeio = a.natureza === "detector" ? "O QUE FOI DETECTADO" : "O QUE FALHOU";
    return [
        `${SEV_LABEL[a.severidade]} — Alerta Clinbia`,
        `Componente: ${a.componente}`,
        `Conta: ${a.conta} · ${a.ocorrencias}`,
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
    // O template v2 tem 8 variaveis e nenhuma sobra para "o que esse servico faz".
    // Criar v3 custaria outra aprovacao da Meta para um caminho que so roda fora
    // da janela de 24h, entao os dois blocos entram juntos em {{3}}.
    const rotulo = a.natureza === "detector" ? "DETECTADO" : "FALHOU";
    return [
        SEV_LABEL[a.severidade],
        a.componente,
        `${a.oQueFaz} — ${rotulo}: ${a.oQueFalhou}`,
        a.ocorrencias,
        a.conta,
        a.causa,
        a.acao,
        a.painel,
    ];
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
    catalogado: boolean;
};

/**
 * "O QUE ESSE SERVICO FAZ" vem de tabela, nunca da IA: e barato, nunca falha e
 * nunca alucina. Componente fora do catalogo sai declarado como tal E abre um
 * incidente proprio — o buraco no catalogo tem que incomodar, senao fica.
 */
async function catalogoDoComponente(supabase: Db, componente: string): Promise<Catalogo> {
    const { data, error } = await supabase.rpc("incident_component_info", { p_component: componente });
    const row = Array.isArray(data) ? data[0] : data;

    if (error || !row?.catalogado) {
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
            catalogado: false,
        };
    }

    return {
        natureza: row.natureza === "detector" ? "detector" : "servico",
        oQueFaz: row.descricao,
        acaoPadrao: row.acao_padrao ?? null,
        severidadePadrao: (row.severidade_padrao as Severity) ?? "media",
        catalogado: true,
    };
}

// deno-lint-ignore no-explicit-any
type IncidenteRow = any;

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
        resolverConta(supabase, inc.owner_id, inc.affected_tenants),
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
    kind: "individual" | "resumo" | "recorrencia",
): Promise<SendResult & { via: "texto" | "template" | null }> {
    const registrar = async (
        status: string,
        via: "texto" | "template" | null,
        res?: SendResult,
    ) => {
        await supabase.from("incident_notifications").insert({
            incident_id: incidentId,
            recipient_id: r.id,
            kind,
            status,
            template_name: via === "template" ? TPL_INCIDENTE : null,
            wamid: res?.wamid ?? null,
            error_code: res?.errorCode ?? null,
            error_message: res?.errorMessage ?? null,
        });
    };

    const livre = await graphSend(sender, textPayload(r.telefone, alertaTexto(a)));
    if (livre.ok) {
        await registrar("sent", "texto", livre);
        return { ...livre, via: "texto" };
    }

    const tpl = await graphSend(
        sender,
        templatePayload(r.telefone, TPL_INCIDENTE, alertaParams(a)),
    );
    if (tpl.ok) {
        await registrar("sent", "template", tpl);
        return { ...tpl, via: "template" };
    }

    // Guarda os DOIS motivos: sem o erro do texto livre nao da para saber se a
    // janela fechou ou se o token/numero e que estao errados.
    const combinado: SendResult = {
        ok: false,
        errorCode: tpl.errorCode,
        errorMessage: `template: ${tpl.errorMessage} | texto livre: ${livre.errorCode} ${livre.errorMessage}`,
    };
    await registrar("failed", "template", combinado);
    return { ...combinado, via: null };
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

/** Nome da conta afetada, do jeito que aparece na mensagem. */
async function resolverConta(
    supabase: Db,
    ownerId: string | null,
    afetados: string[] | null,
): Promise<string> {
    if (ownerId) {
        const { data: p } = await supabase
            .from("profiles")
            .select("company_name, full_name")
            .eq("id", ownerId)
            .maybeSingle();
        return p?.company_name || p?.full_name || "conta não identificada";
    }
    if (Array.isArray(afetados) && afetados.length > 1) {
        return `${afetados.length} contas afetadas`;
    }
    return "nenhuma identificada";
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
    kind: "individual" | "resumo" | "recorrencia",
    teto: number,
    resumoParams: string[] | null,
): Promise<Espalhamento> {
    const agora = new Date();
    const resultados: Record<string, unknown>[] = [];
    const motivos: string[] = [];
    let enviados = 0;
    let elegiveis = 0;

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

        if (await estourouORateLimit(supabase, r.id, teto)) {
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
            resultados.push({ destinatario: r.nome, status: "failed", motivo: "sender_sem_token" });
            motivos.push(`${r.nome}: instância remetente sem token`);
            continue;
        }

        let res: SendResult & { via: "texto" | "template" | null };
        if (resumoParams) {
            const livre = await graphSend(sender, textPayload(r.telefone, resumoTexto(resumoParams)));
            if (livre.ok) {
                res = { ...livre, via: "texto" };
            } else {
                const tpl = await graphSend(sender, templatePayload(r.telefone, TPL_RESUMO, resumoParams));
                res = tpl.ok ? { ...tpl, via: "template" } : {
                    ok: false,
                    errorCode: tpl.errorCode,
                    errorMessage:
                        `template: ${tpl.errorMessage} | texto livre: ${livre.errorCode} ${livre.errorMessage}`,
                    via: null,
                };
            }
            await supabase.from("incident_notifications").insert({
                incident_id: incidentId, recipient_id: r.id, kind,
                status: res.ok ? "sent" : "failed",
                template_name: res.via === "template" ? TPL_RESUMO : null,
                wamid: res.wamid ?? null,
                error_code: res.errorCode ?? null,
                error_message: res.errorMessage ?? null,
            });
        } else {
            res = await enviarAlerta(supabase, sender, r, alerta, incidentId, kind);
        }

        resultados.push({
            destinatario: r.nome,
            status: res.ok ? "sent" : "failed",
            via: res.via,
            wamid: res.wamid ?? null,
            erro: res.ok ? null : `${res.errorCode}: ${res.errorMessage}`,
        });

        if (res.ok) enviados += 1;
        else motivos.push(`${r.nome}: ${res.errorCode} ${res.errorMessage}`);
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

serve(async (req) => {
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
            .select("alert_notify_enabled, alert_summary_enabled, alert_max_per_hour")
            .limit(1)
            .maybeSingle();

        const notifyLigado = cfg?.alert_notify_enabled !== false;
        const resumoLigado = cfg?.alert_summary_enabled !== false;
        const teto = Number(cfg?.alert_max_per_hour ?? 10);

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
                .select("id, nome, telefone, instance_id, min_severity, window_start, window_end, timezone")
                .eq("is_active", true);
            if (dErr) throw new Error(`alert_recipients: ${dErr.message}`);

            const despachos: Record<string, unknown>[] = [];

            for (const inc of fila) {
                // Sem destinatario ativo o incidente NAO pode ser dado por avisado:
                // ele fica na fila e sai assim que alguem for cadastrado.
                if (!dests?.length) {
                    await supabase.rpc("incident_notification_done", {
                        p_incident_id: inc.id,
                        p_ok: false,
                        p_event_count: inc.event_count,
                        p_error: "nenhum destinatário ativo cadastrado",
                    });
                    despachos.push({ incidente: inc.id, status: "sem_destinatario" });
                    continue;
                }

                const recorrencia = inc.kind === "recorrencia";
                const alertaInc = await montarAlerta(
                    supabase,
                    inc,
                    recorrencia
                        ? `+${inc.ocorrencias_novas} desde o último aviso (${ddmmHHmm(inc.desde)}) — ${inc.event_count} no total`
                        : `${inc.event_count} desde ${ddmmHHmm(inc.first_seen)}`,
                );

                const r = await espalhar(
                    supabase,
                    (dests ?? []) as Recipient[],
                    alertaInc,
                    inc.id,
                    recorrencia ? "recorrencia" : "individual",
                    teto,
                    null,
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
            const inicio = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
            // O resumo tem texto e template proprios (resumoTexto/TPL_RESUMO) e
            // NAO passa pelos quatro blocos; este objeto so alimenta o filtro de
            // severidade e o registro em incident_notifications.
            alerta = {
                severidade: "media",
                natureza: "servico",
                componente: "resumo",
                conta: "-",
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
                destaques,
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
                    "id, component, source, ai_severity, ai_summary, ai_probable_cause, ai_origin, ai_fix_n8n, ai_fix_system, event_count, first_seen, owner_id, affected_tenants, analyzed_at",
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
            .select("id, nome, telefone, instance_id, min_severity, window_start, window_end, timezone")
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
