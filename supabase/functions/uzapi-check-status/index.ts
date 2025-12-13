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

        console.log('[1] Checking status for instance:', instanceId);

        // Get instance apikey from database
        const { data: instance, error: fetchError } = await supabaseClient
            .from('instances')
            .select('apikey')
            .eq('id', instanceId)
            .single();

        if (fetchError || !instance) {
            throw new Error('Instance not found');
        }

        const instanceToken = instance.apikey;

        // Call Uzapi to get instance status
        const uzapiResponse = await fetch(`${UZAPI_URL}/instance/status`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'token': instanceToken
            }
        });

        if (!uzapiResponse.ok) {
            const errorText = await uzapiResponse.text();
            console.error('[2] Uzapi Status Error:', errorText);
            throw new Error(`Failed to get status: ${errorText}`);
        }

        const uzapiData = await uzapiResponse.json();
        console.log('[3] Uzapi status response:', uzapiData);

        // Extract data from response (it's an array)
        const responseData = Array.isArray(uzapiData) ? uzapiData[0] : uzapiData;
        const instanceInfo = responseData.instance;
        const statusInfo = responseData.status;

        // Update database with profile info and status
        const { error: updateError } = await supabaseClient
            .from('instances')
            .update({
                profile_pic_url: instanceInfo.profilePicUrl || null,
                user_name: instanceInfo.profileName || null,
                status: instanceInfo.status || 'disconnected'
            })
            .eq('id', instanceId);

        if (updateError) {
            console.error('[4] Database Update Error:', updateError);
            throw updateError;
        }

        console.log('[5] Instance status updated successfully');

        return new Response(
            JSON.stringify({
                success: true,
                status: instanceInfo.status,
                connected: statusInfo.connected,
                profileName: instanceInfo.profileName,
                profilePicUrl: instanceInfo.profilePicUrl
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );

    } catch (error: any) {
        console.error('[ERROR] uzapi-check-status failed:', error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error.message
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
});
