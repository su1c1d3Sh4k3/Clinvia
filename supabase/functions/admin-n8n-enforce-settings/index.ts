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
// Acoes:
//   inventory  — so le e classifica (padrao, nao escreve nada)
//   apply      — aplica, um por vez
//
// Chamada:
//   POST .../admin-n8n-enforce-settings
//   header x-service-key: SUPABASE_SECRET_KEY
//   body {"action":"inventory"}  |  {"action":"apply","ids":["..."]}

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

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

Deno.serve(async (req) => {
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

        if (action === "apply") {
            const pedidos: string[] | null = Array.isArray(body.ids) && body.ids.length ? body.ids : null;
            const fila = todos.filter((w) =>
                w.id !== ERROR_WORKFLOW && (pedidos ? pedidos.includes(w.id) : true));

            const relatorio: any[] = [];
            for (const w of fila) {          // um por vez, de proposito
                const antes = diagnostico(w);
                if (antes.ja_conforme) {
                    relatorio.push({ ...antes, resultado: "ja_estava_conforme" });
                    continue;
                }
                try {
                    // PUT com o workflow inteiro: o n8n rejeita PATCH parcial em
                    // /workflows/{id}. `nodes` e `connections` vao IGUAIS aos que
                    // acabamos de ler — so `settings` muda.
                    const atual = await n8n(`/workflows/${w.id}`, N8N_API_KEY);
                    const novo = {
                        name: atual.name,
                        nodes: atual.nodes,
                        connections: atual.connections,
                        settings: { ...(atual.settings || {}), ...ALVO },
                    };
                    const salvo = await n8n(`/workflows/${w.id}`, N8N_API_KEY, {
                        method: "PUT",
                        body: JSON.stringify(novo),
                    });
                    relatorio.push({
                        ...antes,
                        resultado: "atualizado",
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
