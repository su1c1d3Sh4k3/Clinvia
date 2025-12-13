import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { addMinutes, parse, format, isBefore, isEqual, parseISO } from "https://esm.sh/date-fns@2.30.0";

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

        const { date, professional_id, service_id } = await req.json();

        if (!date) {
            return new Response(
                JSON.stringify({ error: "Missing required field: date (YYYY-MM-DD)" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // 1. Fetch Global Settings
        const { data: globalSettings, error: settingsError } = await supabase
            .from("scheduling_settings")
            .select("*")
            .single();

        if (settingsError && settingsError.code !== "PGRST116") {
            throw settingsError;
        }

        // Defaults
        let startHour = globalSettings?.start_hour ?? 8;
        let endHour = globalSettings?.end_hour ?? 19;
        let workDays = globalSettings?.work_days ?? [0, 1, 2, 3, 4, 5, 6];
        let serviceDuration = 60; // Default 60 min

        // 2. Fetch Professional Specifics (if provided)
        if (professional_id) {
            const { data: professional, error: proError } = await supabase
                .from("professionals")
                .select("*")
                .eq("id", professional_id)
                .single();

            if (proError) throw proError;

            if (professional) {
                if (professional.work_days && professional.work_days.length > 0) {
                    workDays = professional.work_days;
                }
                if (professional.work_hours) {
                    // Parse "HH:mm" to hours integer for simplicity, or keep as string logic
                    // The current calendar uses integer hours. Let's try to respect that for consistency,
                    // or parse the specific "HH:mm" strings if we want more precision.
                    // For this V1, let's stick to the integer start/end based on the string.
                    const startParts = professional.work_hours.start.split(':');
                    const endParts = professional.work_hours.end.split(':');
                    startHour = parseInt(startParts[0]);
                    endHour = parseInt(endParts[0]);
                }
            }
        }

        // 3. Fetch Service Duration (if provided)
        if (service_id) {
            const { data: service, error: serviceError } = await supabase
                .from("products_services")
                .select("duration")
                .eq("id", service_id)
                .single();

            if (!serviceError && service) {
                serviceDuration = service.duration || 60;
            }
        }

        // 4. Check if Day is Blocked
        const requestedDate = parse(date, "yyyy-MM-dd", new Date());
        const dayOfWeek = requestedDate.getDay();

        if (!workDays.includes(dayOfWeek)) {
            return new Response(
                JSON.stringify({ available_slots: [], message: "Day is not a work day" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // 5. Fetch Existing Appointments
        let query = supabase
            .from("appointments")
            .select("start_time, end_time")
            .gte("start_time", `${date}T00:00:00`)
            .lte("start_time", `${date}T23:59:59`);

        if (professional_id) {
            query = query.eq("professional_id", professional_id);
        }

        const { data: appointments, error: aptError } = await query;
        if (aptError) throw aptError;

        // 6. Calculate Slots
        const slots: string[] = [];
        let currentSlot = new Date(requestedDate);
        currentSlot.setHours(startHour, 0, 0, 0);

        const endTime = new Date(requestedDate);
        endTime.setHours(endHour, 0, 0, 0);

        // Generate all potential slots
        while (isBefore(currentSlot, endTime) || isEqual(currentSlot, endTime)) {
            // Check if this slot + duration fits before end of day
            const slotEnd = addMinutes(currentSlot, serviceDuration);
            if (isBefore(slotEnd, endTime) || isEqual(slotEnd, endTime)) {

                // Check collision with existing appointments
                const isBusy = appointments.some((apt) => {
                    const aptStart = parseISO(apt.start_time);
                    const aptEnd = parseISO(apt.end_time);

                    // Check overlap
                    // (SlotStart < AptEnd) && (SlotEnd > AptStart)
                    return isBefore(currentSlot, aptEnd) && isBefore(aptStart, slotEnd);
                });

                if (!isBusy) {
                    slots.push(format(currentSlot, "HH:mm"));
                }
            }

            // Increment by... service duration? or fixed interval (e.g. 30 min)?
            // Usually scheduling allows starting every 30 mins or 15 mins.
            // Let's assume 30 minute intervals for flexibility, or equal to duration?
            // Let's use 30 minutes step for now.
            currentSlot = addMinutes(currentSlot, 30);
        }

        return new Response(
            JSON.stringify({
                available_slots: slots,
                date: date,
                professional_id: professional_id,
                service_duration: serviceDuration
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
