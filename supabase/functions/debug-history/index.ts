import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Fetch resolved conversations
        const { data: conversations, error } = await supabaseClient
            .from('conversations')
            .select('id, updated_at, messages_history')
            .eq('status', 'resolved')
            .order('updated_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        let targetConv = null;
        for (const conv of conversations) {
            const { count } = await supabaseClient
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('conversation_id', conv.id)
                .eq('message_type', 'image'); // Look for images specifically

            if (count > 0) {
                targetConv = conv;
                break;
            }
        }

        if (!targetConv) {
            return new Response(
                JSON.stringify({ error: "No resolved conversation with IMAGES found" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log('Target Conversation ID:', targetConv.id);
        console.log('Messages History:', JSON.stringify(targetConv.messages_history, null, 2));

        // Fetch raw messages for this conversation
        const { data: rawMessages } = await supabaseClient
            .from('messages')
            .select('*')
            .eq('conversation_id', targetConv.id);

        return new Response(
            JSON.stringify({
                id: targetConv.id,
                history: targetConv.messages_history,
                raw_messages: rawMessages
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
