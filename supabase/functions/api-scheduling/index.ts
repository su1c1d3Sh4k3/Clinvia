import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { addMinutes, subMinutes, parse, format, isBefore, isEqual, parseISO } from "https://esm.sh/date-fns@2.30.0";

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

        const reqJson = await req.json();
        const { action, user_id, date, service_name, appointment_data, duration, contact_id, appointment_id, new_date, new_time } = reqJson;

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

        // Helper to calculate slots for a professional
        const calculateSlots = async (professional, dateStr, serviceDuration = 60) => {
            // 1. Get Global Settings
            const { data: globalSettings } = await supabase
                .from("scheduling_settings")
                .select("*")
                .eq("user_id", user_id)
                .single();

            let startHour = globalSettings?.start_hour ?? 8;
            let endHour = globalSettings?.end_hour ?? 19;
            let workDays = globalSettings?.work_days ?? [0, 1, 2, 3, 4, 5, 6];

            // 2. Override with Professional Settings
            if (professional.work_days && professional.work_days.length > 0) {
                workDays = professional.work_days;
            }
            if (professional.work_hours) {
                const startParts = professional.work_hours.start.split(':');
                const endParts = professional.work_hours.end.split(':');
                startHour = parseInt(startParts[0]);
                endHour = parseInt(endParts[0]);
            }

            // 3. Check Day
            const requestedDate = parse(dateStr, "yyyy-MM-dd", new Date());
            const dayOfWeek = requestedDate.getDay();
            if (!workDays.includes(dayOfWeek)) {
                return [
                    { time_available_true: [] },
                    { time_available_false: [] } // Whole day unavailable
                ];
            }

            // 4. Fetch Appointments
            // Fetching broad range to ensure we catch everything
            const { data: appointments } = await supabase
                .from("appointments")
                .select("start_time, end_time")
                .eq("user_id", user_id)
                .eq("professional_id", professional.id)
                .gte("start_time", `${dateStr}T00:00:00`) // This is UTC comparison, effectively 21:00 prev day Brazil
                .lte("start_time", `${dateStr}T23:59:59`); // This is UTC comparison

            // 5. Generate Slots
            const time_available_true = [];
            const time_available_false = [];

            let currentSlot = new Date(requestedDate);
            currentSlot.setHours(startHour, 0, 0, 0);
            const endTime = new Date(requestedDate);
            endTime.setHours(endHour, 0, 0, 0);

            while (isBefore(currentSlot, endTime) || isEqual(currentSlot, endTime)) {
                const slotEnd = addMinutes(currentSlot, serviceDuration);

                // Check if slot exceeds working hours
                if (isBefore(slotEnd, endTime) || isEqual(slotEnd, endTime)) {
                    const isBusy = appointments?.some((apt) => {
                        // Manual Timezone Adjustment: Subtract 3 hours from DB time to get Brazil Time
                        // DB (UTC) -> Brazil (Local for loop)
                        const aptStartUTC = parseISO(apt.start_time);
                        const aptEndUTC = parseISO(apt.end_time);

                        const aptStart = subMinutes(aptStartUTC, 180); // -3 hours
                        const aptEnd = subMinutes(aptEndUTC, 180);     // -3 hours

                        // Overlap check
                        return isBefore(currentSlot, aptEnd) && isBefore(aptStart, slotEnd);
                    });

                    const timeStr = format(currentSlot, "HH:mm");
                    if (!isBusy) {
                        time_available_true.push(timeStr);
                    } else {
                        time_available_false.push(timeStr);
                    }
                } else {
                    // Slot exceeds end time, technically unavailable but usually just not listed.
                    // User asked for unavailable slots, so we can list it or just ignore.
                    // Usually "unavailable" implies "within work hours but taken".
                    // Let's ignore slots outside work hours to keep list clean.
                }
                currentSlot = addMinutes(currentSlot, 30); // 30 min step
            }

            return [
                { time_available_true },
                { time_available_false }
            ];
        };


        if (action === "check_availability") {
            if (!date) throw new Error("Missing date");
            // duration is already destructured from req.json()
            const serviceDuration = duration || 60; // Default 60 min if not provided

            // Get all professionals
            const { data: professionals } = await supabase
                .from("professionals")
                .select("*")
                .eq("user_id", user_id);

            const result = {};
            for (const pro of professionals || []) {
                const slots = await calculateSlots(pro, date, duration);
                result[pro.name] = slots;
            }
            return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (action === "check_availability_by_service") {
            if (!date || !service_name) throw new Error("Missing date or service_name");

            // Find service
            const { data: services } = await supabase
                .from("products_services")
                .select("*")
                .eq("user_id", user_id)
                .ilike("name", `%${service_name}%`)
                .limit(1);

            if (!services || services.length === 0) return new Response(JSON.stringify({}), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

            const service = services[0];

            // Find professionals
            const { data: professionals } = await supabase
                .from("professionals")
                .select("*")
                .eq("user_id", user_id)
                .contains("service_ids", [service.id]);

            const result = {};
            for (const pro of professionals || []) {
                const slots = await calculateSlots(pro, date, service.duration || 60);
                result[pro.name] = slots;
            }
            return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (action === "create_appointment") {
            if (!appointment_data) throw new Error("Missing appointment_data");

            // appointment_data should have: professional_id, contact_id, service_id, date, start_time, duration, price
            // We need to construct the payload
            const { professional_id, contact_id, service_id, date, start_time, duration, price, description } = appointment_data;

            // Manual timezone adjustment for Brazil (UTC-3)
            // Input: "2025-12-08 10:00" -> Parsed as 10:00 UTC
            // Target: 13:00 UTC (which is 10:00 Brazil)
            // Action: Add 3 hours (180 minutes)

            const startDateTime = `${date}T${start_time}`;
            const parsedDate = parseISO(startDateTime);
            const startDate = addMinutes(parsedDate, 180); // Add 3 hours
            const endDate = addMinutes(startDate, duration);

            // Validate that appointment is not in the past
            const now = new Date();
            if (startDate < now) {
                return new Response(
                    JSON.stringify({ error: "A data informada é anterior a data atual, verifique se a data ou o ano estão corretos e tente novamente." }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }


            const payload = {
                user_id,
                professional_id,
                contact_id,
                service_id,
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                price,
                description,
                type: 'appointment'
            };

            const { data, error } = await supabase
                .from("appointments")
                .insert(payload)
                .select()
                .single();

            if (error) throw error;

            // Create Notification
            try {
                // Fetch names for better notification
                const { data: contact } = await supabase.from("contacts").select("push_name").eq("id", contact_id).single();
                const { data: professional } = await supabase.from("professionals").select("name").eq("id", professional_id).single();

                const contactName = contact?.push_name || "Cliente";
                const professionalName = professional?.name || "Profissional";
                const formattedDate = format(startDate, "dd/MM 'às' HH:mm");

                await supabase.from("notifications").insert({
                    type: 'appointment_created',
                    title: 'Novo Agendamento',
                    description: `Agendamento para ${contactName} com ${professionalName} em ${formattedDate}.`,
                    metadata: { appointment_id: data.id, professional_id, contact_id },
                    related_user_id: user_id // Notify the account owner
                });
            } catch (notifError) {
                console.error("Error creating notification:", notifError);
                // Don't fail the request if notification fails
            }

            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (action === "fetch_appointments") {
            if (!contact_id) throw new Error("Missing contact_id");

            const { data, error } = await supabase
                .from("appointments")
                .select(`
                    *,
                    professionals (name),
                    products_services (name)
                `)
                .eq("user_id", user_id)
                .eq("contact_id", contact_id)
                .order("start_time", { ascending: false });

            if (error) throw error;

            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (action === "reschedule_appointment") {
            if (!appointment_id || !new_date || !new_time) throw new Error("Missing appointment_id, new_date, or new_time");

            // 1. Fetch existing appointment to get duration
            const { data: existingApt, error: fetchError } = await supabase
                .from("appointments")
                .select("start_time, end_time")
                .eq("id", appointment_id)
                .single();

            if (fetchError || !existingApt) throw new Error("Appointment not found");

            const oldStart = parseISO(existingApt.start_time);
            const oldEnd = parseISO(existingApt.end_time);
            const durationInMinutes = (oldEnd.getTime() - oldStart.getTime()) / (1000 * 60);

            // 2. Calculate new times
            // Manual timezone adjustment for Brazil (UTC-3)
            const startDateTime = `${new_date}T${new_time}`;
            const parsedDate = parseISO(startDateTime);
            const startDate = addMinutes(parsedDate, 180); // Add 3 hours
            const endDate = addMinutes(startDate, durationInMinutes);

            // 3. Update
            const { data, error } = await supabase
                .from("appointments")
                .update({
                    start_time: startDate.toISOString(),
                    end_time: endDate.toISOString(),
                    status: 'rescheduled'
                })
                .eq("id", appointment_id)
                .select()
                .single();

            if (error) throw error;

            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (action === "cancel_appointment") {
            if (!appointment_id) throw new Error("Missing appointment_id");

            const { data, error } = await supabase
                .from("appointments")
                .update({ status: 'canceled' })
                .eq("id", appointment_id)
                .select()
                .single();

            if (error) throw error;

            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        throw new Error("Invalid action");

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
