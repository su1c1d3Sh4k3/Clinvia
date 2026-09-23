// alert-channel-watch — vigia do canal de alertas.
//
// POR QUE EXISTE: todo alerta desta plataforma sai por UM caminho, o WhatsApp da
// conta Bruno Admin. Se esse caminho para, o incidente que avisa que ele parou
// sairia por ele mesmo. Circular. Este vigia quebra o circulo: detecta o canal
// mudo por SQL puro (`canal_alertas_scan`, sem depender da Meta) e entrega o
// aviso por e-mail, via Resend — um caminho que nao passa pela Meta em ponto
// nenhum.
//
// POR QUE NAO E UMA ACAO DENTRO DO alert-notify: porque o alert-notify pode ser
// justamente o que esta quebrado. Vigia que mora dentro do vigiado nao vigia.
//
// O detector nao tem heartbeat cego ("nada saiu em N horas"): dia calmo tambem
// nao tem envio. Silencio so e defeito quando havia o que dizer. Os tres
// sintomas estao documentados em canal_alertas_scan().
//
// Acoes:
//   { action: "scan" }        -> le o detector e, se mudo, manda o e-mail (cron */15)
//   { action: "test-email" }  -> manda um e-mail de exemplo, nao toca em incidents
//
// Autenticacao: service role key em `x-service-key` ou `Authorization: Bearer`.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { emailAlertaIncidente, sendEmail } from "../_shared/emails.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-service-key",
    "Content-Type": "application/json; charset=utf-8",
};

const PAINEL_URL = "https://app.clinbia.ai/admin?tab=alertas";

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: corsHeaders });

// deno-lint-ignore no-explicit-any
type Db = any;

/** Cada sintoma tem uma causa provavel diferente — e o que muda o que fazer. */
const CAUSA: Record<string, string> = {
    meta_recusou:
        "a Meta devolveu erro no envio. Os suspeitos, em ordem: token da instância "
        + "remetente vencido ou revogado, número fora da janela de 24h com os templates "
        + "ainda não aprovados, ou limite/qualidade do número derrubando a entrega.",
    fila_parada:
        "o alerta foi reservado para envio e nunca saiu. Ou a edge function alert-notify "
        + "está respondendo erro (verifique cron-http:alert-notify no painel), ou o cron "
        + "alert-dispatch parou de acordá-la.",
    sem_saida:
        "houve tentativa de envio e nenhuma chegou ao destino. O canal responde, mas "
        + "recusa tudo — comportamento típico de token inválido ou número penalizado.",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase: Db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

    try {
        const apresentado = req.headers.get("x-service-key")
            || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
        if (apresentado !== serviceKey) {
            return json({ success: false, error: "Não autorizado", code: "unauthorized" }, 401);
        }

        const body = await req.json().catch(() => ({}));
        const action = typeof body?.action === "string" ? body.action : "scan";

        // ── sonda manual: prova que o caminho de e-mail funciona ─────────────
        if (action === "test-email") {
            const para = String(body?.email ?? "").trim();
            if (!para) {
                return json({ success: false, error: "informe o campo email", code: "missing_email" }, 400);
            }
            const mail = emailAlertaIncidente({
                severidade: "critica",
                natureza: "detector",
                componente: "simulacao-de-alerta",
                conta: "plataforma (nenhuma conta afetada)",
                ocorrencias: "1 ocorrência (sonda manual)",
                o_que_faz: "Nada. Este componente existe só para provar que o caminho de "
                    + "aviso está de pé, ponta a ponta.",
                o_que_falhou: "Nada falhou. Alguém disparou a sonda manual do vigia do canal.",
                causa: "sonda manual disparada pelo Super Admin.",
                acao: "Nenhuma. Se este e-mail chegou, o caminho alternativo está funcionando.",
                painel: PAINEL_URL,
                motivo_email: "Esta é uma sonda manual do caminho alternativo de alerta.",
                destinatario: typeof body?.nome === "string" ? body.nome : undefined,
            });
            const { id } = await sendEmail({ to: para, ...mail });
            return json({ success: true, action, enviado_para: para, resend_id: id });
        }

        // ── varredura ────────────────────────────────────────────────────────
        const { data: diag, error: dErr } = await supabase.rpc("canal_alertas_scan");
        if (dErr) throw new Error(`canal_alertas_scan: ${dErr.message}`);

        if (!diag?.mudo) {
            return json({ success: true, action, mudo: false, motivo: diag?.motivo ?? null });
        }

        // Mudo, mas ja avisado dentro do intervalo: o canal mudo dura horas e o
        // vigia roda de 15 em 15 min. Avisar a cada rodada transformaria o
        // alerta em ruido — e ruido e o comeco do silencio.
        if (!diag.email_pendente) {
            return json({
                success: true, action, mudo: true, motivo: diag.motivo,
                email: "adiado", razao: diag.email ? "dentro do intervalo entre avisos" : "nenhum destinatário com e-mail",
            });
        }

        // O que o componente faz e o que fazer vem do catalogo — texto estatico,
        // nunca da IA: ela e a primeira coisa a cair quando a plataforma quebra.
        const { data: cat } = await supabase
            .rpc("incident_component_info", { p_component: "canal:whatsapp-alertas" })
            .maybeSingle();

        const { data: inc } = diag.incident_id
            ? await supabase.from("incidents").select("event_count, first_seen")
                .eq("id", diag.incident_id).maybeSingle()
            : { data: null };

        const mail = emailAlertaIncidente({
            severidade: "critica",
            natureza: "detector",
            componente: "canal:whatsapp-alertas",
            conta: "plataforma (todas as contas)",
            ocorrencias: inc?.event_count
                ? `${inc.event_count} verificação(ões) com o canal mudo`
                : "1 verificação",
            o_que_faz: cat?.descricao
                ?? "Caminho único pelo qual todo alerta desta plataforma sai: o número "
                 + "WhatsApp da conta Bruno Admin, pela Graph API da Meta.",
            o_que_falhou: String(diag.detalhe ?? "canal de alertas mudo"),
            causa: CAUSA[String(diag.motivo)] ?? "sintoma não catalogado — abra o painel.",
            acao: cat?.acao_padrao
                ?? "Confira o token da instância remetente e a qualidade do número na Meta.",
            painel: diag.incident_id ? `${PAINEL_URL}&i=${diag.incident_id}` : PAINEL_URL,
            motivo_email: "O WhatsApp de alertas não está entregando.",
            destinatario: typeof diag.nome === "string" ? diag.nome : undefined,
        });

        let ok = false;
        let erro: string | null = null;
        try {
            const { id } = await sendEmail({ to: String(diag.email), ...mail });
            ok = true;
            console.log(`[alert-channel-watch] e-mail enviado (${id}) motivo=${diag.motivo}`);
        } catch (e) {
            erro = (e as Error).message;
            console.error("[alert-channel-watch] e-mail falhou:", erro);
        }

        // Registra os DOIS desfechos. E-mail que falhou tem de aparecer no painel:
        // se ele sumisse, o unico rastro de que ninguem foi avisado seria a
        // ausencia de mensagem — que e exatamente o que este vigia veio combater.
        const { error: doneErr } = await supabase.rpc("canal_alertas_email_done", {
            p_incident_id: diag.incident_id ?? null,
            p_recipient_id: diag.recipient_id,
            p_ok: ok,
            p_erro: erro,
        });
        if (doneErr) console.error("[alert-channel-watch] registro falhou:", doneErr.message);

        return json({
            success: true, action, mudo: true, motivo: diag.motivo,
            detalhe: diag.detalhe, incidente: diag.incident_id,
            email: ok ? "enviado" : "falhou", erro,
        });
    } catch (e) {
        console.error("[alert-channel-watch]", (e as Error).message);
        return json({ success: false, error: (e as Error).message, code: "unexpected_error" }, 500);
    }
});
