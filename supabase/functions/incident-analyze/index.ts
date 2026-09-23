// incident-analyze — a IA que le o incidente e diz o que houve.
//
// POR QUE ESTA FUNCAO EXISTE:
// o monitoramento inteiro foi construido em cima da premissa de que uma IA
// analisaria cada incidente e preencheria causa, origem, impacto e acao. A §4 do
// plano descreve isso desde o inicio, as colunas `ai_*` existem no banco desde a
// primeira migration e as duas funcoes de reserva/gravacao foram aplicadas em
// 23/09. So que a function NUNCA foi construida. O efeito pratico: `analyzed_at`
// era sempre null, e o despachante — que tinha sido afrouxado justamente para
// nao segurar incidente grave esperando uma analise que nunca vinha — mandava
// "Causa provavel: analise ainda nao feita". Alerta sem analise nao e alerta, e
// lembrete. Esta function fecha esse buraco.
//
// CONTRATO COM O BANCO (ja existente, nada muda aqui):
//   incident_claim_for_analysis(limit) -> reserva e devolve os pendentes.
//       Passada 1 reaproveita analise de incidente resolvido do mesmo
//       fingerprint (custo zero). Passada 2 devolve o que precisa mesmo da IA.
//   incident_finish_analysis(id, jsonb) -> grava o resultado e solta a reserva.
//       A severidade do catalogo VENCE a da IA: o coalesce esta no SQL, nao aqui.
//
// REGRA DE RECORRENCIA (§4.1, ja acordada): erro identico passa pela IA UMA vez.
// Quem garante isso e o claim, nao esta function. Aqui nao ha retentativa em
// laco: falhou, solta a reserva e o proximo ciclo do cron tenta de novo.
//
// CUSTO: chave da plataforma (OPENAI_API_KEY), consumo interno da Clinbia.
// Medido em `incidents.ai_tokens` / `incidents.ai_cost_usd`, NAO em
// token_usage_log: la `owner_id` e NOT NULL e tudo que entra aparece no
// relatorio de um tenant — gravar o custo da plataforma la falsificaria a conta
// de alguem. O preco vem de `llm_model_prices`, sem margem. Se o preco do
// modelo nao estiver cadastrado, a analise acontece do mesmo jeito e o custo
// fica nulo: perder a medicao de alguns centavos e melhor do que perder a
// analise.
//
// Acoes:
//   { action: "scan", limit?: 5 }  -> drena a fila de analise (cron */2)
//   { action: "one", incident_id } -> analisa um incidente especifico, a mao
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

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: corsHeaders });

// deno-lint-ignore no-explicit-any
type Db = any;

const MODELO_PADRAO = "gpt-4.1-mini";

// ── Sanitizacao ──────────────────────────────────────────────────────────────

/**
 * O que vai para a OpenAI passa por aqui. Dois motivos, nesta ordem:
 * 1. segredo nao sai do banco. Um erro de autenticacao carrega token na
 *    mensagem com frequencia desconfortavel.
 * 2. custo. Stack de 400 linhas nao melhora a analise e multiplica o prompt.
 */
function limpar(v: unknown, max = 1200): string {
    let s = String(v ?? "").trim();
    if (!s) return "";
    s = s
        .replace(/\b(eyJ[A-Za-z0-9_-]{10,})/g, "<jwt-omitido>")
        .replace(/\b(sb_secret_[A-Za-z0-9_-]{6,})/g, "<chave-omitida>")
        .replace(/\b(sk-[A-Za-z0-9_-]{10,})/g, "<chave-omitida>")
        .replace(/\b(EAA[A-Za-z0-9]{20,})/g, "<token-meta-omitido>")
        .replace(/("?(?:authorization|apikey|api_key|token|password|secret)"?\s*[:=]\s*)("?)[^\s",}]+/gi,
                 '$1$2<omitido>');
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** Stack e util nas primeiras linhas; o resto e ruido caro. */
function tresLinhas(stack: unknown): string {
    return limpar(String(stack ?? "").split("\n").slice(0, 3).join("\n"), 600);
}

// ── Contrato de saida ────────────────────────────────────────────────────────

/**
 * json_schema com `strict`: a OpenAI garante a forma, entao nao existe parse de
 * texto livre nem campo faltando. `origem` e obrigatorio de proposito — quando a
 * IA nao consegue afirmar, a instrucao manda escrever as duas hipoteses mais
 * provaveis e o que olhar para confirmar. Campo vazio derruba a confianca a 0 e
 * o painel mostra "origem nao determinada".
 */
const SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["resumo", "causa", "origem", "severidade", "impacto", "acao_sistema", "acao_n8n", "confianca"],
    properties: {
        resumo: {
            type: "string",
            description: "Uma frase dizendo o que houve, em portugues, sem repetir o nome do componente.",
        },
        causa: { type: "string", description: "Causa provavel, concreta." },
        origem: {
            type: "string",
            description:
                "Onde nasce: arquivo e linha, no do workflow, job agendado ou integracao externa. Se nao der para afirmar, as DUAS hipoteses mais provaveis e o que olhar para confirmar cada uma.",
        },
        severidade: { type: "string", enum: ["critica", "alta", "media", "baixa"] },
        impacto: { type: "string", description: "O que o cliente final deixa de conseguir fazer." },
        acao_sistema: {
            type: "string",
            description: "Acao concreta no codigo/banco. Vazio se nao se aplica. NUNCA 'abrir o painel e investigar'.",
        },
        acao_n8n: { type: "string", description: "Acao concreta no n8n. Vazio se nao se aplica." },
        confianca: { type: "number", description: "0 a 1." },
    },
} as const;

const INSTRUCAO = `Voce analisa incidentes de uma plataforma de atendimento para clinicas (Clinbia).
Stack: React + Supabase (Postgres, Edge Functions em Deno, pg_cron), n8n para os fluxos de IA,
WhatsApp via UAZAPI e Meta Cloud API, Instagram Direct.

Responda SEMPRE em portugues do Brasil, direto, sem preambulo.

NATUREZA DO COMPONENTE — leia antes de qualquer outra coisa.
O contexto sempre traz uma linha "Natureza:". Ela decide o que o incidente significa:
- Natureza SERVICO: o componente executa algo e o incidente significa que ele FALHOU.
  Analise a falha.
- Natureza DETECTOR: o componente vigia algo e o incidente significa que ele FUNCIONOU e
  ACHOU alguma coisa. O defeito NAO esta nele. Analise o que foi detectado, no sistema
  vigiado. Recomendar "revisar o detector" ou "validar o calculo do detector" e uma
  inversao: se o numero dele estivesse errado, isso seria outro incidente. Trate o achado
  como verdadeiro.
- Natureza DESCONHECIDA: o componente nao esta catalogado. NAO afirme que ele falhou nem
  que ele detectou. Descreva so o que o evento bruto mostra e baixe a confianca.

REGRAS DO PRODUTO QUE VOCE NAO PODE CONTRARIAR.
Sao decisoes de negocio ja tomadas, nao defeitos. Sugerir o contrario e pior do que nao
responder, porque manda quem le desfazer algo que foi feito de proposito:
1. Conta de cliente NAO tem teto de gasto de IA. O limite de gasto dos projetos da OpenAI
   foi removido deliberadamente. O controle de custo desta plataforma e ALERTA, nunca
   corte: cliente nunca pode parar de ser atendido por causa de valor. Nunca recomende
   implementar limite, teto, spend limit, cota ou bloqueio por custo. Diga o que investigar
   no consumo.
2. O painel de custo do cliente mostra, de proposito, um valor ACIMA do custo do provedor
   (margem de 30%). Numero do painel maior que a fatura da OpenAI nao e erro de calculo.
Se a correcao que voce ia sugerir contraria uma destas regras, proponha o que fazer DENTRO
da regra.

Regras de severidade, nesta ordem exata:
- critica: cliente final sem atendimento, dado em risco, ou cobranca quebrada.
- alta: funcao importante fora do ar, mas existe contorno.
- media: falhou e o fallback funcionou.
- baixa: ruido.

Regras de conteudo:
- "resumo" e uma frase sobre o que aconteceu de fato. Nao repita o nome do componente,
  quem le ja tem esse dado na linha de cima da mensagem.
- "origem" e obrigatorio. Prefira arquivo+linha, no do workflow, nome do job ou a
  integracao externa. Se nao der para afirmar, escreva as duas hipoteses mais provaveis
  e o que olhar para confirmar cada uma. Nao invente caminho de arquivo que voce nao viu
  no contexto.
- acao_sistema e acao_n8n sao passos executaveis. Se voce nao sabe a correcao, diga o que
  olhar PRIMEIRO e POR QUE aquilo vem primeiro. Nunca escreva "abrir o painel e investigar",
  "verificar os logs" ou equivalente generico.
- Quando o contexto trouxer "padroes conhecidos que casaram", trate-os como verdade ja
  verificada por um humano e use-os. Eles vencem o seu palpite.
- Se o contexto for insuficiente para uma causa, diga isso em "causa" e baixe "confianca".
  Preferimos incerteza declarada a certeza inventada.`;

// ── Montagem do contexto ─────────────────────────────────────────────────────

async function montarContexto(supabase: Db, inc: Record<string, unknown>) {
    const incidentId = inc.id as string;

    // O evento bruto e a materia-prima. Ate hoje ninguem lia esta tabela na hora
    // de montar mensagem, e era por isso que o alerta saia sem detalhe nenhum.
    const { data: eventos } = await supabase
        .from("incident_events")
        .select(
            "received_at, source, environment, workflow_name, execution_url, failed_node, failed_node_type, error_name, error_message, error_description, error_stack, http_code, request_id, context",
        )
        .eq("incident_id", incidentId)
        .order("id", { ascending: false })
        .limit(3);

    const ultimo = eventos?.[0] ?? {};

    // Padroes conhecidos: curadoria humana, vence palpite de IA.
    const alvo = [
        ultimo.error_message,
        ultimo.error_name,
        ultimo.error_description,
        String(inc.component ?? ""),
    ].filter(Boolean).join(" \n ").toLowerCase();

    const { data: catalogo } = await supabase
        .from("incident_catalog")
        .select("pattern, match_type, source, component, causa, acao, severidade_sugerida")
        .eq("is_active", true);

    const casados = (catalogo ?? []).filter((c: Record<string, unknown>) => {
        if (c.source && c.source !== inc.source) return false;
        if (c.component && c.component !== inc.component) return false;
        const p = String(c.pattern ?? "").toLowerCase();
        if (!p) return false;
        if (c.match_type === "regex") {
            try {
                return new RegExp(String(c.pattern), "i").test(alvo);
            } catch {
                return false;
            }
        }
        return alvo.includes(p);
    });

    // O que o componente faz, do catalogo estatico. Dar isso a IA evita que ela
    // deduza errado o proposito do componente a partir so do nome.
    const { data: infoRows } = await supabase
        .rpc("incident_component_info", { p_component: inc.component });
    const info = infoRows?.[0] ?? null;

    const partes = [
        `Componente: ${inc.component}`,
        `Origem do sinal: ${inc.source}`,
        info?.descricao ? `O que esse componente faz: ${info.descricao}` : null,
        // Sempre presente, inclusive no caso sem catalogo. A linha condicional
        // anterior so aparecia para detector catalogado: o alerta de gasto
        // anomalo de 23/09 caiu justamente no buraco (o emissor gravava um nome
        // fora do catalogo), a IA nao recebeu natureza nenhuma, tratou uma
        // deteccao como falha do detector e mandou criar teto de gasto.
        `Natureza: ${
            info?.natureza === "detector"
                ? "DETECTOR"
                : info?.natureza === "servico"
                ? "SERVICO"
                : "DESCONHECIDA (componente sem linha no catalogo)"
        }`,
        `Ocorrencias: ${inc.event_count} (primeira em ${inc.first_seen}, ultima em ${inc.last_seen})`,
        ultimo.environment ? `Ambiente: ${ultimo.environment}` : null,
        ultimo.error_name ? `Nome do erro: ${limpar(ultimo.error_name, 200)}` : null,
        ultimo.error_message ? `Mensagem: ${limpar(ultimo.error_message)}` : null,
        ultimo.error_description ? `Descricao: ${limpar(ultimo.error_description, 600)}` : null,
        ultimo.http_code ? `HTTP: ${ultimo.http_code}` : null,
        ultimo.failed_node
            ? `No que falhou: ${limpar(ultimo.failed_node, 200)} (${limpar(ultimo.failed_node_type, 120)})`
            : null,
        ultimo.workflow_name ? `Workflow: ${limpar(ultimo.workflow_name, 200)}` : null,
        ultimo.request_id ? `Request id: ${limpar(ultimo.request_id, 120)}` : null,
        ultimo.context && Object.keys(ultimo.context).length
            ? `Contexto do evento: ${limpar(JSON.stringify(ultimo.context), 900)}`
            : null,
        ultimo.error_stack ? `Stack (3 linhas):\n${tresLinhas(ultimo.error_stack)}` : null,
        casados.length
            ? `Padroes conhecidos que casaram (curadoria humana, tratar como verdade):\n` +
              casados.map((c: Record<string, unknown>) =>
                  `- "${c.pattern}" => causa: ${c.causa} | acao: ${c.acao} | severidade: ${c.severidade_sugerida ?? "-"}`
              ).join("\n")
            : null,
    ].filter(Boolean);

    return { texto: partes.join("\n"), casados, evento: ultimo, eventos: eventos ?? [] };
}

// ── Chamada da IA ────────────────────────────────────────────────────────────

type Analise = Record<string, unknown> & { modelo?: string };

async function analisar(
    chave: string,
    modelo: string,
    contexto: string,
): Promise<{ ok: true; analise: Analise; uso: Record<string, number> } | { ok: false; erro: string; codigo: string }> {
    let resp: Response;
    try {
        resp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: modelo,
                messages: [
                    { role: "system", content: INSTRUCAO },
                    { role: "user", content: contexto },
                ],
                temperature: 0.2,
                max_tokens: 700,
                response_format: {
                    type: "json_schema",
                    json_schema: { name: "analise_incidente", strict: true, schema: SCHEMA },
                },
            }),
        });
    } catch (e) {
        return { ok: false, erro: (e as Error).message, codigo: "network" };
    }

    if (!resp.ok) {
        const corpo = await resp.text().catch(() => "");
        // 429 sem cota e insufficient_quota sao o caso que ja custou semanas de
        // dado torto: precisam ser distinguiveis no retorno, nao virar "erro".
        const semCredito = /insufficient_quota|billing_hard_limit|no credits remaining/i.test(corpo);
        return {
            ok: false,
            codigo: semCredito ? "sem_credito" : `http_${resp.status}`,
            erro: `OpenAI ${resp.status}: ${corpo.slice(0, 300)}`,
        };
    }

    const data = await resp.json().catch(() => null);
    const bruto = data?.choices?.[0]?.message?.content;
    if (!bruto) return { ok: false, erro: "resposta sem conteudo", codigo: "empty" };

    let analise: Analise;
    try {
        analise = JSON.parse(bruto);
    } catch {
        return { ok: false, erro: "resposta nao e JSON valido", codigo: "bad_json" };
    }

    return {
        ok: true,
        analise,
        uso: {
            prompt: Number(data?.usage?.prompt_tokens ?? 0),
            completion: Number(data?.usage?.completion_tokens ?? 0),
            total: Number(data?.usage?.total_tokens ?? 0),
            cached: Number(data?.usage?.prompt_tokens_details?.cached_tokens ?? 0),
        },
    };
}

// ── Custo ────────────────────────────────────────────────────────────────────

/**
 * Preco de PROVEDOR, sem margem: este custo e da Clinbia, nao ha o que remarcar.
 * O token cacheado tem preco proprio e a OpenAI ja diz quantos foram, entao aqui
 * nao existe a estimativa de cache que o custo do n8n precisa usar.
 *
 * Modelo sem preco cadastrado devolve null e a analise segue: a medicao e
 * acessorio, a analise e o produto.
 */
async function custoUsd(
    supabase: Db,
    modelo: string,
    uso: Record<string, number>,
): Promise<number | null> {
    const { data, error } = await supabase
        .from("llm_model_prices")
        .select("input_usd_per_1m, output_usd_per_1m, cached_input_usd_per_1m")
        .eq("model", modelo)
        .maybeSingle();

    if (error || !data) {
        console.warn(`[incident-analyze] preco de ${modelo} nao cadastrado: custo nao medido`);
        return null;
    }

    const cacheado = Math.min(uso.cached, uso.prompt);
    const novo = Math.max(0, uso.prompt - cacheado);
    const precoCache = Number(data.cached_input_usd_per_1m ?? data.input_usd_per_1m ?? 0);

    const usd = (novo / 1e6) * Number(data.input_usd_per_1m ?? 0)
        + (cacheado / 1e6) * precoCache
        + (uso.completion / 1e6) * Number(data.output_usd_per_1m ?? 0);

    return Number(usd.toFixed(6));
}

// ── Reserva presa ────────────────────────────────────────────────────────────

/**
 * Falhou? Solta a reserva na hora. Sem isto o incidente ficaria 15 minutos
 * invisivel para o proximo ciclo (que e o tempo do claim considerar a reserva
 * abandonada), e o despachante mandaria o alerta degradado nesse meio tempo.
 */
async function soltarReserva(supabase: Db, id: string) {
    const { error } = await supabase
        .from("incidents")
        .update({ analysis_claimed_at: null })
        .eq("id", id);
    if (error) console.error("[incident-analyze] reserva presa em", id, error.message);
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
        const action = typeof body?.action === "string" ? body.action : "scan";

        const { data: cfg } = await supabase
            .from("llm_platform_settings")
            .select("alert_analyze_enabled, alert_analyze_model")
            .limit(1)
            .maybeSingle();

        if (cfg?.alert_analyze_enabled === false) {
            return json({ success: true, skipped: "alert_analyze_enabled=false" });
        }
        const modelo = cfg?.alert_analyze_model || MODELO_PADRAO;

        const chave = Deno.env.get("OPENAI_API_KEY");
        if (!chave) {
            return json(
                { success: false, error: "OPENAI_API_KEY ausente", code: "missing_openai_key" },
                503,
            );
        }

        // ── quem analisar ─────────────────────────────────────────────────────
        let fila: Record<string, unknown>[] = [];

        if (action === "one") {
            const id = typeof body?.incident_id === "string" ? body.incident_id : "";
            if (!id) {
                return json(
                    { success: false, error: "incident_id não fornecido", code: "missing_incident_id" },
                    400,
                );
            }
            // A mao nao passa pelo claim de proposito: serve para reanalisar um
            // incidente que ja tem analise, quando ela saiu ruim.
            const { data: inc, error } = await supabase
                .from("incidents")
                .select("id, fingerprint, source, component, event_count, first_seen, last_seen")
                .eq("id", id)
                .maybeSingle();
            if (error) throw new Error(`incidents: ${error.message}`);
            if (!inc) {
                return json(
                    { success: false, error: "Incidente não encontrado", code: "incident_not_found" },
                    404,
                );
            }
            fila = [inc];
        } else {
            const limite = Math.min(Math.max(Number(body?.limit ?? 5), 1), 20);
            const { data, error } = await supabase
                .rpc("incident_claim_for_analysis", { p_limit: limite });
            if (error) throw new Error(`incident_claim_for_analysis: ${error.message}`);
            fila = data ?? [];
        }

        if (!fila.length) return json({ success: true, action, analisados: 0 });

        // ── analisa, um por vez ───────────────────────────────────────────────
        const resultados: Record<string, unknown>[] = [];

        for (const inc of fila) {
            const id = inc.id as string;
            const { texto, casados } = await montarContexto(supabase, inc);

            const r = await analisar(chave, modelo, texto);

            if (!r.ok) {
                console.error(`[incident-analyze] ${id}: ${r.codigo} ${r.erro}`);
                await soltarReserva(supabase, id);

                // Falha de analise e noticia por si so — foi exatamente isso que
                // ficou invisivel ate hoje. Vira incidente proprio, deduplicado
                // pelo fingerprint, entao nao vira enxurrada.
                await supabase.rpc("incident_record", {
                    p_payload: {
                        source: "db_job",
                        component: "monitoramento:analise-indisponivel",
                        error_name: r.codigo,
                        error_message:
                            `A analise por IA falhou (${r.codigo}). Enquanto isso, os alertas saem sem causa provavel. Detalhe: ${r.erro}`,
                        severity: r.codigo === "sem_credito" ? "critica" : "alta",
                        context: { incidente_afetado: id, modelo, codigo: r.codigo },
                    },
                }).then(({ error }: { error: { message: string } | null }) => {
                    if (error) console.error("[incident-analyze] incident_record:", error.message);
                });

                resultados.push({ incidente: id, ok: false, codigo: r.codigo });
                continue;
            }

            // Origem vazia derruba a confianca: o painel mostra "origem nao
            // determinada" em vez de fingir que sabe.
            const origem = String(r.analise.origem ?? "").trim();
            const confianca = origem ? Number(r.analise.confianca ?? 0) : 0;

            // Catalogo vence IA tambem na acao: quando um padrao humano casou,
            // a acao dele entra na frente.
            const acaoSistema = casados.length
                ? String(casados[0].acao ?? r.analise.acao_sistema ?? "")
                : String(r.analise.acao_sistema ?? "");

            const usd = await custoUsd(supabase, modelo, r.uso);

            const { error: fErr } = await supabase.rpc("incident_finish_analysis", {
                p_incident_id: id,
                p_result: {
                    resumo: r.analise.resumo,
                    causa: r.analise.causa,
                    origem,
                    severidade: r.analise.severidade,
                    impacto: r.analise.impacto,
                    acao_sistema: acaoSistema,
                    acao_n8n: r.analise.acao_n8n,
                    confianca,
                    modelo,
                    tokens: r.uso.total,
                    ...(usd === null ? {} : { custo_usd: usd }),
                },
            });
            if (fErr) {
                console.error(`[incident-analyze] finish ${id}: ${fErr.message}`);
                await soltarReserva(supabase, id);
                resultados.push({ incidente: id, ok: false, codigo: "finish_failed" });
                continue;
            }

            resultados.push({
                incidente: id,
                ok: true,
                severidade: r.analise.severidade,
                confianca,
                padroes_casados: casados.length,
                tokens: r.uso.total,
                custo_usd: usd,
            });
        }

        return json({
            success: true,
            action,
            analisados: resultados.filter((x) => x.ok).length,
            falhas: resultados.filter((x) => !x.ok).length,
            resultados,
        });
    } catch (e) {
        const msg = (e as Error).message;
        console.error("[incident-analyze] erro:", msg);
        return json({ success: false, error: msg, code: "unexpected_error" }, 500);
    }
});
