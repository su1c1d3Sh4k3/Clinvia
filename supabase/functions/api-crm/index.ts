import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const CRM_STAGES = [
    'Em Atendimento Humano', 'Em Atendimento IA', 'Qualificado', 'Agendado',
    'Suporte', 'Financeiro', 'Pós-Venda', 'Recorrencia', 'Follow Up',
    'Sem Contato', 'Sem Interesse', 'Ganho', 'Perdido', 'Finalizado',
];

const TERMINAL_STAGES = ['Ganho', 'Perdido', 'Finalizado'];

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const apiKey = req.headers.get("x-api-key");
        const envApiKey = Deno.env.get("SCHEDULING_API_KEY");

        if (!envApiKey || apiKey !== envApiKey) {
            return new Response(
                JSON.stringify({ error: "Unauthorized: Invalid or missing API Key" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const body = await req.json();
        const { action, user_id, contact_id, phone_number, stage, services, priority, notes, loss_reason, loss_reason_other } = body;

        if (!user_id) {
            return new Response(
                JSON.stringify({ error: "Missing required field: user_id" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Helper: resolve contact_id from phone_number if not provided
        const resolveContactId = async (): Promise<string> => {
            if (contact_id) return contact_id;
            if (!phone_number) throw new Error("Missing contact_id or phone_number");
            const cleaned = phone_number.replace(/\D/g, "");
            const { data, error } = await supabase
                .from("contacts")
                .select("id")
                .eq("user_id", user_id)
                .ilike("number", `${cleaned}%`)
                .limit(1)
                .single();
            if (error || !data) throw new Error(`Contact not found for phone: ${phone_number}`);
            return data.id;
        };

        // ── ACTION: get_deal ──
        // Returns the active CRM card + its services
        if (action === "get_deal") {
            const cid = await resolveContactId();

            const { data: card } = await supabase
                .from("crm_client")
                .select("id, stage, value, priority, is_active, notes, created_at")
                .eq("contact_id", cid)
                .eq("is_active", true)
                .maybeSingle();

            if (!card) {
                return new Response(
                    JSON.stringify({ deal: null, message: "Nenhuma negociação ativa para este contato" }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            const { data: svcs } = await supabase
                .from("crm_client_services")
                .select("id, service_name, quantity, unit_price")
                .eq("crm_client_id", card.id);

            return new Response(
                JSON.stringify({ deal: { ...card, services: svcs || [] } }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ── ACTION: move_stage ──
        // Moves the active card to a new stage (by name)
        if (action === "move_stage") {
            if (!stage) throw new Error("Missing field: stage");

            // Validate stage name (case-insensitive match)
            const matched = CRM_STAGES.find(s => s.toLowerCase() === stage.toLowerCase());
            if (!matched) {
                return new Response(
                    JSON.stringify({ error: `Etapa inválida: "${stage}". Etapas válidas: ${CRM_STAGES.join(', ')}` }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            const cid = await resolveContactId();

            const { data: card } = await supabase
                .from("crm_client")
                .select("id, stage")
                .eq("contact_id", cid)
                .eq("is_active", true)
                .maybeSingle();

            if (!card) throw new Error("Nenhuma negociação ativa para este contato");

            if (TERMINAL_STAGES.includes(card.stage)) {
                throw new Error(`Negociação está em "${card.stage}" (terminal) — não pode ser movida`);
            }

            const updateData: any = {
                stage: matched,
                stage_changed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };

            // Terminal stage → deactivate
            if (TERMINAL_STAGES.includes(matched)) {
                updateData.is_active = false;
                if (matched === 'Perdido') {
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

            if (error) throw error;

            return new Response(
                JSON.stringify({ success: true, deal: updated }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ── ACTION: create_deal ──
        // Creates a new deal for a contact with optional services
        if (action === "create_deal") {
            const cid = await resolveContactId();

            // Validate stage
            const targetStage = stage
                ? CRM_STAGES.find(s => s.toLowerCase() === stage.toLowerCase()) || 'Qualificado'
                : 'Qualificado';

            // Check if contact already has active deal
            const { data: existing } = await supabase
                .from("crm_client")
                .select("id, stage")
                .eq("contact_id", cid)
                .eq("is_active", true)
                .maybeSingle();

            if (existing) {
                return new Response(
                    JSON.stringify({ error: `Contato já possui negociação ativa na etapa "${existing.stage}"`, deal_id: existing.id }),
                    { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // Calculate total from services
            let totalValue = 0;
            const serviceInserts: any[] = [];

            if (services && Array.isArray(services) && services.length > 0) {
                for (const svc of services) {
                    // svc: { service_name, quantity?, unit_price? }
                    // Try to find services_client by name
                    const { data: sc } = await supabase
                        .from("services_client")
                        .select("id, name, price, min_price")
                        .eq("user_id", user_id)
                        .ilike("name", svc.service_name || svc.name)
                        .eq("status", true)
                        .limit(1)
                        .maybeSingle();

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
                    contact_id: cid,
                    stage: targetStage,
                    stage_changed_at: new Date().toISOString(),
                    value: totalValue,
                    priority: priority || 'medium',
                    notes: notes || null,
                    is_active: !TERMINAL_STAGES.includes(targetStage),
                })
                .select()
                .single();

            if (cardError) throw cardError;

            // Insert services
            if (serviceInserts.length > 0) {
                const rows = serviceInserts.map(s => ({ ...s, crm_client_id: newCard.id }));
                await supabase.from("crm_client_services").insert(rows);
            }

            return new Response(
                JSON.stringify({ success: true, deal: { ...newCard, services: serviceInserts } }),
                { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ── ACTION: add_service ──
        // Adds a service to the active deal by name
        if (action === "add_service") {
            const cid = await resolveContactId();

            const { data: card } = await supabase
                .from("crm_client")
                .select("id, stage")
                .eq("contact_id", cid)
                .eq("is_active", true)
                .maybeSingle();

            if (!card) throw new Error("Nenhuma negociação ativa para este contato");
            if (TERMINAL_STAGES.includes(card.stage)) throw new Error(`Negociação em "${card.stage}" — não pode ser editada`);

            const serviceName = body.service_name || body.name;
            if (!serviceName) throw new Error("Missing field: service_name");

            // Find the service_client by name
            const { data: sc } = await supabase
                .from("services_client")
                .select("id, name, price, min_price")
                .eq("user_id", user_id)
                .ilike("name", serviceName)
                .eq("status", true)
                .limit(1)
                .maybeSingle();

            if (!sc) throw new Error(`Serviço "${serviceName}" não encontrado`);

            // Check if already in the deal
            const { data: existing } = await supabase
                .from("crm_client_services")
                .select("id")
                .eq("crm_client_id", card.id)
                .eq("service_client_id", sc.id)
                .maybeSingle();

            if (existing) {
                return new Response(
                    JSON.stringify({ message: "Serviço já está na negociação", service: sc.name }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            const qty = body.quantity || 1;
            const price = body.unit_price || sc.price || 0;

            await supabase.from("crm_client_services").insert({
                crm_client_id: card.id,
                service_client_id: sc.id,
                service_name: sc.name,
                quantity: qty,
                unit_price: price,
                min_price: sc.min_price || 0,
            });

            // Recalculate deal value
            const { data: allSvcs } = await supabase
                .from("crm_client_services")
                .select("unit_price, quantity")
                .eq("crm_client_id", card.id);

            const newTotal = (allSvcs || []).reduce((s: number, r: any) => s + r.unit_price * r.quantity, 0);
            await supabase.from("crm_client").update({ value: newTotal, updated_at: new Date().toISOString() }).eq("id", card.id);

            return new Response(
                JSON.stringify({ success: true, service: sc.name, quantity: qty, unit_price: price, deal_value: newTotal }),
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

        throw new Error(`Invalid action: "${action}". Valid: get_deal, move_stage, create_deal, list_stages`);

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
