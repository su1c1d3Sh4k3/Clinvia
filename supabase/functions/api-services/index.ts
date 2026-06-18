import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

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

        const body = await req.json();
        const { user_id, service_name, contact_id, phone_number } = body;

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

        // Helper: generate booking link for contact
        const generateBookingLink = async () => {
            if (!contact_id && !phone_number) return null;
            let cid = contact_id;
            let contactName = "";
            if (!cid && phone_number) {
                const cleaned = phone_number.replace(/\D/g, "");
                const { data } = await supabase.from("contacts").select("id, push_name")
                    .eq("user_id", user_id).ilike("number", `${cleaned}%`).limit(1).maybeSingle();
                if (data) { cid = data.id; contactName = data.push_name || ""; }
            } else if (cid) {
                const { data } = await supabase.from("contacts").select("push_name").eq("id", cid).single();
                contactName = data?.push_name || "";
            }
            if (!cid) return null;
            const token = btoa(JSON.stringify({ user_id, contact_id: cid, contact_name: contactName }));
            return `https://app.clinbia.ai/agendar?d=${token}`;
        };

        // If service_name provided: return applications for that service
        if (service_name) {
            // Find the service_name record (level 2) by name (case-insensitive)
            const { data: sn, error: snError } = await supabase
                .from("service_name")
                .select("id, name, category_id")
                .ilike("name", service_name)
                .limit(1)
                .maybeSingle();

            if (snError) throw snError;

            if (!sn) {
                return new Response(
                    JSON.stringify({ error: `Serviço "${service_name}" não encontrado`, applications: [] }),
                    { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // Get category name
            const { data: cat } = await supabase
                .from("services_category")
                .select("name")
                .eq("id", sn.category_id)
                .single();

            // Get all active applications for this service
            const { data: apps, error: appsError } = await supabase
                .from("services_client")
                .select("id, name, price, min_price, duration_minutes, description")
                .eq("user_id", user_id)
                .eq("service_name_id", sn.id)
                .eq("status", true)
                .order("name");

            if (appsError) throw appsError;

            const bookingLink = await generateBookingLink();

            return new Response(
                JSON.stringify({
                    service: sn.name,
                    category: cat?.name || null,
                    applications: (apps || []).map((a: any) => ({
                        id: a.id,
                        name: a.name,
                        price: a.price,
                        min_price: a.min_price,
                        duration_minutes: a.duration_minutes,
                        description: a.description,
                    })),
                    ...(bookingLink ? { booking_link: bookingLink } : {}),
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // No service_name: return all services (level 2 names only)
        const { data: allSc, error: scError } = await supabase
            .from("services_client")
            .select("service_name_id")
            .eq("user_id", user_id)
            .eq("status", true);

        if (scError) throw scError;

        const snIds = [...new Set((allSc || []).map((s: any) => s.service_name_id))];

        if (snIds.length === 0) {
            return new Response(
                JSON.stringify({ services: [] }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const { data: sns } = await supabase
            .from("service_name")
            .select("id, name, category_id")
            .in("id", snIds)
            .order("name");

        const catIds = [...new Set((sns || []).map((s: any) => s.category_id))];
        const { data: cats } = await supabase
            .from("services_category")
            .select("id, name")
            .in("id", catIds);

        const catMap = new Map((cats || []).map((c: any) => [c.id, c.name]));

        const bookingLink = await generateBookingLink();

        return new Response(
            JSON.stringify({
                services: (sns || []).map((s: any) => ({
                    id: s.id,
                    name: s.name,
                    category: catMap.get(s.category_id) || null,
                })),
                ...(bookingLink ? { booking_link: bookingLink } : {}),
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
