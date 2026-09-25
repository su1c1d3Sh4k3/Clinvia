import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
    descreverErroMeta,
    esperaDoReenvio,
    grupoDoErroMeta,
    MAX_REENVIOS,
} from "../_shared/meta-error-codes.ts";

/**
 * meta-send-retry-worker
 *
 * Reenvia a mensagem que a Meta recusou por motivo PASSAGEIRO (131000, 131016,
 * 130429, 131056 e 5xx do Graph): 3 tentativas, esperando 30s, 2min e 10min.
 *
 * Bloqueio/regra (131049, 131047, 1320xx e companhia) NUNCA entra na fila:
 * insistir num numero que a Meta ja barrou so derruba a qualidade da conta da
 * clinica, que e o ativo mais caro de recuperar.
 *
 * Acordado pelo cron `meta-send-retry-worker` (* * * * *), que so dispara
 * quando ha linha vencida — ver `public.invoke_meta_send_retry_worker()`.
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-origin, x-service-key",
};

const LOTE = 25;

serveMonitored("meta-send-retry-worker", async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(url, serviceKey);

    const { data: pendentes, error: leituraErr } = await supabase
        .from("meta_send_retry")
        .select("*")
        .eq("status", "pending")
        .lte("next_attempt_at", new Date().toISOString())
        .order("next_attempt_at", { ascending: true })
        .limit(LOTE);

    if (leituraErr) {
        console.error("[meta-send-retry-worker] Erro ao ler a fila:", leituraErr);
        return new Response(
            JSON.stringify({ success: false, error: "queue_read_failed", message: leituraErr.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    let reenviadas = 0;
    let reagendadas = 0;
    let esgotadas = 0;

    for (const linha of pendentes ?? []) {
        // Reserva a linha antes de gastar a tentativa: duas execucoes do cron
        // sobrepostas nao podem enviar a mesma mensagem duas vezes.
        const { data: reservada, error: reservaErr } = await supabase
            .from("meta_send_retry")
            .update({ status: "sending", updated_at: new Date().toISOString() })
            .eq("id", linha.id)
            .eq("status", "pending")
            .select("id");

        if (reservaErr || !reservada || reservada.length === 0) continue;

        const tentativa = (linha.attempt ?? 0) + 1;
        let enviou = false;
        let motivo: string | null = null;
        let codigoNovo: string | null = null;

        try {
            const resposta = await fetch(`${url}/functions/v1/meta-send-message`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${serviceKey}`,
                    "x-origin": "cron",
                },
                body: JSON.stringify(linha.payload),
            });

            const corpo = await resposta.json().catch(() => null);
            enviou = resposta.ok && corpo?.success !== false;
            if (!enviou) {
                codigoNovo = corpo?.meta_error_code != null ? String(corpo.meta_error_code) : null;
                motivo = corpo?.message ?? `HTTP ${resposta.status}`;
                // 5xx sem codigo de aplicacao tambem conta como passageiro
                if (!codigoNovo && resposta.status >= 500) codigoNovo = linha.error_code;
            }
        } catch (err) {
            motivo = err instanceof Error ? err.message : String(err);
            codigoNovo = linha.error_code;
        }

        if (enviou) {
            // A mensagem nova carrega o mesmo conteudo e um wamid de verdade.
            // Manter a antiga deixaria o balao duplicado na tela do atendente.
            if (linha.message_id) {
                const { error: delErr } = await supabase
                    .from("messages")
                    .delete()
                    .eq("id", linha.message_id)
                    .eq("status", "failed");
                if (delErr) {
                    console.error("[meta-send-retry-worker] Não consegui limpar o balão antigo:", delErr);
                }
            }
            await supabase
                .from("meta_send_retry")
                .update({ status: "done", attempt: tentativa, updated_at: new Date().toISOString() })
                .eq("id", linha.id);
            reenviadas++;
            continue;
        }

        const aindaPassageiro = grupoDoErroMeta(codigoNovo ?? linha.error_code) === "passageiro";
        const espera = aindaPassageiro ? esperaDoReenvio(tentativa + 1) : null;

        if (espera !== null && tentativa < MAX_REENVIOS) {
            await supabase
                .from("meta_send_retry")
                .update({
                    status: "pending",
                    attempt: tentativa,
                    next_attempt_at: new Date(Date.now() + espera * 1000).toISOString(),
                    last_error: motivo,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", linha.id);
            if (linha.message_id) {
                await supabase.from("messages").update({ retry_count: tentativa }).eq("id", linha.message_id);
            }
            reagendadas++;
            continue;
        }

        // Acabaram as tentativas (ou o motivo mudou para bloqueio): a falha
        // virou FINAL. So aqui o inbox troca o relogio cinza pela caixa vermelha.
        const codigoFinal = codigoNovo ?? linha.error_code;
        const traducao = descreverErroMeta(codigoFinal);

        await supabase
            .from("meta_send_retry")
            .update({
                status: "exhausted",
                attempt: tentativa,
                last_error: motivo,
                updated_at: new Date().toISOString(),
            })
            .eq("id", linha.id);

        if (linha.message_id) {
            await supabase
                .from("messages")
                .update({
                    status: "failed",
                    retry_count: tentativa,
                    error_code: codigoFinal,
                    error_title: traducao.titulo,
                })
                .eq("id", linha.message_id);
        }
        esgotadas++;
    }

    // Reenvio que esgotou nao acorda ninguem por si so: o codigo e passageiro,
    // o caso individual e ruido. O que importa e o VOLUME, e quem mede isso e
    // o detector de pico (`meta_send_spike_scan`, de hora em hora). Suprimir na
    // origem, nunca na porta.
    if (esgotadas > 0) {
        console.error(
            `[meta-send-retry-worker] ${esgotadas} mensagem(ns) esgotaram as ${MAX_REENVIOS} tentativas de reenvio.`,
        );
    }

    return new Response(
        JSON.stringify({ success: true, reenviadas, reagendadas, esgotadas }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
});
