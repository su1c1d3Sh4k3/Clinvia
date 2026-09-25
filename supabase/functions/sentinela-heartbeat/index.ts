import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { reportIncident } from "../_shared/report-incident.ts";

/**
 * sentinela-heartbeat — a porta por onde a caixa de FORA fala com a plataforma.
 *
 * A sentinela (`monitoring/sentinela_login/`, systemd numa VPS que nao e nossa
 * infra de aplicacao) mede de fora se o app esta acessivel. O aviso dela sai por
 * WhatsApp direto, sem Supabase no caminho — de proposito, porque o cenario que
 * ela vigia inclui esta plataforma estar fora. Esta function e o OUTRO caminho,
 * e serve para duas coisas que aquele nao consegue:
 *
 *   1. a falha aparece no painel do Super Admin junto com todo o resto, em vez
 *      de viver so no WhatsApp dele;
 *   2. a ausencia destas linhas e o que permite a plataforma gritar quando a
 *      SENTINELA parar de falar (`public.sentinela_health_scan()`, a cada 5 min).
 *
 * Por isso o corpo chega em TODA passada, inclusive quando esta tudo bem: o
 * valor da linha verde nao e o conteudo dela, e existir.
 *
 * Autenticacao: segredo compartilhado em `x-sentinela-key`. Nao usa JWT porque
 * a sentinela nao deve carregar credencial que abra qualquer outra coisa — a
 * unica chave privada dela abre esta rota, que so escreve sinal de vida.
 * Fail-closed: sem o segredo configurado no servidor, ninguem entra.
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-origin, x-sentinela-key",
};

function json(corpo: unknown, status = 200): Response {
    return new Response(JSON.stringify(corpo), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

serveMonitored("sentinela-heartbeat", async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const segredo = Deno.env.get("SENTINELA_HEARTBEAT_KEY") ?? "";
    if (!segredo) {
        // 503, e nao 401: a chave ausente e defeito NOSSO de configuracao, e
        // precisa aparecer como incidente (o `serveMonitored` cuida disso) em
        // vez de se disfarcar de tentativa invalida da sentinela.
        return json({ success: false, error: "heartbeat_key_ausente" }, 503);
    }
    if (req.headers.get("x-sentinela-key") !== segredo) {
        return json({ success: false, error: "unauthorized" }, 401);
    }

    let corpo: Record<string, unknown>;
    try {
        corpo = await req.json();
    } catch {
        return json({ success: false, error: "corpo_invalido" }, 400);
    }

    const falhas = Array.isArray(corpo.falhas) ? corpo.falhas.map(String) : [];
    const confirmadas = Array.isArray(corpo.confirmadas) ? corpo.confirmadas.map(String) : [];
    const ok = corpo.ok === true;

    // A sentinela conta o tempo em epoch (`int(time.time())`), porque o estado
    // dela e um json de maquina, nao um relatorio. Aqui vira timestamptz — e
    // `caiu_em` fica NULO quando nao ha queda confirmada, nunca "agora".
    const caiuEm = typeof corpo.caiu_em === "number" && corpo.caiu_em > 0
        ? new Date(corpo.caiu_em * 1000).toISOString()
        : null;

    const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { error } = await supabase.from("sentinela_heartbeats").insert({
        medido_em: typeof corpo.medido_em === "string" ? corpo.medido_em : new Date().toISOString(),
        ok,
        falhas,
        confirmadas,
        login_medido: corpo.login_medido === true,
        caiu_em: caiuEm,
        avisado: corpo.avisado === true,
        detalhe: corpo.detalhe ?? {},
    });

    if (error) {
        // 500 de proposito: `serveMonitored` transforma em incidente. Um sinal
        // de vida que nao chega ao banco cega o `sentinela_health_scan`, que
        // passaria a acusar queda da VPS por culpa nossa.
        return json({ success: false, error: "insert_falhou", message: error.message }, 500);
    }

    // O incidente de painel so nasce depois das 3 confirmacoes da sentinela: e
    // a MESMA regra do WhatsApp dela, para os dois canais contarem a mesma
    // historia. `request_id` amarrado ao inicio da queda faz a passada seguinte
    // reincidir no mesmo incidente em vez de abrir um a cada 60 segundos.
    if (confirmadas.length > 0) {
        reportIncident({
            component: "sentinela:aplicacao-inacessivel",
            origem: "integracao_externa",
            requestId: `sentinela-fora:${caiuEm ?? "sem-inicio"}`,
            message: `Sonda externa: ${confirmadas.join(", ")} falhando ha 3 passadas seguidas.`,
            context: {
                falhas,
                confirmadas,
                detalhe: corpo.detalhe ?? {},
                medido_em: corpo.medido_em ?? null,
                login_medido: corpo.login_medido === true,
            },
        });
    }

    return json({ success: true, registrado: true });
});
