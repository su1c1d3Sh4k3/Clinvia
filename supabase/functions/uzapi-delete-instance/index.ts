// uzapi-delete-instance — exclusão de instância da API não oficial.
//
// A REGRA QUE MUDOU (25/09/2026): PROVEDOR RECUSOU ⇒ A LINHA NÃO É APAGADA.
//
// A versão anterior apagava a nossa linha mesmo quando a UAZAPI recusava, e o
// comentário assumia que isso era respeitar o pedido do cliente. Não é. O número
// continua conectado na UAZAPI, continua recebendo mensagem de paciente,
// provavelmente continua sendo cobrado — e a única coisa que a exclusão remove é
// a nossa capacidade de enxergar que ele existe. Dado que a gente enxerga é
// sempre melhor que órfão invisível.
//
// Medido no dia da correção: a UAZAPI tinha 11 instâncias e a nossa tabela, 2
// linhas `uzapi`. Nove órfãs, sete delas de clínicas reais.
//
// Agora: recusa (ou ausência de token para pedir) marca `removal_pending_at`,
// devolve ao cliente uma frase que diz a verdade e abre incidente
// `uazapi:remocao-pendente` para alguém concluir.
//
// POR QUE A RECUSA RESPONDE 200 E NÃO 5xx
// `serveMonitored` reporta toda resposta ≥ 500 com o componente da FUNCTION.
// Aqui o incidente certo é o do PROVEDOR (`uazapi:remocao-pendente`), e ele já é
// aberto à mão logo abaixo — um 5xx só acrescentaria um segundo incidente, com o
// nome errado, para o mesmo fato. O corpo carrega `pending_removal: true`, que é
// o que o front lê. (Mesmo raciocínio do desligamento do Google Calendar.)
//
// AUTENTICAÇÃO: esta function rodou com `verify_jwt = false` e SEM nenhuma
// checagem de dono até hoje — qualquer um que soubesse o UUID de uma instância
// podia apagá-la na UAZAPI e no nosso banco, anonimamente. Agora exige JWT de
// usuário e só enxerga instância do próprio tenant. O `verify_jwt` do gateway
// sozinho não resolveria nada (a chave anon é um JWT válido e está no bundle
// público do front): o que segura é a checagem de dono daqui de dentro.

import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { fetchProvider } from "../_shared/provider-errors.ts";
import { reportIncident, setIncidentComponent } from "../_shared/report-incident.ts";

setIncidentComponent("uzapi-delete-instance");

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-origin",
};

const UZAPI_URL = "https://clinvia.uazapi.com";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Frase única para o cliente. Diz o que aconteceu e quem conclui — nada de "erro ao deletar". */
const AVISO_PENDENTE =
    "Não conseguimos remover essa conexão no provedor de WhatsApp. " +
    "Ela continua listada aqui de propósito, marcada como remoção pendente: " +
    "apagá-la daqui deixaria o número ativo no provedor sem nenhum controle nosso. " +
    "O suporte foi avisado e vai concluir a remoção.";

function json(corpo: unknown, status = 200) {
    return new Response(JSON.stringify(corpo), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

serveMonitored("uzapi-delete-instance", async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        // ── Quem está pedindo ──
        const authHeader = req.headers.get("Authorization") || "";
        const { data: { user }, error: userError } = await supabase.auth.getUser(
            authHeader.replace("Bearer ", ""),
        );
        if (userError || !user) {
            return json({ success: false, error: "Não autorizado.", code: "unauthorized" }, 401);
        }

        let ownerId = user.id;
        const { data: teamMember } = await supabase
            .from("team_members")
            .select("user_id")
            .eq("auth_user_id", user.id)
            .maybeSingle();
        if (teamMember?.user_id) ownerId = teamMember.user_id;

        let corpo: { instanceId?: unknown };
        try {
            corpo = await req.json();
        } catch {
            return json({ success: false, error: "Corpo da requisição inválido.", code: "invalid_body" }, 400);
        }

        const instanceId = typeof corpo.instanceId === "string" ? corpo.instanceId : "";
        if (!UUID.test(instanceId)) {
            return json({ success: false, error: "instanceId ausente ou inválido.", code: "invalid_instance_id" }, 400);
        }

        // Instância do PRÓPRIO tenant. Um id de outra conta responde igual a um id
        // inexistente — de propósito: a resposta não pode servir de sonda.
        const { data: instance, error: fetchError } = await supabase
            .from("instances")
            .select("id, instance_name, name, apikey, provider, user_id")
            .eq("id", instanceId)
            .eq("user_id", ownerId)
            .maybeSingle();

        if (fetchError) {
            console.error("[uzapi-delete-instance] leitura da instância falhou:", fetchError.message);
            return json({ success: false, error: "Não foi possível ler a conexão.", code: "db_error" }, 500);
        }
        if (!instance) {
            return json({ success: false, error: "Conexão não encontrada.", code: "instance_not_found" }, 404);
        }

        const rotulo = instance.instance_name || instance.name || instance.id;

        // ── Pedido de remoção ao provedor ──
        let recusa: string | null = null;

        if (!instance.apikey) {
            // Sem token não há como PERGUNTAR à UAZAPI se a instância existe. Apagar
            // no escuro é exatamente como nascem as órfãs; a pendência é o caminho seguro.
            recusa = "Sem token da instância: não há como pedir a remoção ao provedor.";
        } else {
            const resp = await fetchProvider(`${UZAPI_URL}/instance`, {
                method: "DELETE",
                headers: { "Accept": "application/json", "token": instance.apikey },
            });

            if (!resp.ok) {
                const texto = (await resp.text().catch(() => "")).slice(0, 500);
                recusa = `HTTP ${resp.status} — ${texto || "sem corpo"}`;
            }
        }

        if (recusa) {
            const { error: marcaError } = await supabase
                .from("instances")
                .update({
                    removal_pending_at: new Date().toISOString(),
                    removal_error: recusa,
                    removal_requested_by: user.id,
                })
                .eq("id", instance.id);

            if (marcaError) {
                // Não conseguimos remover no provedor NEM registrar a pendência: este é o
                // único caminho aqui que merece 5xx, porque agora ninguém sabe de nada.
                console.error("[uzapi-delete-instance] não gravou a pendência:", marcaError.message);
                return json({
                    success: false,
                    error: "Não conseguimos remover no provedor e nem registrar a pendência. Avise o suporte.",
                    code: "pending_not_recorded",
                }, 500);
            }

            reportIncident({
                component: "uazapi:remocao-pendente",
                origem: "front",
                message: `Remoção recusada pela UAZAPI em "${rotulo}" — ${recusa}`,
                ownerId,
                context: {
                    instance_id: instance.id,
                    instance_name: instance.instance_name,
                    tinha_token: Boolean(instance.apikey),
                    recusa,
                },
            });

            return json({ success: false, pending_removal: true, message: AVISO_PENDENTE });
        }

        // ── Provedor confirmou: aí sim a linha sai ──
        const { error: deleteError } = await supabase
            .from("instances")
            .delete()
            .eq("id", instance.id);

        if (deleteError) {
            console.error("[uzapi-delete-instance] provedor removeu mas o banco não:", deleteError.message);
            return json({
                success: false,
                error: "A conexão foi removida no provedor, mas a linha não saiu do banco. Avise o suporte.",
                code: "db_delete_failed",
            }, 500);
        }

        return json({ success: true });
    } catch (error) {
        console.error("[uzapi-delete-instance] erro inesperado:", error);
        return json({
            success: false,
            error: "Erro inesperado ao excluir a conexão.",
            code: "unexpected_error",
        }, 500);
    }
});
