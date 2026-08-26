import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { TERMINAL_STAGES } from "../_shared/crm-stages.ts";
import {
    findActiveCardForChannel,
    resolveConversation,
} from "../_shared/resolve-conversation.ts";
import {
    apiError,
    dbErrorResponse,
    missingFields,
    readJsonBody,
    requireApiKey,
    unexpectedErrorResponse,
    unknownAction,
} from "../_shared/api-errors.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const CRM_STAGES = [
    'Em Atendimento Humano', 'Em Atendimento IA', 'Qualificado', 'Aguardando Pagamento', 'Agendado',
    'Pesquisa de Satisfação', 'Suporte', 'Financeiro', 'Pós-Venda', 'Recorrencia', 'Follow Up',
    'Ganho', 'Perdido', 'Sem Contato', 'Sem Interesse', 'Finalizado',
];

const VALID_ACTIONS = [
    "get_deal", "move_stage", "create_deal", "add_service", "close_ticket", "list_stages",
];


/** UTC → São Paulo (-03:00) */
function toSaoPaulo(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso as string;
    return d.toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T") + "-03:00";
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const { action, user_id, conversation_id, stage, services, priority, notes, loss_reason, loss_reason_other } = body!;

        const missing = missingFields(corsHeaders, body!, ["user_id"],
            "Envie o id da conta (bd_data.user_id no prompt da IA).");
        if (missing) return missing;

        if (!action) {
            return unknownAction(corsHeaders, action, VALID_ACTIONS);
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // `list_stages` é o único action sem conversa (catálogo estático)
        const conv = action === "list_stages"
            ? null
            : await resolveConversation(supabase, conversation_id, user_id);

        // ── ACTION: get_deal ──
        // Returns the active CRM card of this conversation's channel + its services
        if (action === "get_deal") {
            const card = await findActiveCardForChannel(supabase, conv!, "value, priority, is_active, notes, created_at");

            if (!card) {
                return new Response(
                    JSON.stringify({ deal: null, message: "Nenhuma negociação ativa nesta conexão" }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            const { data: svcs, error: svcsError } = await supabase
                .from("crm_client_services")
                .select("id, service_name, quantity, unit_price")
                .eq("crm_client_id", card.id);

            if (svcsError) {
                return dbErrorResponse(corsHeaders, "crm_services_read_failed",
                    "listar os serviços da negociação", svcsError);
            }

            return new Response(
                JSON.stringify({ deal: { ...card, created_at: toSaoPaulo(card.created_at), services: svcs || [] } }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ── ACTION: move_stage ──
        // Moves the active card to a new stage (by name)
        if (action === "move_stage") {
            const missingStage = missingFields(corsHeaders, body!, ["stage"],
                `Etapas válidas: ${CRM_STAGES.join(', ')}.`);
            if (missingStage) return missingStage;

            // Validate stage name (case-insensitive match)
            const matched = CRM_STAGES.find(s => s.toLowerCase() === String(stage).toLowerCase());
            if (!matched) {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "invalid_stage",
                    message: `Etapa inválida: "${stage}" não existe no funil. Etapas válidas: ${CRM_STAGES.join(', ')}.`,
                });
            }

            const card = await findActiveCardForChannel(supabase, conv!);

            if (!card) {
                return apiError(corsHeaders, {
                    status: 404,
                    code: "no_active_deal",
                    message: `Não existe negociação ativa para este contato na conexão desta conversa (conversation_id ${conv!.conversationId}), então não há card para mover. Use a ação create_deal para abrir uma negociação antes.`,
                });
            }

            if (TERMINAL_STAGES.includes(card.stage)) {
                return apiError(corsHeaders, {
                    status: 409,
                    code: "deal_in_terminal_stage",
                    message: `A negociação já está na etapa final "${card.stage}" e etapas finais não podem ser movidas. Etapas finais: ${TERMINAL_STAGES.join(', ')}.`,
                });
            }

            const updateData: any = {
                stage: matched,
                stage_changed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            // Terminal stage → deactivate
            if (TERMINAL_STAGES.includes(matched)) {
                updateData.is_active = false;
                if (matched === 'Perdido' || matched === 'Sem Interesse') {
                    updateData.loss_reason = loss_reason || 'other';
                    updateData.loss_reason_other = loss_reason_other || null;
                }
            }

            const { data: updated, error } = await supabase
                .from("crm_client")
                .update(updateData)
                .eq("id", card.id)
                .select("id, stage, is_active, value")
                .single();

            if (error) {
                return dbErrorResponse(corsHeaders, "crm_move_stage_failed",
                    `mover a negociação ${card.id} para a etapa "${matched}"`, error);
            }

            return new Response(
                JSON.stringify({ success: true, deal: updated }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ── ACTION: create_deal ──
        // Creates a new deal for a contact with optional services
        if (action === "create_deal") {
            // Validate stage
            const targetStage = stage
                ? CRM_STAGES.find(s => s.toLowerCase() === stage.toLowerCase()) || 'Qualificado'
                : 'Qualificado';

            // Já existe card ativo no funil desta conexão?
            const existing = await findActiveCardForChannel(supabase, conv!);

            if (existing) {
                return apiError(corsHeaders, {
                    status: 409,
                    code: "deal_already_exists",
                    message: `Este contato já possui uma negociação ativa na conexão desta conversa, na etapa "${existing.stage}" (deal_id ${existing.id}). Só existe um card ativo por contato em cada conexão — use move_stage ou add_service nessa negociação em vez de criar outra.`,
                    extra: { deal_id: existing.id },
                });
            }

            // Calculate total from services
            let totalValue = 0;
            const serviceInserts: any[] = [];

            if (services && Array.isArray(services) && services.length > 0) {
                for (const svc of services) {
                    // svc: { service_name, quantity?, unit_price? }
                    // Try to find services_client by name
                    const wanted = svc.service_name || svc.name;
                    if (!wanted) {
                        return apiError(corsHeaders, {
                            status: 400,
                            code: "service_name_missing",
                            message: "Um dos itens de `services` veio sem nome. Cada item precisa ter `service_name` (ou `name`) com o nome do serviço cadastrado.",
                            details: `Item recebido: ${JSON.stringify(svc)}`,
                        });
                    }

                    const { data: sc, error: scError } = await supabase
                        .from("services_client")
                        .select("id, name, price, min_price")
                        .eq("user_id", user_id)
                        .ilike("name", wanted)
                        .eq("status", true)
                        .limit(1)
                        .maybeSingle();

                    if (scError) {
                        return dbErrorResponse(corsHeaders, "service_lookup_failed",
                            `buscar o serviço "${wanted}" no catálogo desta conta`, scError);
                    }

                    const qty = svc.quantity || 1;
                    const price = svc.unit_price || sc?.price || 0;
                    const minPrice = sc?.min_price || 0;

                    serviceInserts.push({
                        service_client_id: sc?.id || null,
                        service_name: sc?.name || svc.service_name || svc.name,
                        quantity: qty,
                        unit_price: price,
                        min_price: minPrice,
                    });

                    totalValue += price * qty;
                }
            }

            // Create card
            const { data: newCard, error: cardError } = await supabase
                .from("crm_client")
                .insert({
                    user_id,
                    contact_id: conv!.contactId,
                    instance_id: conv!.instanceId,
                    instagram_instance_id: conv!.instagramInstanceId,
                    stage: targetStage,
                    stage_changed_at: new Date().toISOString(),
                    value: totalValue,
                    priority: priority || 'medium',
                    notes: notes || null,
                    is_active: !TERMINAL_STAGES.includes(targetStage),
                })
                .select()
                .single();

            if (cardError) {
                return dbErrorResponse(corsHeaders, "crm_create_deal_failed",
                    `criar a negociação na etapa "${targetStage}" para o contato ${conv!.contactId}`, cardError);
            }

            // Insert services
            if (serviceInserts.length > 0) {
                const rows = serviceInserts.map(s => ({ ...s, crm_client_id: newCard.id }));
                const { error: svcInsertError } = await supabase.from("crm_client_services").insert(rows);
                if (svcInsertError) {
                    return dbErrorResponse(corsHeaders, "crm_create_deal_services_failed",
                        `gravar os serviços da negociação ${newCard.id} (a negociação foi criada, mas ficou sem os serviços)`, svcInsertError);
                }
            }

            return new Response(
                JSON.stringify({ success: true, deal: { ...newCard, services: serviceInserts } }),
                { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ── ACTION: add_service ──
        // Adds a service to the active deal by name
        if (action === "add_service") {
            const card = await findActiveCardForChannel(supabase, conv!);

            if (!card) {
                return apiError(corsHeaders, {
                    status: 404,
                    code: "no_active_deal",
                    message: `Não existe negociação ativa para este contato na conexão desta conversa (conversation_id ${conv!.conversationId}), então não há onde adicionar o serviço. Use a ação create_deal primeiro.`,
                });
            }
            if (TERMINAL_STAGES.includes(card.stage)) {
                return apiError(corsHeaders, {
                    status: 409,
                    code: "deal_in_terminal_stage",
                    message: `A negociação já está na etapa final "${card.stage}" e não aceita mais alterações. Etapas finais: ${TERMINAL_STAGES.join(', ')}.`,
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

            // Find the service_client by name
            const { data: sc, error: scError } = await supabase
                .from("services_client")
                .select("id, name, price, min_price")
                .eq("user_id", user_id)
                .ilike("name", serviceName)
                .eq("status", true)
                .limit(1)
                .maybeSingle();

            if (scError) {
                return dbErrorResponse(corsHeaders, "service_lookup_failed",
                    `buscar o serviço "${serviceName}" no catálogo desta conta`, scError);
            }
            if (!sc) {
                return apiError(corsHeaders, {
                    status: 404,
                    code: "service_not_found",
                    message: `Serviço "${serviceName}" não encontrado no catálogo ativo desta conta. Confira o nome exato em Serviços — serviços desativados também não são aceitos.`,
                });
            }

            // Check if already in the deal
            const { data: existing, error: existingError } = await supabase
                .from("crm_client_services")
                .select("id")
                .eq("crm_client_id", card.id)
                .eq("service_client_id", sc.id)
                .maybeSingle();

            if (existingError) {
                return dbErrorResponse(corsHeaders, "crm_services_read_failed",
                    `verificar se o serviço "${sc.name}" já estava na negociação ${card.id}`, existingError);
            }

            if (existing) {
                return new Response(
                    JSON.stringify({ message: "Serviço já está na negociação", service: sc.name }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            const qty = body!.quantity || 1;
            const price = body!.unit_price || sc.price || 0;

            const { error: insertError } = await supabase.from("crm_client_services").insert({
                crm_client_id: card.id,
                service_client_id: sc.id,
                service_name: sc.name,
                quantity: qty,
                unit_price: price,
                min_price: sc.min_price || 0,
            });
            if (insertError) {
                return dbErrorResponse(corsHeaders, "crm_add_service_failed",
                    `adicionar o serviço "${sc.name}" à negociação ${card.id}`, insertError);
            }

            // Recalculate deal value
            const { data: allSvcs, error: allSvcsError } = await supabase
                .from("crm_client_services")
                .select("unit_price, quantity")
                .eq("crm_client_id", card.id);

            if (allSvcsError) {
                return dbErrorResponse(corsHeaders, "crm_services_read_failed",
                    `recalcular o valor da negociação ${card.id} (o serviço "${sc.name}" já foi adicionado)`, allSvcsError);
            }

            const newTotal = (allSvcs || []).reduce((s: number, r: any) => s + r.unit_price * r.quantity, 0);
            const { error: totalError } = await supabase.from("crm_client")
                .update({ value: newTotal, updated_at: new Date().toISOString() })
                .eq("id", card.id);
            if (totalError) {
                return dbErrorResponse(corsHeaders, "crm_update_value_failed",
                    `gravar o novo valor (R$ ${newTotal}) da negociação ${card.id} (o serviço "${sc.name}" já foi adicionado)`, totalError);
            }

            return new Response(
                JSON.stringify({ success: true, service: sc.name, quantity: qty, unit_price: price, deal_value: newTotal }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ── ACTION: close_ticket ──
        // Encerra APENAS esta conversa: move o card do funil desta conexão para a
        // etapa terminal escolhida e resolve o ticket. Conversas do mesmo contato
        // em outras conexões continuam intactas.
        if (action === "close_ticket") {
            const missingStage = missingFields(corsHeaders, body!, ["stage"],
                `Para encerrar, informe a etapa final. Etapas válidas: ${TERMINAL_STAGES.join(', ')}.`);
            if (missingStage) return missingStage;

            const matched = TERMINAL_STAGES.find(s => s.toLowerCase() === String(stage).toLowerCase());
            if (!matched) {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "invalid_terminal_stage",
                    message: `Etapa de encerramento inválida: "${stage}" não é uma etapa final. Etapas válidas para close_ticket: ${TERMINAL_STAGES.join(', ')}.`,
                });
            }

            // A RPC seta o GUC clinvia.resolve_conversation_id: o trigger
            // crm_terminal_resolve_tickets resolve só esta conversa.
            const { error: rpcError } = await supabase.rpc("crm_close_conversation_negotiation", {
                p_conversation_id: conv!.conversationId,
                p_stage: matched,
                p_loss_reason: (matched === 'Perdido' || matched === 'Sem Interesse') ? (loss_reason || 'other') : null,
                p_loss_reason_other: (matched === 'Perdido' || matched === 'Sem Interesse') ? (loss_reason_other || null) : null,
            });
            if (rpcError) {
                return dbErrorResponse(corsHeaders, "crm_close_ticket_failed",
                    `encerrar a negociação da conversa ${conv!.conversationId} na etapa "${matched}" (RPC crm_close_conversation_negotiation)`, rpcError);
            }

            // Garantia extra: sem card ativo a RPC não faz nada, o ticket precisa fechar mesmo assim
            const { error: convError } = await supabase
                .from("conversations")
                .update({ status: "resolved" })
                .eq("id", conv!.conversationId)
                .in("status", ["open", "pending"]);
            if (convError) {
                return dbErrorResponse(corsHeaders, "conversation_resolve_failed",
                    `marcar a conversa ${conv!.conversationId} como resolvida (a negociação já foi movida para "${matched}")`, convError);
            }

            const deal = await findActiveCardForChannel(supabase, conv!);

            return new Response(
                JSON.stringify({
                    success: true,
                    stage: matched,
                    conversation_id: conv!.conversationId,
                    conversation_resolved: true,
                    // após o encerramento não deve sobrar card ativo neste canal
                    remaining_active_deal: deal?.id ?? null,
                    message: `Negociação desta conexão movida para "${matched}" e ticket encerrado`,
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ── ACTION: list_stages ──
        // Returns all available stages
        if (action === "list_stages") {
            return new Response(
                JSON.stringify({ stages: CRM_STAGES, terminal: TERMINAL_STAGES }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return unknownAction(corsHeaders, action, VALID_ACTIONS);

    } catch (error) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de CRM (api-crm)", error);
    }
});
