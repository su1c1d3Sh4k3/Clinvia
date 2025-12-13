import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UZAPI_URL = 'https://clinvia.uazapi.com';

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { instanceId } = await req.json();

        console.log('[1] Deleting Uzapi instance:', instanceId);

        // 1. Get Instance Token from DB
        const { data: instance, error: fetchError } = await supabaseClient
            .from('instances')
            .select('apikey')
            .eq('id', instanceId)
            .single();

        if (fetchError || !instance) {
            throw new Error('Instance not found');
        }

        if (instance.apikey) {
            // 2. Delete from Uzapi
            const uzapiResponse = await fetch(`${UZAPI_URL}/instance`, {
                method: 'DELETE',
                headers: {
                    'Accept': 'application/json',
                    'token': instance.apikey
                }
            });

            if (!uzapiResponse.ok) {
                const errorText = await uzapiResponse.text();
                console.error('[2] Uzapi Delete Error:', errorText);
                // We might still want to delete from DB even if Uzapi fails, or maybe not?
                // Let's assume we want to force delete from DB if user requested it, 
                // but logging the error is important.
            } else {
                console.log('[2] Deleted from Uzapi');
            }
        }

        // 3. Delete from DB
        const { error: deleteError } = await supabaseClient
            .from('instances')
            .delete()
            .eq('id', instanceId);

        if (deleteError) throw deleteError;

        console.log('[3] Deleted from Database');

        return new Response(
            JSON.stringify({ success: true }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );

    } catch (error: any) {
        console.error('Error in uzapi-delete-instance:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }
});
