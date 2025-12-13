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

        const { action, user_id, contact_id, deal_id, stage_id, deal_data } = await req.json();

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

        if (action === "get_deal") {
            if (!contact_id) throw new Error("Missing contact_id");

            // Fetch deals for this contact
            const { data, error } = await supabase
                .from("crm_deals")
                .select("*, crm_stages(name)")
                .eq("user_id", user_id)
                .eq("contact_id", contact_id);

            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (action === "update_stage") {
            if (!deal_id || !stage_id) throw new Error("Missing deal_id or stage_id");

            const { data, error } = await supabase
                .from("crm_deals")
                .update({ stage_id })
                .eq("user_id", user_id)
                .eq("id", deal_id)
                .select()
                .single();

            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (action === "create_deal") {
            if (!deal_data) throw new Error("Missing deal_data");
            // deal_data: contact_id, name, value, stage_id, etc.

            const payload = { ...deal_data, user_id };

            const { data, error } = await supabase
                .from("crm_deals")
                .insert(payload)
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
