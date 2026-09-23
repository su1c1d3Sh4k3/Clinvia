// Impoe `settings` nos workflows do n8n: Error Workflow + retencao de execucao.
//
// Sem `errorWorkflow` apontando para o fluxo de captura, uma execucao que morre
// no n8n nao vira incidente — e foi assim que ficamos cegos naquela ponta. Os
// clones novos ja nascem certos; os antigos, nao. Quantos estavam sem Error
// Workflow e a medida de ha quanto tempo estivemos cegos.
//
// NAO toca em `nodes` nem em `connections`: so o objeto `settings`. O PATCH do
// n8n e feito um por vez, com relatorio de antes/depois por workflow.
//
// VEREDITO 23/09/2026 — `apply` NAO SERVE, e o motivo esta provado aqui:
//
//   1. O n8n nao tem PATCH parcial em /workflows/{id}: so PUT do workflow inteiro.
//   2. A API PUBLICA valida `settings` contra uma lista FECHADA. Medido pela acao
//      `probe_schema` (PUT num id inexistente: 400 = chave recusada, 404 = aceita):
//        aceitas : executionOrder, errorWorkflow, saveDataErrorExecution,
//                  saveDataSuccessExecution, saveManualExecutions, availableInMCP,
//                  callerPolicy, timezone, executionTimeout, saveExecutionProgress
//        RECUSADAS: binaryMode, timeSavedMode
//   3. Os 9 workflows carregam `binaryMode: "separate"` e `timeSavedMode: "fixed"`.
//      Logo, qualquer PUT por esta API so passa se APAGAR as duas — inclusive nos
//      moldes FLUXO PADRAO e FLUXO PADRAO INSTAGRAM, que sao clonados para cada
//      cliente novo. Perda silenciosa em molde e a pior forma dessa perda.
//   4. FLUXO BARBEARIA esta ARQUIVADO: o n8n recusa qualquer update nele.
//
// Conclusao: a retencao de execucao se ajusta A MAO na interface do n8n. Esta
// function fica como INVENTARIO (le e mede). `apply` segue no codigo para o dia
// em que o n8n aceitar PATCH, e ja reenvia pinData/staticData — mas nao use.
//
// Acoes:
//   inventory     — so le e classifica (padrao, nao escreve nada)
//   probe_schema  — descobre quais chaves de settings a API aceita, sem escrever
//   dump          — devolve o JSON INTEIRO dos ids pedidos (backup pre-PUT)
//   apply         — aplica, um por vez. NAO USE: ver veredito acima.
//
// Chamada:
//   POST .../admin-n8n-enforce-settings
//   header x-service-key: SUPABASE_SECRET_KEY
//   body {"action":"inventory"}  |  {"action":"apply","ids":["..."]}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

import { serveMonitored } from "../_shared/serve-monitored.ts";
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-service-key",
};

const ERROR_WORKFLOW = "KUI8UP9TXgn9rjtr";

const ALVO = {
    errorWorkflow: ERROR_WORKFLOW,
    saveDataErrorExecution: "all",
    saveDataSuccessExecution: "all",
    saveManualExecutions: true,
} as const;

const N8N_URL = "https://workflows.clinvia.com.br";

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body, null, 2), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

async function n8n(path: string, key: string, init?: RequestInit): Promise<any> {
    const res = await fetch(`${N8N_URL}/api/v1${path}`, {
        ...init,
        headers: { "X-N8N-API-KEY": key, "Content-Type": "application/json", ...(init?.headers || {}) },
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`n8n ${init?.method || "GET"} ${path} -> ${res.status}: ${txt.slice(0, 300)}`);
    return txt ? JSON.parse(txt) : null;
}

serveMonitored("admin-n8n-enforce-settings", async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    try {
        const esperado = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
        if (!esperado || req.headers.get("x-service-key") !== esperado) {
            return json({ success: false, error: "nao autorizado" }, 401);
        }

        const N8N_API_KEY = Deno.env.get("N8N_API_KEY");
        if (!N8N_API_KEY) return json({ success: false, error: "N8N_API_KEY ausente" }, 500);

        const body = await req.json().catch(() => ({}));
        const action = body.action ?? "inventory";

        // ids de workflow que o proprio produto registra = cliente, sem duvida
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );
        const conhecidos = new Set<string>();
        for (const [tabela, col] of [
            ["instances", "workflow_id"], ["instances", "workflow_code"],
            ["instagram_instances", "workflow_id"], ["instagram_instances", "workflow_code"],
            ["ia_config", "workflow_id"],
        ]) {
            const { data } = await supabase.from(tabela).select(col);
            for (const r of data || []) {
                const v = (r as Record<string, unknown>)[col];
                if (typeof v === "string" && v) conhecidos.add(v);
            }
        }

        // paginacao por cursor: sem isto o n8n devolve so a primeira pagina
        const todos: any[] = [];
        let cursor: string | null = null;
        do {
            const page: any = await n8n(
                `/workflows?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
                N8N_API_KEY,
            );
            todos.push(...(page?.data ?? []));
            cursor = page?.nextCursor ?? null;
        } while (cursor);

        const diagnostico = (w: any) => {
            const s = w.settings || {};
            return {
                id: w.id,
                nome: w.name,
                ativo: !!w.active,
                registrado_no_produto: conhecidos.has(w.id),
                e_o_proprio_error_workflow: w.id === ERROR_WORKFLOW,
                antes: {
                    errorWorkflow: s.errorWorkflow ?? null,
                    saveDataErrorExecution: s.saveDataErrorExecution ?? null,
                    saveDataSuccessExecution: s.saveDataSuccessExecution ?? null,
                    saveManualExecutions: s.saveManualExecutions ?? null,
                },
                ja_conforme:
                    s.errorWorkflow === ALVO.errorWorkflow &&
                    s.saveDataErrorExecution === ALVO.saveDataErrorExecution &&
                    s.saveDataSuccessExecution === ALVO.saveDataSuccessExecution &&
                    s.saveManualExecutions === ALVO.saveManualExecutions,
                sem_error_workflow: !s.errorWorkflow,
            };
        };

        const inventario = todos.map(diagnostico);

        if (action === "inventory") {
            return json({
                success: true,
                action,
                total: inventario.length,
                // a medida que ele pediu
                sem_error_workflow: inventario.filter((x) => x.sem_error_workflow).length,
                ja_conforme: inventario.filter((x) => x.ja_conforme).length,
                registrados_no_produto: inventario.filter((x) => x.registrado_no_produto).length,
                workflows: inventario,
            });
        }

        // Descobre QUAIS chaves de `settings` a API publica aceita, sem escrever em
        // nada: o validador de schema roda antes da busca do workflow, entao um id
        // inexistente devolve 400 (chave recusada) ou 404 (chave aceita).
        if (action === "probe_schema") {
            const chaves: string[] = Array.isArray(body.keys) ? body.keys : [];
            const fora: string[] = [];
            const dentro: string[] = [];
            for (const k of chaves) {
                try {
                    await n8n(`/workflows/id-que-nao-existe-0000`, N8N_API_KEY, {
                        method: "PUT",
                        body: JSON.stringify({
                            name: "x", nodes: [], connections: {},
                            settings: { [k]: k === "availableInMCP" ? false : "v1" },
                        }),
                    });
                    dentro.push(k);
                } catch (e) {
                    const txt = String(e);
                    if (txt.includes("additional properties")) fora.push(k);
                    else dentro.push(k);   // 404 = a chave passou pela validacao
                }
            }
            return json({ success: true, action, aceitas: dentro, recusadas: fora });
        }

        // put_probe — responde UMA pergunta: um PUT que OMITE `settings` preserva o
        // `settings` que ja esta gravado, ou zera?
        //
        // Isso decide se da para rotacionar a chave nos 127 nos por API. Se PUT
        // omitindo preserva, o unico dano possivel de um PUT e o que eu NAO mandar
        // de volta — e ai a rotacao vira uma operacao mensuravel, com backup antes.
        // Se zera, a API esta fora de questao e sobra a mao.
        //
        // Roda num workflow DESCARTAVEL criado aqui e apagado no fim: nenhum fluxo
        // real e tocado, nem o sandbox.
        if (action === "put_probe") {
            const nome = `zz-teste-put-probe-${Date.now()}`;
            const criado = await n8n("/workflows", N8N_API_KEY, {
                method: "POST",
                body: JSON.stringify({
                    name: nome,
                    nodes: [{
                        parameters: {}, id: crypto.randomUUID(), name: "No Operation",
                        type: "n8n-nodes-base.noOp", typeVersion: 1, position: [0, 0],
                    }],
                    connections: {},
                    settings: { executionOrder: "v1", executionTimeout: 3607, callerPolicy: "workflowsFromSameOwner" },
                }),
            });

            const id = criado.id;
            const passos: Record<string, unknown> = { id, nome, criado_settings: criado.settings };
            try {
                // PUT mandando so nome/nodes/connections — `settings` OMITIDO.
                let semSettings: unknown = null;
                try {
                    await n8n(`/workflows/${id}`, N8N_API_KEY, {
                        method: "PUT",
                        body: JSON.stringify({ name: nome, nodes: criado.nodes, connections: criado.connections }),
                    });
                    semSettings = "PUT aceito";
                } catch (e) {
                    semSettings = `PUT recusado: ${(e as Error).message}`;
                }
                passos.put_sem_settings = semSettings;
                passos.depois_do_put_sem_settings = (await n8n(`/workflows/${id}`, N8N_API_KEY)).settings;
            } finally {
                // Artefato meu, criado nesta chamada: some junto. Nada do dele.
                await n8n(`/workflows/${id}`, N8N_API_KEY, { method: "DELETE" }).catch(() => {});
            }
            return json({ success: true, action, passos });
        }

        if (action === "dump") {
            const pedidos: string[] = Array.isArray(body.ids) ? body.ids : [];
            const saida: Record<string, unknown> = {};
            for (const id of pedidos) saida[id] = await n8n(`/workflows/${id}`, N8N_API_KEY);
            return json({ success: true, action, workflows: saida });
        }

        if (action === "apply") {
            // Sem `ids` explicitos nao aplica em nada: um `apply` sem alvo cairia
            // em cima dos fluxos de cliente vivos, que e exatamente o que ele vetou.
            const pedidos: string[] | null = Array.isArray(body.ids) && body.ids.length ? body.ids : null;
            if (!pedidos) {
                return json({ success: false, error: "informe `ids`: apply sem alvo e proibido" }, 400);
            }
            const fila = todos.filter((w) => pedidos.includes(w.id));

            const relatorio: any[] = [];
            for (const w of fila) {          // um por vez, de proposito
                const antes = diagnostico(w);
                // O proprio fluxo de captura nao pode apontar para si mesmo: nele
                // aplicamos SO a retencao de execucao.
                const eOMonitor = w.id === ERROR_WORKFLOW;
                const alvo: Record<string, unknown> = eOMonitor
                    ? { saveDataErrorExecution: ALVO.saveDataErrorExecution,
                        saveDataSuccessExecution: ALVO.saveDataSuccessExecution,
                        saveManualExecutions: ALVO.saveManualExecutions }
                    : { ...ALVO };

                const conforme = Object.entries(alvo)
                    .every(([k, v]) => (w.settings || {})[k] === v);
                if (conforme) {
                    relatorio.push({ ...antes, resultado: "ja_estava_conforme" });
                    continue;
                }
                try {
                    // PUT com o workflow inteiro: o n8n rejeita PATCH parcial em
                    // /workflows/{id}. `nodes` e `connections` vao IGUAIS aos que
                    // acabamos de ler — so `settings` muda.
                    //
                    // PEGADINHA: um PUT que omite `pinData`/`staticData` os APAGA.
                    // Os 6 tem pinData e os 3 moldes tem staticData com o estado
                    // de recorrencia dos Schedule Triggers. Reenviamos os dois.
                    // Se a validacao do n8n recusar a propriedade extra, tentamos
                    // de novo so com staticData, e por ultimo sem nenhum dos dois
                    // — mas ai o relatorio diz o que foi perdido.
                    const atual = await n8n(`/workflows/${w.id}`, N8N_API_KEY);
                    const base = {
                        name: atual.name,
                        nodes: atual.nodes,
                        connections: atual.connections,
                        settings: { ...(atual.settings || {}), ...alvo },
                    };
                    const tentativas: Array<[string, Record<string, unknown>]> = [
                        ["com_pindata_e_staticdata", { ...base, pinData: atual.pinData ?? {}, staticData: atual.staticData ?? null }],
                        ["so_staticdata", { ...base, staticData: atual.staticData ?? null }],
                        ["so_o_minimo", base],
                    ];
                    let salvo: any = null;
                    let forma = "";
                    let recusas: string[] = [];
                    for (const [nome, payload] of tentativas) {
                        try {
                            salvo = await n8n(`/workflows/${w.id}`, N8N_API_KEY, {
                                method: "PUT",
                                body: JSON.stringify(payload),
                            });
                            forma = nome;
                            break;
                        } catch (e) {
                            recusas.push(`${nome}: ${String(e).slice(0, 160)}`);
                        }
                    }
                    if (!salvo) throw new Error(recusas.join(" | "));
                    relatorio.push({
                        ...antes,
                        resultado: "atualizado",
                        forma_do_put: forma,
                        recusas_antes_de_acertar: recusas,
                        preservado: {
                            pinData_antes: Object.keys(atual.pinData || {}).length,
                            pinData_depois: Object.keys(salvo?.pinData || {}).length,
                            staticData_antes: atual.staticData ? Object.keys(atual.staticData).length : 0,
                            staticData_depois: salvo?.staticData ? Object.keys(salvo.staticData).length : 0,
                            ativo_antes: !!atual.active,
                            ativo_depois: !!salvo?.active,
                        },
                        depois: {
                            errorWorkflow: salvo?.settings?.errorWorkflow ?? null,
                            saveDataErrorExecution: salvo?.settings?.saveDataErrorExecution ?? null,
                            saveDataSuccessExecution: salvo?.settings?.saveDataSuccessExecution ?? null,
                            saveManualExecutions: salvo?.settings?.saveManualExecutions ?? null,
                        },
                        nos_preservados: Array.isArray(salvo?.nodes)
                            ? salvo.nodes.length === (atual.nodes || []).length
                            : null,
                    });
                } catch (err) {
                    relatorio.push({ ...antes, resultado: "falhou", erro: String(err).slice(0, 300) });
                }
            }

            return json({
                success: true,
                action,
                tentados: relatorio.length,
                atualizados: relatorio.filter((r) => r.resultado === "atualizado").length,
                ja_conformes: relatorio.filter((r) => r.resultado === "ja_estava_conforme").length,
                falhas: relatorio.filter((r) => r.resultado === "falhou").length,
                relatorio,
            });
        }

        return json({ success: false, error: `acao desconhecida: ${action}` }, 400);
    } catch (err) {
        return json({ success: false, error: String(err).slice(0, 500) }, 500);
    }
});
