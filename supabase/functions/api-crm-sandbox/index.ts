import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { TERMINAL_STAGES } from "../_shared/crm-stages.ts";
import {
    apiError,
    dbErrorResponse,
    missingFields,
    readJsonBody,
    requireApiKey,
    unexpectedErrorResponse,
    unknownAction,
} from "../_shared/api-errors.ts";
import { loadSandboxContext, logSandboxCall, type SandboxContext, toSaoPaulo } from "../_shared/sandbox.ts";

/**
 * api-crm-sandbox
 *
 * Gêmea de `api-crm` no ambiente de teste. Mesmas ações e mesmas regras
 * (1 card ativo, etapas finais não se movem, encerrar resolve o ticket), só que
 * em `sandbox_crm` — o funil real da conta não é tocado.
 *
 * Header: x-api-key = SCHEDULING_API_KEY
 * Body: { action, conversation_id | user_id, stage?, services?, ... }
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const CRM_STAGES = [
    "Em Atendimento Humano", "Em Atendimento IA", "Qualificado", "Aguardando Pagamento", "Agendado",
    "Pesquisa de Satisfação", "Suporte", "Financeiro", "Pós-Venda", "Recorrencia", "Follow Up",
    "Ganho", "Perdido", "Sem Contato", "Sem Interesse", "Finalizado",
];

const VALID_ACTIONS = [
    "get_deal", "move_stage", "create_deal", "add_service", "close_ticket", "list_stages",
];

/** Card ativo do ambiente de teste (só existe um). */
async function cardAtivo(supabase: any, ctx: SandboxContext) {
    const { data } = await supabase
        .from("sandbox_crm").select("*")
        .eq("session_id", ctx.session.id).eq("is_active", true)
        .limit(1).maybeSingle();
    return data;
}

async function recalcularValor(supabase: any, crmId: string): Promise<number> {
    const { data } = await supabase.from("sandbox_crm_services").select("price").eq("crm_id", crmId);
    return (data || []).reduce((s: number, r: any) => s + (Number(r.price) || 0), 0);
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
        });

    try {
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const { action, stage, services, notes } = body!;
        if (!action) return unknownAction(corsHeaders, action, VALID_ACTIONS);

        // Catálogo estático: não precisa de sessão
        if (action === "list_stages") {
            return json({ stages: CRM_STAGES, terminal: TERMINAL_STAGES });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const ctx = await loadSandboxContext(supabase, {
            conversationId: body!.conversation_id,
            userId: body!.user_id,
        });

        // ── get_deal ──
        if (action === "get_deal") {
            const card = await cardAtivo(supabase, ctx);
            if (!card) {
                await logSandboxCall(supabase, ctx, {
                    function_name: "api-crm-sandbox",
                    label: "Consultou o funil: nenhuma negociação ativa",
                    request: body,
                });
                return json({ deal: null, message: "Nenhuma negociação ativa nesta conexão" });
            }
            const { data: svcs } = await supabase
                .from("sandbox_crm_services").select("id, service_client_id, service_name, price")
                .eq("crm_id", card.id);
            await logSandboxCall(supabase, ctx, {
                function_name: "api-crm-sandbox",
                label: `Consultou a negociação (etapa "${card.stage}")`,
                request: body,
            });
            return json({
                deal: {
                    id: card.id,
                    stage: card.stage,
                    value: await recalcularValor(supabase, card.id),
                    priority: null,
                    is_active: card.is_active,
                    notes: card.notes,
                    created_at: toSaoPaulo(card.created_at),
                    services: (svcs || []).map((s: any) => ({
                        id: s.id,
                        service_client_id: s.service_client_id,
                        service_name: s.service_name,
                        quantity: 1,
                        unit_price: s.price,
                    })),
                },
            });
        }

        // ── move_stage ──
        if (action === "move_stage") {
            const missingStage = missingFields(corsHeaders, body!, ["stage"],
                `Etapas válidas: ${CRM_STAGES.join(", ")}.`);
            if (missingStage) return missingStage;

            const matched = CRM_STAGES.find((s) => s.toLowerCase() === String(stage).toLowerCase());
            if (!matched) {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "invalid_stage",
                    message: `Etapa inválida: "${stage}" não existe no funil. Etapas válidas: ${CRM_STAGES.join(", ")}.`,
                });
            }

            const card = await cardAtivo(supabase, ctx);
            if (!card) {
                return apiError(corsHeaders, {
                    status: 404,
                    code: "no_active_deal",
                    message: "Não existe negociação ativa no ambiente de teste, então não há card para mover. Use a ação create_deal antes.",
                });
            }
            if (TERMINAL_STAGES.includes(card.stage)) {
                return apiError(corsHeaders, {
                    status: 409,
                    code: "deal_in_terminal_stage",
                    message: `A negociação já está na etapa final "${card.stage}" e etapas finais não podem ser movidas. Etapas finais: ${TERMINAL_STAGES.join(", ")}.`,
                });
            }

            const { data: updated, error } = await supabase
                .from("sandbox_crm")
                .update({
                    stage: matched,
                    is_active: !TERMINAL_STAGES.includes(matched),
                    updated_at: new Date().toISOString(),
                })
                .eq("id", card.id)
                .select("id, stage, is_active")
                .single();
            if (error) {
                return dbErrorResponse(corsHeaders, "crm_move_stage_failed",
                    `mover a negociação do ambiente de teste para a etapa "${matched}"`, error);
            }

            await supabase.from("sandbox_crm_history").insert({
                crm_id: card.id, user_id: ctx.userId, from_stage: card.stage, to_stage: matched,
            });
            await logSandboxCall(supabase, ctx, {
                function_name: "api-crm-sandbox",
                label: `Moveu o cliente de "${card.stage}" para "${matched}" no funil`,
                request: body,
            });

            return json({ success: true, deal: updated });
        }

        // ── create_deal ──
        if (action === "create_deal") {
            const targetStage = stage
                ? CRM_STAGES.find((s) => s.toLowerCase() === String(stage).toLowerCase()) || "Qualificado"
                : "Qualificado";

            const existing = await cardAtivo(supabase, ctx);
            if (existing) {
                return apiError(corsHeaders, {
                    status: 409,
                    code: "deal_already_exists",
                    message: `Já existe uma negociação ativa no ambiente de teste, na etapa "${existing.stage}". Só existe um card ativo por contato — use move_stage ou add_service.`,
                    extra: { deal_id: existing.id },
                });
            }

            const { data: newCard, error: cardError } = await supabase
                .from("sandbox_crm")
                .insert({
                    session_id: ctx.session.id,
                    user_id: ctx.userId,
                    contact_id: ctx.contact.id,
                    conversation_id: ctx.conversation.id,
                    stage: targetStage,
                    is_active: !TERMINAL_STAGES.includes(targetStage),
                    notes: notes || null,
                })
                .select("*")
                .single();
            if (cardError) {
                return dbErrorResponse(corsHeaders, "crm_create_deal_failed",
                    `criar a negociação na etapa "${targetStage}" no ambiente de teste`, cardError);
            }

            const inseridos: any[] = [];
            for (const svc of Array.isArray(services) ? services : []) {
                const wanted = svc?.service_name || svc?.name;
                if (!wanted) {
                    return apiError(corsHeaders, {
                        status: 400,
                        code: "service_name_missing",
                        message: "Um dos itens de `services` veio sem nome. Cada item precisa ter `service_name` (ou `name`) com o nome do serviço cadastrado.",
                        details: `Item recebido: ${JSON.stringify(svc)}`,
                    });
                }
                // O catálogo continua sendo o REAL da conta
                const { data: sc } = await supabase
                    .from("services_client").select("id, name, price")
                    .eq("user_id", ctx.userId).ilike("name", wanted).eq("status", true)
                    .limit(1).maybeSingle();
                inseridos.push({
                    crm_id: newCard.id,
                    user_id: ctx.userId,
                    service_client_id: sc?.id || null,
                    service_name: sc?.name || wanted,
                    price: svc.unit_price ?? sc?.price ?? 0,
                });
            }
            if (inseridos.length > 0) await supabase.from("sandbox_crm_services").insert(inseridos);

            await supabase.from("sandbox_crm_history").insert({
                crm_id: newCard.id, user_id: ctx.userId, from_stage: null, to_stage: targetStage,
            });
            await logSandboxCall(supabase, ctx, {
                function_name: "api-crm-sandbox",
                label: `Abriu uma negociação na etapa "${targetStage}"`,
                request: body,
            });

            return json({ success: true, deal: { ...newCard, services: inseridos } }, 201);
        }

        // ── add_service ──
        if (action === "add_service") {
            const card = await cardAtivo(supabase, ctx);
            if (!card) {
                return apiError(corsHeaders, {
                    status: 404,
                    code: "no_active_deal",
                    message: "Não existe negociação ativa no ambiente de teste, então não há onde adicionar o serviço. Use a ação create_deal primeiro.",
                });
            }
            if (TERMINAL_STAGES.includes(card.stage)) {
                return apiError(corsHeaders, {
                    status: 409,
                    code: "deal_in_terminal_stage",
                    message: `A negociação já está na etapa final "${card.stage}" e não aceita mais alterações. Etapas finais: ${TERMINAL_STAGES.join(", ")}.`,
                });
            }

            const serviceName = body!.service_name || body!.name;
            if (!serviceName) {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "missing_fields",
                    message: "Campo obrigatório ausente: service_name (o nome do serviço, exatamente como está cadastrado no catálogo da conta).",
                    details: `Campos recebidos: ${Object.keys(body!).join(", ") || "(nenhum)"}`,
                });
            }

            const { data: sc } = await supabase
                .from("services_client").select("id, name, price")
                .eq("user_id", ctx.userId).ilike("name", serviceName).eq("status", true)
                .limit(1).maybeSingle();
            if (!sc) {
                return apiError(corsHeaders, {
                    status: 404,
                    code: "service_not_found",
                    message: `Serviço "${serviceName}" não encontrado no catálogo ativo desta conta. Confira o nome exato em Serviços — serviços desativados também não são aceitos.`,
                });
            }

            const { data: jaTem } = await supabase
                .from("sandbox_crm_services").select("id")
                .eq("crm_id", card.id).eq("service_client_id", sc.id).maybeSingle();
            if (jaTem) return json({ message: "Serviço já está na negociação", service: sc.name });

            const price = body!.unit_price ?? sc.price ?? 0;
            const { error: insertError } = await supabase.from("sandbox_crm_services").insert({
                crm_id: card.id, user_id: ctx.userId,
                service_client_id: sc.id, service_name: sc.name, price,
            });
            if (insertError) {
                return dbErrorResponse(corsHeaders, "crm_add_service_failed",
                    `adicionar o serviço "${sc.name}" à negociação do ambiente de teste`, insertError);
            }

            const total = await recalcularValor(supabase, card.id);
            await logSandboxCall(supabase, ctx, {
                function_name: "api-crm-sandbox",
                label: `Incluiu "${sc.name}" na negociação`,
                request: body,
            });

            return json({ success: true, service: sc.name, quantity: 1, unit_price: price, deal_value: total });
        }

        // ── close_ticket ──
        if (action === "close_ticket") {
            const missingStage = missingFields(corsHeaders, body!, ["stage"],
                `Para encerrar, informe a etapa final. Etapas válidas: ${TERMINAL_STAGES.join(", ")}.`);
            if (missingStage) return missingStage;

            const matched = TERMINAL_STAGES.find((s) => s.toLowerCase() === String(stage).toLowerCase());
            if (!matched) {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "invalid_terminal_stage",
                    message: `Etapa de encerramento inválida: "${stage}" não é uma etapa final. Etapas válidas para close_ticket: ${TERMINAL_STAGES.join(", ")}.`,
                });
            }

            const card = await cardAtivo(supabase, ctx);
            if (card) {
                await supabase.from("sandbox_crm")
                    .update({ stage: matched, is_active: false, updated_at: new Date().toISOString() })
                    .eq("id", card.id);
                await supabase.from("sandbox_crm_history").insert({
                    crm_id: card.id, user_id: ctx.userId, from_stage: card.stage, to_stage: matched,
                });
            }
            await supabase.from("sandbox_conversations")
                .update({ status: "resolved" }).eq("id", ctx.conversation.id);

            await logSandboxCall(supabase, ctx, {
                function_name: "api-crm-sandbox",
                label: `Encerrou o atendimento com a etapa "${matched}"`,
                request: body,
            });

            return json({
                success: true,
                stage: matched,
                conversation_id: ctx.conversation.id,
                conversation_resolved: true,
                remaining_active_deal: null,
                message: `Negociação movida para "${matched}" e ticket encerrado`,
            });
        }

        return unknownAction(corsHeaders, action, VALID_ACTIONS);
    } catch (error) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de CRM do ambiente de teste (api-crm-sandbox)", error, req);
    }
});
