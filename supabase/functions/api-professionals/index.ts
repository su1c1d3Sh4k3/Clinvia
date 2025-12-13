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

        const { action, user_id, service_name, name } = await req.json();

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

        let data, error;

        switch (action) {
            case "list_all":
                ({ data, error } = await supabase
                    .from("professionals")
                    .select("*")
                    .eq("user_id", user_id));
                break;

            case "by_service":
                if (!service_name) throw new Error("Missing service_name");
                // First find service IDs matching the name
                const { data: services, error: sError } = await supabase
                    .from("products_services")
                    .select("id")
                    .eq("user_id", user_id)
                    .ilike("name", `%${service_name}%`);

                if (sError) throw sError;

                const serviceIds = services.map(s => s.id);

                // Then find professionals who have these service_ids
                // professionals.service_ids is an array of strings (UUIDs)
                // We can use the 'cs' (contains) operator if we had the exact array, but here we want "if professional has ANY of these services"
                // Supabase/Postgres array overlap operator is '&&' (pg) or .overlaps() (js)

                if (serviceIds.length === 0) {
                    data = [];
                } else {
                    ({ data, error } = await supabase
                        .from("professionals")
                        .select("*")
                        .eq("user_id", user_id)
                        .overlaps("service_ids", serviceIds));
                }
                break;

            case "by_name":
                if (!name) throw new Error("Missing name");
                ({ data, error } = await supabase
                    .from("professionals")
                    .select("*")
                    .eq("user_id", user_id)
                    .ilike("name", `%${name}%`));
                break;

            default:
                throw new Error("Invalid action. Use: list_all, by_service, by_name");
        }

        if (error) throw error;

        return new Response(
            JSON.stringify(data),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
