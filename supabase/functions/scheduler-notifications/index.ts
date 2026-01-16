import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { addMinutes, subMinutes, parseISO, format, startOfDay, endOfDay } from "https://esm.sh/date-fns@2.30.0";
import { zonedTimeToUtc, utcToZonedTime } from "https://esm.sh/date-fns-tz@2.0.0?deps=date-fns@2.30.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

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

        const { action } = await req.json();
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Timezone configuration
        const timeZone = 'America/Sao_Paulo';

        if (action === "daily_summary") {
            // Logic:
            // 1. Get all users (or iterate through distinct user_ids in appointments?)
            // For simplicity, let's assume we run this for all users who have appointments today.
            // But we need to know WHICH user to notify.
            // Let's fetch all appointments for "today" in Brazil time.

            const now = new Date();
            const zonedNow = utcToZonedTime(now, timeZone);
            const start = startOfDay(zonedNow);
            const end = endOfDay(zonedNow);

            // Convert back to UTC for query
            const startUtc = zonedTimeToUtc(start, timeZone);
            const endUtc = zonedTimeToUtc(end, timeZone);

            const { data: appointments, error } = await supabase
                .from("appointments")
                .select("*, contacts(push_name), professionals(name)")
                .gte("start_time", startUtc.toISOString())
                .lte("start_time", endUtc.toISOString());

            if (error) throw error;

            // Group by user_id
            const appointmentsByUser = appointments.reduce((acc, apt) => {
                if (!acc[apt.user_id]) acc[apt.user_id] = [];
                acc[apt.user_id].push(apt);
                return acc;
            }, {});

            const notifications = [];

            for (const userId of Object.keys(appointmentsByUser)) {
                const userAppointments = appointmentsByUser[userId];
                const count = userAppointments.length;

                if (count > 0) {
                    notifications.push({
                        type: 'appointments_today',
                        title: 'Agenda de Hoje',
                        description: `Você tem ${count} agendamento(s) hoje.`,
                        metadata: { count, appointment_ids: userAppointments.map(a => a.id) },
                        related_user_id: userId,
                        user_id: userId  // SECURITY FIX: Tenant isolation
                    });
                }
            }

            if (notifications.length > 0) {
                const { error: insertError } = await supabase.from("notifications").insert(notifications);
                if (insertError) throw insertError;
            }

            return new Response(JSON.stringify({ success: true, notifications_created: notifications.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (action === "check_reminders") {
            // Logic:
            // Find appointments starting in 10-20 minutes from now.
            // Why a range? To ensure we catch them even if the cron runs slightly off, but avoid double notifying.
            // Better: Find appointments starting in [now + 10min, now + 15min].
            // And check if we already notified?
            // "appointment_reminder" type.

            const now = new Date();
            const startRange = addMinutes(now, 10);
            const endRange = addMinutes(now, 15); // 5 minute window

            const { data: appointments, error } = await supabase
                .from("appointments")
                .select("*, contacts(push_name), professionals(name)")
                .gte("start_time", startRange.toISOString())
                .lte("start_time", endRange.toISOString());

            if (error) throw error;

            const notifications = [];

            for (const apt of appointments) {
                // Check if notification already exists for this appointment
                const { data: existing } = await supabase
                    .from("notifications")
                    .select("id")
                    .eq("type", "appointment_reminder")
                    .eq("metadata->>appointment_id", apt.id)
                    .single();

                if (!existing) {
                    const contactName = apt.contacts?.push_name || "Cliente";
                    const professionalName = apt.professionals?.name || "Profissional";
                    const timeStr = format(utcToZonedTime(parseISO(apt.start_time), timeZone), "HH:mm");

                    notifications.push({
                        type: 'appointment_reminder',
                        title: 'Próximo Agendamento',
                        description: `Agendamento de ${contactName} com ${professionalName} começa em 10 minutos (${timeStr}).`,
                        metadata: { appointment_id: apt.id },
                        related_user_id: apt.user_id,
                        user_id: apt.user_id  // SECURITY FIX: Tenant isolation
                    });
                }
            }

            if (notifications.length > 0) {
                const { error: insertError } = await supabase.from("notifications").insert(notifications);
                if (insertError) throw insertError;
            }

            return new Response(JSON.stringify({ success: true, reminders_created: notifications.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Check financial entries due today
        if (action === "check_financial_due") {
            await supabase.rpc('check_financial_due_today');
            return new Response(
                JSON.stringify({ success: true, message: "Financial due check completed" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Check overdue financial entries
        if (action === "check_financial_overdue") {
            await supabase.rpc('check_financial_overdue');
            return new Response(
                JSON.stringify({ success: true, message: "Financial overdue check completed" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Auto-complete confirmed appointments when end_time is reached
        if (action === "auto_complete_appointments") {
            const now = new Date();

            // Get all users with auto_complete enabled
            const { data: usersWithAutoComplete, error: settingsError } = await supabase
                .from("scheduling_settings")
                .select("user_id")
                .eq("auto_complete", true);

            if (settingsError) throw settingsError;

            if (!usersWithAutoComplete || usersWithAutoComplete.length === 0) {
                return new Response(
                    JSON.stringify({ success: true, message: "No users with auto_complete enabled" }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            const userIds = usersWithAutoComplete.map(u => u.user_id);
            let appointmentsCompleted = 0;
            let salesCreated = 0;

            // Find confirmed appointments with end_time <= now for these users
            const { data: appointmentsToComplete, error: aptError } = await supabase
                .from("appointments")
                .select("*, products_services(id, name, type, price)")
                .in("user_id", userIds)
                .eq("status", "confirmed")
                .eq("type", "appointment")
                .lte("end_time", now.toISOString());

            if (aptError) throw aptError;

            for (const apt of appointmentsToComplete || []) {
                // Update appointment status to completed
                const { error: updateError } = await supabase
                    .from("appointments")
                    .update({ status: "completed" })
                    .eq("id", apt.id);

                if (updateError) {
                    console.error(`Error completing appointment ${apt.id}:`, updateError);
                    continue;
                }

                appointmentsCompleted++;

                // Skip sale creation if no price or no service
                if (!apt.price || apt.price <= 0 || !apt.service_id) continue;

                const service = apt.products_services;
                const appointmentDate = apt.start_time.split("T")[0];

                // Create sale entry (always as 'pending' payment type)
                const salePayload = {
                    user_id: apt.user_id,
                    category: service?.type || 'service',
                    product_service_id: apt.service_id,
                    quantity: 1,
                    unit_price: apt.price,
                    total_amount: apt.price,
                    payment_type: 'pending',
                    installments: 1,
                    interest_rate: 0,
                    sale_date: appointmentDate,
                    professional_id: apt.professional_id || null,
                    contact_id: apt.contact_id || null,
                    team_member_id: null,
                    notes: apt.description || `Venda de agendamento - ${service?.name || 'Serviço'}`,
                };

                const { error: saleError } = await supabase
                    .from("sales")
                    .insert(salePayload);

                if (saleError) {
                    console.error(`Error creating sale for appointment ${apt.id}:`, saleError);
                    continue;
                }

                salesCreated++;
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    appointments_completed: appointmentsCompleted,
                    sales_created: salesCreated
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
