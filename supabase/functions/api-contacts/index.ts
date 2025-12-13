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

        const { action, user_id, phone_number, contact_data } = await req.json();

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

        const cleanPhone = (phone) => {
            return phone.replace(/\D/g, "");
        };

        if (action === "get_contact") {
            if (!phone_number) throw new Error("Missing phone_number");
            const cleaned = cleanPhone(phone_number);

            // Search for number starting with cleaned version (matches @s.whatsapp.net or @whatsapp.com)
            const { data, error } = await supabase
                .from("contacts")
                .select("*")
                .eq("user_id", user_id)
                .ilike("number", `${cleaned}%`)
                .single();

            if (error && error.code !== "PGRST116") throw error; // Ignore not found

            return new Response(JSON.stringify(data || null), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (action === "create_contact") {
            if (!contact_data) throw new Error("Missing contact_data");
            // contact_data should have: name (push_name?), number, etc.
            // Ensure number is formatted if needed, or trust user?
            // Let's assume user sends raw data, but we enforce user_id

            const payload = { ...contact_data, user_id };

            const { data, error } = await supabase
                .from("contacts")
                .insert(payload)
                .select()
                .single();

            if (error) throw error;
            return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        if (action === "update_contact") {
            if (!contact_data) throw new Error("Missing contact_data");
            // Identify by ID if present, else phone
            let query = supabase.from("contacts").update(contact_data).eq("user_id", user_id);

            if (contact_data.id) {
                query = query.eq("id", contact_data.id);
            } else if (phone_number) {
                const cleaned = cleanPhone(phone_number);
                query = query.ilike("number", `${cleaned}%`);
            } else {
                throw new Error("Missing id in contact_data or phone_number to identify contact");
            }

            const { data, error } = await query.select().single();
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
