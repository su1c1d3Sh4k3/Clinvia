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
// ORDEM DE ENVIO: texto livre primeiro, template como plano B.
// Dentro da janela de 24h o texto livre e gratuito e aceita quebra de linha
// (parametro de template NAO aceita \n). Fora da janela a Meta recusa com 131047
// e ai o template entra. Enquanto os templates nao estiverem APPROVED, o plano B
// tambem falha — o incidente continua gravado e a recusa fica registrada em
// incident_notifications.error_message. Nada quebra.
//
// Acoes:
//   { action: "notify",  incident_id }  -> alerta individual
//   { action: "summary", hours?: 2 }    -> resumo agrupado de media/baixa
//   { action: "test",    message? }     -> alerta ficticio, nao toca em incidents
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

const TPL_INCIDENTE = "sys_alerta_incidente_v1";
const TPL_RESUMO = "sys_alerta_resumo_v1";
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
    componente: string;
    erro: string;
    ocorrencias: string;
    conta: string;
    causa: string;
    acao: string;
    painel: string;
};

/** Texto livre: o layout bonito, que so passa dentro da janela de 24h. */
function alertaTexto(a: Alerta): string {
    return [
        `${SEV_LABEL[a.severidade]} — Alerta Clinbia`,
        ``,
        `Componente: ${a.componente}`,
        `Erro: ${a.erro}`,
        `Ocorrências: ${a.ocorrencias}`,
        `Conta: ${a.conta}`,
        ``,
        `Causa provável: ${a.causa}`,
        `O que fazer: ${a.acao}`,
        ``,
        `Painel: ${a.painel}`,
        ``,
        `Mensagem automática do monitoramento da plataforma.`,
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
    return [
        SEV_LABEL[a.severidade],
        a.componente,
        a.erro,
        a.ocorrencias,
        a.conta,
        a.causa,
        a.acao,
        a.painel,
    ];
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
                componente: "alert-notify",
                erro: sanitizeParam(body?.message ?? "teste manual do canal de alerta"),
                ocorrencias: `1 desde ${ddmmHHmm(new Date().toISOString())}`,
                conta: "nenhuma identificada",
                causa: "nenhuma — este alerta foi disparado à mão para validar o canal",
                acao: "se esta mensagem chegou, o canal está funcionando",
                painel: PAINEL_URL,
            };
        } else if (action === "summary") {
            kind = "resumo";
            const horas = Number(body?.hours ?? 2);
            const desde = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
            const { data: abertos, error } = await supabase
                .from("incidents")
                .select("id, component, ai_summary, ai_severity, event_count, last_seen")
                .eq("status", "open")
                .in("ai_severity", ["media", "baixa"])
                .gte("last_seen", desde)
                .order("event_count", { ascending: false })
                .limit(20);
            if (error) throw new Error(`incidents: ${error.message}`);
            if (!abertos?.length) {
                return json({ success: true, skipped: "nenhum incidente media/baixa na janela" });
            }
            const destaques = abertos
                .map((i) => `${i.component}: ${i.ai_summary ?? "sem análise"} (${i.event_count}x)`)
                .join(" · ");
            const inicio = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();
            alerta = {
                severidade: "media",
                componente: "resumo",
                erro: `${abertos.length} incidente(s) aberto(s)`,
                ocorrencias: `${ddmmHHmm(inicio)} às ${ddmmHHmm(new Date().toISOString())}`,
                conta: "-",
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
                    "id, component, source, ai_severity, ai_summary, ai_probable_cause, ai_origin, ai_fix_n8n, ai_fix_system, event_count, first_seen, owner_id, affected_tenants",
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

            let conta = "nenhuma identificada";
            if (inc.owner_id) {
                const { data: p } = await supabase
                    .from("profiles")
                    .select("company_name, full_name")
                    .eq("id", inc.owner_id)
                    .maybeSingle();
                conta = p?.company_name || p?.full_name || "conta não identificada";
            } else if (Array.isArray(inc.affected_tenants) && inc.affected_tenants.length > 1) {
                conta = `${inc.affected_tenants.length} contas afetadas`;
            }

            alerta = {
                severidade: (inc.ai_severity as Severity) ?? "media",
                componente: inc.component,
                erro: inc.ai_summary ?? `falha em ${inc.component} (${inc.source})`,
                ocorrencias: `${inc.event_count} desde ${ddmmHHmm(inc.first_seen)}`,
                conta,
                causa: inc.ai_probable_cause
                    ? `${inc.ai_probable_cause}${inc.ai_origin ? ` — ${inc.ai_origin}` : ""}`
                    : "análise ainda não concluída",
                acao: inc.ai_fix_system || inc.ai_fix_n8n || "abrir o painel e investigar",
                painel: `${PAINEL_URL}&i=${inc.id}`,
            };
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

        const agora = new Date();
        const resultados: Record<string, unknown>[] = [];
        let enviados = 0;

        for (const raw of recipients) {
            const r = raw as Recipient;

            if (SEV_RANK[alerta.severidade] < SEV_RANK[r.min_severity]) {
                resultados.push({ destinatario: r.nome, status: "abaixo_da_severidade_minima" });
                continue;
            }

            if (!IGNORA_JANELA.includes(alerta.severidade) && !dentroDaJanela(r, agora)) {
                await supabase.from("incident_notifications").insert({
                    incident_id: incidentId,
                    recipient_id: r.id,
                    kind,
                    status: "skipped_window",
                });
                resultados.push({ destinatario: r.nome, status: "skipped_window" });
                continue;
            }

            if (await estourouORateLimit(supabase, r.id, teto)) {
                await supabase.from("incident_notifications").insert({
                    incident_id: incidentId,
                    recipient_id: r.id,
                    kind,
                    status: "skipped_ratelimit",
                });
                resultados.push({ destinatario: r.nome, status: "skipped_ratelimit" });
                continue;
            }

            const sender = await carregarSender(supabase, r.instance_id);
            if (!sender) {
                await supabase.from("incident_notifications").insert({
                    incident_id: incidentId,
                    recipient_id: r.id,
                    kind,
                    status: "failed",
                    error_code: "sender_sem_token",
                    error_message: "instância remetente sem meta_phone_number_id ou meta_access_token",
                });
                resultados.push({ destinatario: r.nome, status: "failed", motivo: "sender_sem_token" });
                continue;
            }

            let res: SendResult & { via: "texto" | "template" | null };
            if (resumoParams) {
                const livre = await graphSend(sender, textPayload(r.telefone, resumoTexto(resumoParams)));
                if (livre.ok) {
                    res = { ...livre, via: "texto" };
                } else {
                    const tpl = await graphSend(
                        sender,
                        templatePayload(r.telefone, TPL_RESUMO, resumoParams),
                    );
                    res = tpl.ok
                        ? { ...tpl, via: "template" }
                        : {
                            ok: false,
                            errorCode: tpl.errorCode,
                            errorMessage:
                                `template: ${tpl.errorMessage} | texto livre: ${livre.errorCode} ${livre.errorMessage}`,
                            via: null,
                        };
                }
                await supabase.from("incident_notifications").insert({
                    incident_id: incidentId,
                    recipient_id: r.id,
                    kind,
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
        }

        if (incidentId && enviados > 0) {
            const { data: atual } = await supabase
                .from("incidents")
                .select("notified_count")
                .eq("id", incidentId)
                .maybeSingle();
            await supabase
                .from("incidents")
                .update({
                    last_notified_at: new Date().toISOString(),
                    notified_count: (atual?.notified_count ?? 0) + enviados,
                    notified_at_event_count: eventCountNoEnvio,
                })
                .eq("id", incidentId);
        }

        return json({ success: true, action, incident_id: incidentId, enviados, resultados });
    } catch (e) {
        console.error("[alert-notify] erro inesperado:", (e as Error).message);
        return json(
            { success: false, error: (e as Error).message, code: "unexpected_error" },
            500,
        );
    }
});
