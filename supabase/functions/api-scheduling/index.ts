import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

function pad(n: number): string { return String(n).padStart(2, "0"); }

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const apiKey = req.headers.get("x-api-key");
        const envApiKey = Deno.env.get("SCHEDULING_API_KEY");
        if (!envApiKey || apiKey !== envApiKey) {
            return new Response(JSON.stringify({ error: "Unauthorized" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const body = await req.json();
        const { action, user_id } = body;

        if (!user_id) {
            return new Response(JSON.stringify({ error: "Missing user_id" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Helper: resolve contact by phone
        const resolveContact = async (contactId?: string, phoneNumber?: string) => {
            if (contactId) return contactId;
            if (!phoneNumber) throw new Error("Missing contact_id or phone_number");
            const cleaned = phoneNumber.replace(/\D/g, "");
            const { data } = await supabase.from("contacts").select("id")
                .eq("user_id", user_id).ilike("number", `${cleaned}%`).limit(1).single();
            if (!data) throw new Error(`Contato não encontrado: ${phoneNumber}`);
            return data.id;
        };

        // Helper: resolve service_client by application name
        const resolveService = async (serviceName: string) => {
            const { data } = await supabase.from("services_client")
                .select("id, name, price, min_price, duration_minutes, category_id, service_name_id, professionals")
                .eq("user_id", user_id).ilike("name", serviceName).eq("status", true)
                .limit(1).maybeSingle();
            if (!data) throw new Error(`Aplicação "${serviceName}" não encontrada`);
            return data;
        };

        // Helper: find a professional for the service
        const resolveProfessional = async (sc: any, preferredName?: string) => {
            const profIds: string[] = sc.professionals || [];
            if (profIds.length === 0) throw new Error(`Nenhum profissional atrelado ao serviço "${sc.name}"`);

            if (preferredName) {
                const { data } = await supabase.from("professionals").select("id, name")
                    .in("id", profIds).ilike("name", `%${preferredName}%`).limit(1).maybeSingle();
                if (data) return data;
            }
            // Default: first professional
            const { data } = await supabase.from("professionals").select("id, name")
                .in("id", profIds).limit(1).single();
            return data;
        };

        // ══════════════════════════════════════════════
        // ACTION: fetch_appointments
        // ══════════════════════════════════════════════
        if (action === "fetch_appointments") {
            const contactId = await resolveContact(body.contact_id, body.phone_number);

            const { data, error } = await supabase.from("appointments")
                .select("id, service_name, professional_name, start_time, end_time, status, price, type, category_id, service_name_id, service_id")
                .eq("user_id", user_id).eq("contact_id", contactId)
                .order("start_time", { ascending: false });

            if (error) throw error;

            return new Response(JSON.stringify({
                contact_id: contactId,
                appointments: (data || []).map((a: any) => ({
                    id: a.id,
                    service: a.service_name,
                    professional: a.professional_name,
                    date: a.start_time?.split("T")[0],
                    start_time: a.start_time,
                    end_time: a.end_time,
                    status: a.status,
                    price: a.price,
                })),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ══════════════════════════════════════════════
        // ACTION: create_appointment
        // ══════════════════════════════════════════════
        if (action === "create_appointment") {
            const { service_name, date, time, professional_name, phone_number, contact_id, description } = body;
            if (!service_name || !date || !time) throw new Error("Missing service_name, date or time");

            const cid = await resolveContact(contact_id, phone_number);
            const sc = await resolveService(service_name);
            const prof = await resolveProfessional(sc, professional_name);
            const duration = sc.duration_minutes || 30;

            // Build datetime (input is local BRT → store as UTC+3)
            const startISO = `${date}T${time}:00-03:00`;
            const startDate = new Date(startISO);
            const endDate = new Date(startDate.getTime() + duration * 60000);

            // Validate not in the past
            if (startDate < new Date()) {
                return new Response(JSON.stringify({ error: "Não é possível agendar no passado" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // Check overlap
            const { data: overlap } = await supabase.rpc("check_appointment_overlap", {
                p_professional_id: prof.id,
                p_start_time: startDate.toISOString(),
                p_end_time: endDate.toISOString(),
                p_exclude_id: null,
            });
            if (overlap) {
                return new Response(JSON.stringify({ error: "Horário indisponível (conflito com outro agendamento)" }),
                    { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            const payload = {
                user_id,
                professional_id: prof.id,
                contact_id: cid,
                service_id: sc.id,
                category_id: sc.category_id,
                service_name_id: sc.service_name_id,
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                price: sc.price || 0,
                description: description || null,
                type: "appointment",
            };

            const { data: created, error } = await supabase.from("appointments").insert(payload).select().single();
            if (error) throw error;

            // Google Calendar sync (fire-and-forget)
            try {
                const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
                const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
                fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "sync_appointment", appointment_id: created.id, user_id }),
                }).catch(() => {});
            } catch (_) {}

            // CRM sync: move/create card to Agendado + add service
            try {
                const { data: activeCard } = await supabase.from("crm_client")
                    .select("id, stage").eq("contact_id", cid).eq("is_active", true).maybeSingle();

                if (activeCard) {
                    const terminals = ['Ganho', 'Perdido', 'Finalizado'];
                    if (terminals.includes(activeCard.stage)) {
                        // Terminal → create new card
                        const { data: newCard } = await supabase.from("crm_client").insert({
                            user_id, contact_id: cid, stage: "Agendado",
                            stage_changed_at: new Date().toISOString(), value: 0,
                            professional_id: prof.id, priority: "medium", is_active: true,
                        }).select().single();
                        if (newCard) {
                            await supabase.from("crm_client_services").insert({
                                crm_client_id: newCard.id, service_client_id: sc.id,
                                service_name: sc.name, quantity: 1, unit_price: sc.price || 0, min_price: sc.min_price || 0,
                            });
                            await supabase.from("crm_client").update({ value: sc.price || 0 }).eq("id", newCard.id);
                        }
                    } else {
                        // Move to Agendado
                        if (activeCard.stage !== "Agendado") {
                            await supabase.from("crm_client").update({
                                stage: "Agendado", stage_changed_at: new Date().toISOString(),
                            }).eq("id", activeCard.id);
                        }
                        // Add service if not duplicate
                        const { data: existingSvc } = await supabase.from("crm_client_services")
                            .select("id").eq("crm_client_id", activeCard.id).eq("service_client_id", sc.id).maybeSingle();
                        if (!existingSvc) {
                            await supabase.from("crm_client_services").insert({
                                crm_client_id: activeCard.id, service_client_id: sc.id,
                                service_name: sc.name, quantity: 1, unit_price: sc.price || 0, min_price: sc.min_price || 0,
                            });
                            // Recalc value
                            const { data: allSvcs } = await supabase.from("crm_client_services")
                                .select("unit_price, quantity").eq("crm_client_id", activeCard.id);
                            const total = (allSvcs || []).reduce((s: number, r: any) => s + r.unit_price * r.quantity, 0);
                            await supabase.from("crm_client").update({ value: total }).eq("id", activeCard.id);
                        }
                    }
                } else {
                    // No card → create
                    const { data: newCard } = await supabase.from("crm_client").insert({
                        user_id, contact_id: cid, stage: "Agendado",
                        stage_changed_at: new Date().toISOString(), value: sc.price || 0,
                        professional_id: prof.id, priority: "medium", is_active: true,
                    }).select().single();
                    if (newCard) {
                        await supabase.from("crm_client_services").insert({
                            crm_client_id: newCard.id, service_client_id: sc.id,
                            service_name: sc.name, quantity: 1, unit_price: sc.price || 0, min_price: sc.min_price || 0,
                        });
                    }
                }
            } catch (crmErr) {
                console.warn("[api-scheduling] CRM sync error:", crmErr);
            }

            return new Response(JSON.stringify({
                success: true,
                appointment: {
                    id: created.id,
                    service: created.service_name,
                    professional: prof.name,
                    date,
                    start_time: created.start_time,
                    end_time: created.end_time,
                    price: created.price,
                    status: created.status,
                },
            }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ══════════════════════════════════════════════
        // ACTION: reschedule_appointment
        // ══════════════════════════════════════════════
        if (action === "reschedule_appointment") {
            const { appointment_id, new_date, new_time } = body;
            if (!appointment_id || !new_date || !new_time) throw new Error("Missing appointment_id, new_date or new_time");

            // Fetch existing to get duration
            const { data: existing } = await supabase.from("appointments")
                .select("start_time, end_time, professional_id")
                .eq("id", appointment_id).single();
            if (!existing) throw new Error("Agendamento não encontrado");

            const durationMs = new Date(existing.end_time).getTime() - new Date(existing.start_time).getTime();
            const durationMin = durationMs / 60000;

            const startISO = `${new_date}T${new_time}:00-03:00`;
            const startDate = new Date(startISO);
            const endDate = new Date(startDate.getTime() + durationMin * 60000);

            if (startDate < new Date()) {
                return new Response(JSON.stringify({ error: "Não é possível reagendar para o passado" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // Check overlap
            const { data: overlap } = await supabase.rpc("check_appointment_overlap", {
                p_professional_id: existing.professional_id,
                p_start_time: startDate.toISOString(),
                p_end_time: endDate.toISOString(),
                p_exclude_id: appointment_id,
            });
            if (overlap) {
                return new Response(JSON.stringify({ error: "Novo horário indisponível (conflito)" }),
                    { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            const { data: updated, error } = await supabase.from("appointments").update({
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                status: "rescheduled",
            }).eq("id", appointment_id).select().single();
            if (error) throw error;

            // Google Calendar sync
            try {
                const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
                const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
                fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "sync_appointment", appointment_id, user_id }),
                }).catch(() => {});
            } catch (_) {}

            // CRM: move card to Agendado
            if (updated.contact_id) {
                try {
                    const { data: activeCard } = await supabase.from("crm_client")
                        .select("id, stage").eq("contact_id", updated.contact_id).eq("is_active", true).maybeSingle();
                    if (activeCard && activeCard.stage !== "Agendado") {
                        await supabase.from("crm_client").update({
                            stage: "Agendado", stage_changed_at: new Date().toISOString(),
                        }).eq("id", activeCard.id);
                    }
                } catch (crmErr) {
                    console.warn("[api-scheduling] CRM reschedule sync error:", crmErr);
                }
            }

            return new Response(JSON.stringify({
                success: true,
                appointment: {
                    id: updated.id,
                    service: updated.service_name,
                    professional: updated.professional_name,
                    date: new_date,
                    start_time: updated.start_time,
                    end_time: updated.end_time,
                    status: updated.status,
                },
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ══════════════════════════════════════════════
        // ACTION: cancel_appointment
        // ══════════════════════════════════════════════
        if (action === "cancel_appointment") {
            const { appointment_id } = body;
            if (!appointment_id) throw new Error("Missing appointment_id");

            const { data: updated, error } = await supabase.from("appointments")
                .update({ status: "canceled" }).eq("id", appointment_id).select().single();
            if (error) throw error;

            // Google Calendar: delete event
            try {
                const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
                const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
                fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${serviceKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "delete_appointment", appointment_id, user_id }),
                }).catch(() => {});
            } catch (_) {}

            // CRM: create Perdido card for the canceled service
            if (updated.contact_id && updated.service_id) {
                try {
                    await supabase.from("crm_client").insert({
                        user_id, contact_id: updated.contact_id, stage: "Perdido",
                        stage_changed_at: new Date().toISOString(), value: updated.price || 0,
                        loss_reason: "canceled", loss_reason_other: "Cliente cancelou o agendamento",
                        is_active: false,
                    });
                    // Remove service from active deal
                    const { data: activeCard } = await supabase.from("crm_client")
                        .select("id").eq("contact_id", updated.contact_id).eq("is_active", true).maybeSingle();
                    if (activeCard) {
                        await supabase.from("crm_client_services").delete()
                            .eq("crm_client_id", activeCard.id).eq("service_client_id", updated.service_id);
                        const { data: remaining } = await supabase.from("crm_client_services")
                            .select("unit_price, quantity").eq("crm_client_id", activeCard.id);
                        if (remaining && remaining.length > 0) {
                            const total = remaining.reduce((s: number, r: any) => s + r.unit_price * r.quantity, 0);
                            await supabase.from("crm_client").update({ value: total }).eq("id", activeCard.id);
                        } else {
                            await supabase.from("crm_client").update({ is_active: false }).eq("id", activeCard.id);
                        }
                    }
                } catch (crmErr) {
                    console.warn("[api-scheduling] CRM cancel sync error:", crmErr);
                }
            }

            return new Response(JSON.stringify({
                success: true,
                appointment: { id: updated.id, status: "canceled" },
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        throw new Error(`Invalid action: "${action}". Valid: fetch_appointments, create_appointment, reschedule_appointment, cancel_appointment`);

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});
