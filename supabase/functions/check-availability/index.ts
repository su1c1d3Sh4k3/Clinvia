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

        // Break time (null = sem intervalo)
        let breakStartHour: number | null = null;
        let breakEndHour: number | null = null;

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
                    const wh = professional.work_hours;
                    // work_hours é JSONB com valores numéricos (horas decimais)
                    // ex: { start: 8, end: 18, break_start: 12, break_end: 13 }
                    if (wh.start != null) startHour = Number(wh.start);
                    if (wh.end   != null) endHour   = Number(wh.end);
                    if (wh.break_start != null) breakStartHour = Number(wh.break_start);
                    if (wh.break_end   != null) breakEndHour   = Number(wh.break_end);
                }
            }
        }

        // 3. Fetch Service Duration (if provided)
        if (service_id) {
            const { data: service, error: serviceError } = await supabase
                .from("products_services")
                .select("duration_minutes")
                .eq("id", service_id)
                .single();

            if (!serviceError && service) {
                serviceDuration = service.duration_minutes || 60;
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

        // 5. Fetch Existing Appointments + Clinic-wide GCal Absences
        const dayStart = `${date}T00:00:00`;
        const dayEnd   = `${date}T23:59:59`;

        const [aptResult, clinicResult] = await Promise.all([
            // Agendamentos do profissional
            (() => {
                let q = supabase
                    .from("appointments")
                    .select("start_time, end_time")
                    .gte("start_time", dayStart)
                    .lte("start_time", dayEnd);
                if (professional_id) q = q.eq("professional_id", professional_id);
                return q;
            })(),
            // Ausências clínica-wide do Google Calendar
            supabase
                .from("appointments")
                .select("start_time, end_time")
                .is("professional_id", null)
                .eq("type", "absence")
                .not("google_event_id", "is", null)
                .gte("start_time", dayStart)
                .lte("start_time", dayEnd),
        ]);

        if (aptResult.error) throw aptResult.error;

        const allBlocked = [
            ...(aptResult.data || []),
            ...(clinicResult.data || []),
        ];

        // 6. Calculate Slots
        const slots: string[] = [];
        let currentSlot = new Date(requestedDate);
        currentSlot.setHours(startHour, 0, 0, 0);

        const endTime = new Date(requestedDate);
        endTime.setHours(endHour, 0, 0, 0);

        // Pre-calcular início/fim do break em Date para comparação
        let breakStartDate: Date | null = null;
        let breakEndDate:   Date | null = null;
        if (breakStartHour !== null && breakEndHour !== null) {
            breakStartDate = new Date(requestedDate);
            breakStartDate.setHours(
                Math.floor(breakStartHour),
                Math.round((breakStartHour % 1) * 60),
                0, 0
            );
            breakEndDate = new Date(requestedDate);
            breakEndDate.setHours(
                Math.floor(breakEndHour),
                Math.round((breakEndHour % 1) * 60),
                0, 0
            );
        }

        // Generate all potential slots
        while (isBefore(currentSlot, endTime) || isEqual(currentSlot, endTime)) {
            // Check if this slot + duration fits before end of day
            const slotEnd = addMinutes(currentSlot, serviceDuration);
            if (isBefore(slotEnd, endTime) || isEqual(slotEnd, endTime)) {

                // Verificar conflito com break time do profissional
                const isBreakConflict = breakStartDate !== null && breakEndDate !== null
                    && isBefore(currentSlot, breakEndDate)
                    && isBefore(breakStartDate, slotEnd);

                // Check collision with existing appointments + clinic-wide absences
                const isBusy = isBreakConflict || allBlocked.some((apt) => {
                    const aptStart = parseISO(apt.start_time);
                    const aptEnd = parseISO(apt.end_time);
                    return isBefore(currentSlot, aptEnd) && isBefore(aptStart, slotEnd);
                });

                if (!isBusy) {
                    slots.push(format(currentSlot, "HH:mm"));
                }
            }

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
