import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { instanceId } = await req.json();

        if (!instanceId) {
            return new Response(
                JSON.stringify({ success: false, error: "instanceId is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: instance, error: dbError } = await supabase
            .from("instances")
            .select("apikey")
            .eq("id", instanceId)
            .single();

        if (dbError || !instance?.apikey) {
            console.error("[configure-webhook] DB error:", dbError);
            return new Response(
                JSON.stringify({ success: false, error: "Instance not found or apikey missing" }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log("[configure-webhook] Calling UzAPI for instance:", instanceId);

        const response = await fetch("https://clinvia.uazapi.com/webhook", {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "token": instance.apikey
            },
            body: JSON.stringify({
                enabled: true,
                url: "https://swfshqvvbohnahdyndch.supabase.co/functions/v1/uzapi-webhook-refactor",
                events: ["messages", "connection", "messages_update"],
                excludeMessages: ["wasSentByApi"]
            })
        });

        const responseBody = await response.text();
        console.log("[configure-webhook] UzAPI status:", response.status);
        console.log("[configure-webhook] UzAPI response:", responseBody);

        if (!response.ok) {
            return new Response(
                JSON.stringify({ success: false, error: `UzAPI error: ${response.status}`, details: responseBody }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ success: true, message: "Webhook configured" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("[configure-webhook] Error:", error);
        return new Response(
            JSON.stringify({ success: false, error: String(error) }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
