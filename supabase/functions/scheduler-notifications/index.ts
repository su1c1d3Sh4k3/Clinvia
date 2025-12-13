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
                        related_user_id: userId
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
                        related_user_id: apt.user_id
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
            let revenuesCreated = 0;

            // Find confirmed appointments with end_time <= now for these users
            const { data: appointmentsToComplete, error: aptError } = await supabase
                .from("appointments")
                .select("*, products_services(name, price), professionals(id, name, commission)")
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

                // Skip revenue creation if no price
                if (!apt.price || apt.price <= 0) continue;

                // Get or create "Agendamento" revenue category for this user
                let agendamentoCategoryId = null;
                const { data: existingCategory } = await supabase
                    .from("revenue_categories")
                    .select("id")
                    .eq("user_id", apt.user_id)
                    .eq("name", "Agendamento")
                    .single();

                if (existingCategory) {
                    agendamentoCategoryId = existingCategory.id;
                } else {
                    const { data: newCategory } = await supabase
                        .from("revenue_categories")
                        .insert({ user_id: apt.user_id, name: "Agendamento", description: "Receitas de agendamentos" })
                        .select("id")
                        .single();
                    agendamentoCategoryId = newCategory?.id;
                }

                const serviceName = apt.products_services?.name || "Serviço";
                const appointmentDate = apt.start_time.split("T")[0];

                // Create revenue
                const revenuePayload = {
                    user_id: apt.user_id,
                    category_id: agendamentoCategoryId,
                    product_service_id: apt.service_id || null,
                    item: serviceName,
                    description: apt.description || "Receita de agendamento",
                    amount: apt.price,
                    payment_method: "other",
                    due_date: appointmentDate,
                    paid_date: appointmentDate,
                    status: "paid",
                    professional_id: apt.professional_id || null,
                    contact_id: apt.contact_id || null,
                    is_recurring: false,
                };

                const { data: revenueResult, error: revenueError } = await supabase
                    .from("revenues")
                    .insert(revenuePayload)
                    .select("id")
                    .single();

                if (revenueError) {
                    console.error(`Error creating revenue for appointment ${apt.id}:`, revenueError);
                    continue;
                }

                revenuesCreated++;

                // Create commission expense if professional has commission > 0
                const professional = apt.professionals;
                if (professional && professional.commission > 0 && revenueResult) {
                    const commissionAmount = (apt.price * professional.commission) / 100;

                    // Get or create "Comissão" expense category for this user
                    let commissionCategoryId = null;
                    const { data: existingCommissionCat } = await supabase
                        .from("expense_categories")
                        .select("id")
                        .eq("user_id", apt.user_id)
                        .eq("name", "Comissão")
                        .single();

                    if (existingCommissionCat) {
                        commissionCategoryId = existingCommissionCat.id;
                    } else {
                        const { data: newCommissionCat } = await supabase
                            .from("expense_categories")
                            .insert({ user_id: apt.user_id, name: "Comissão", description: "Comissões de profissionais" })
                            .select("id")
                            .single();
                        commissionCategoryId = newCommissionCat?.id;
                    }

                    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                    const lastDayStr = lastDayOfMonth.toISOString().split("T")[0];

                    const commissionPayload = {
                        user_id: apt.user_id,
                        category_id: commissionCategoryId,
                        item: `Comissão ${professional.name}`,
                        description: "Comissionamento de profissional",
                        amount: commissionAmount,
                        payment_method: "other",
                        due_date: lastDayStr,
                        status: "pending",
                        is_recurring: false,
                        commission_revenue_id: revenueResult.id,
                    };

                    await supabase.from("expenses").insert(commissionPayload);
                }
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    appointments_completed: appointmentsCompleted,
                    revenues_created: revenuesCreated
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
