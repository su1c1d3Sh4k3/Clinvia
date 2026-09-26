// =====================================================
// uzapi-instancias-orfas — reconciliacao REVERSA
// =====================================================
// A reconciliacao que ja existia olha do nosso lado para fora: a linha existe
// aqui, o provedor recusou apagar, marca `removal_pending_at`. Esta olha do
// lado de fora para ca: a instancia existe na UAZAPI e NAO existe em
// `public.instances`.
//
// Por que isso importa: orfa e numero de clinica conectado a um servidor que a
// gente paga e nao controla. Nao aparece em tela nenhuma, ninguem monitora, e a
// cobranca do provedor nao e zero so porque a linha sumiu do nosso banco.
//
// Severidade BAIXA e SOMENTE PAINEL, de proposito: nao e incidente de operacao,
// e divida de cadastro. Acordar o telefone dele com um resto de 2026-03 seria
// exatamente o ruido que a calibragem esta tentando matar.
//
// O admintoken vem de `UAZAPI_ADMIN_TOKEN` (secret). NAO copiar o valor para
// dentro do codigo — em 26/09/2026 o `uzapi-create-instance` passou a ler o
// mesmo secret e nao existe mais nenhuma copia do admintoken no repositorio.
//
// Acordada pelo cron `uzapi-orfas-scan` (uma vez por dia).
// =====================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { serveMonitored } from "../_shared/serve-monitored.ts";
import { reportIncident } from "../_shared/report-incident.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-origin, x-service-key",
};

const COMPONENTE = "uazapi:instancia-orfa";
const UZAPI_URL = "https://clinvia.uazapi.com";

interface InstanciaProvedor {
    id?: string;
    name?: string;
    token?: string;
    status?: string;
    created?: string;
    profileName?: string;
    systemName?: string;
}

// Mensagem ESTAVEL: ela entra no fingerprint. O status da instancia muda
// ("disconnected" hoje, "connected" amanha) e, se entrasse aqui, daria um
// incidente por ESTADO em vez de um por instancia. O estado viaja no contexto.
const mensagem = (nome: string) =>
    `Instancia "${nome}" existe na UAZAPI e nao existe em public.instances.`;

serveMonitored("uzapi-instancias-orfas", async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const adminToken = Deno.env.get("UAZAPI_ADMIN_TOKEN") ?? "";
    if (!adminToken) {
        // 500 de proposito: sem o token a varredura nao mede nada, e um
        // "0 orfas" silencioso seria pior que a falha — passaria por saude.
        console.error("[uzapi-instancias-orfas] UAZAPI_ADMIN_TOKEN ausente");
        return new Response(
            JSON.stringify({ success: false, error: "admin_token_missing" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const resposta = await fetch(`${UZAPI_URL}/instance/all`, {
        method: "GET",
        headers: { admintoken: adminToken, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(20_000),
    });

    if (!resposta.ok) {
        console.error(`[uzapi-instancias-orfas] UAZAPI respondeu ${resposta.status}`);
        return new Response(
            JSON.stringify({ success: false, error: "uazapi_http_error", http_code: resposta.status }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    const cru = await resposta.json().catch(() => null);
    const doProvedor: InstanciaProvedor[] = Array.isArray(cru)
        ? cru
        : (cru?.instances ?? cru?.data ?? []);

    const { data: nossas, error: leituraErr } = await supabase
        .from("instances")
        .select("id, name, instance_name, apikey")
        .neq("provider", "meta");

    if (leituraErr) {
        console.error("[uzapi-instancias-orfas] erro lendo instances:", leituraErr);
        return new Response(
            JSON.stringify({ success: false, error: "db_read_failed", message: leituraErr.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    // VARREDURA CEGA. O provedor respondeu 200 com lista VAZIA enquanto nos
    // temos instancia UAZAPI cadastrada — impossivel na pratica: as nossas
    // existem la. Acontece de verdade: em 26/09/2026, logo depois da rotacao do
    // admintoken, `/instance/all` passou a devolver `[]` porque o token novo
    // enxerga outro escopo de administrador; as 11 instancias continuaram no ar.
    //
    // Sem este ramo o resultado seria "0 orfas" com `success: true` — saude
    // aparente — e na passada seguinte o fechamento automatico RESOLVERIA os
    // incidentes de orfa abertos, apagando a divida em vez de mostra-la. Um
    // detector que perde a visao tem que GRITAR, nunca devolver zero.
    if (doProvedor.length === 0 && (nossas ?? []).length > 0) {
        reportIncident({
            component: "uazapi:varredura-cega",
            route: "instance/all",
            message: "UAZAPI respondeu 200 com lista vazia de instancias; a varredura de orfas nao mediu nada.",
            origem: "cron",
            context: {
                instancias_uazapi_no_banco: (nossas ?? []).length,
                provavel_causa: "admintoken com escopo de administrador diferente do que criou as instancias",
            },
        });
        // 200, nao 5xx: `serveMonitored` relata >= 500 e abriria um SEGUNDO
        // incidente, com o componente da function no lugar do provedor — o
        // mesmo fato contado duas vezes, com dois nomes e duas gravidades.
        return new Response(
            JSON.stringify({ success: false, error: "varredura_cega", no_banco: (nossas ?? []).length }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    // Casamento pelo TOKEN, nao pelo nome: nome e editavel dos dois lados e
    // duas contas diferentes ja tiveram instancia chamada "recepção".
    const tokens = new Set((nossas ?? []).map((i) => i.apikey).filter(Boolean));
    const nomes = new Set(
        (nossas ?? []).flatMap((i) => [i.name, i.instance_name].filter(Boolean) as string[]),
    );

    const orfas = doProvedor.filter(
        (i) => i.token && !tokens.has(i.token) && !(i.name && nomes.has(i.name)),
    );

    for (const orfa of orfas) {
        const nome = orfa.name || orfa.id || "(sem nome)";
        reportIncident({
            component: COMPONENTE,
            route: orfa.id ?? nome,
            message: mensagem(nome),
            origem: "cron",
            context: {
                nome_no_provedor: nome,
                id_no_provedor: orfa.id ?? null,
                status_no_provedor: orfa.status ?? null,
                servidor: orfa.systemName ?? null,
                criada_em: orfa.created ?? null,
                tem_perfil_de_whatsapp: Boolean(orfa.profileName),
            },
        });
    }

    // Orfa que sumiu do provedor (ou que voltou a ter linha) fecha sozinha.
    // Sem isto a lista do painel so cresce e deixa de significar alguma coisa.
    const vivas = new Set(orfas.map((o) => o.id ?? o.name ?? ""));
    const { data: abertos } = await supabase
        .from("incidents")
        .select("id, fingerprint, context")
        .eq("component", COMPONENTE)
        .neq("status", "resolved");

    let fechados = 0;
    for (const inc of abertos ?? []) {
        const idProvedor = (inc.context as Record<string, unknown> | null)?.id_no_provedor;
        const chave = typeof idProvedor === "string" ? idProvedor : "";
        if (chave && vivas.has(chave)) continue;
        const { error: resolveErr } = await supabase.rpc("incident_resolver_edge", {
            p_component: COMPONENTE,
            p_route: chave,
            p_nota: "instancia nao esta mais orfa na UAZAPI",
        });
        if (resolveErr) {
            console.error("[uzapi-instancias-orfas] erro fechando incidente:", resolveErr);
        } else {
            fechados++;
        }
    }

    const resumo = {
        no_provedor: doProvedor.length,
        no_banco: (nossas ?? []).length,
        orfas: orfas.length,
        incidentes_fechados: fechados,
    };
    console.log("[uzapi-instancias-orfas] resumo:", JSON.stringify(resumo));

    return new Response(
        JSON.stringify({ success: true, ...resumo }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
});
