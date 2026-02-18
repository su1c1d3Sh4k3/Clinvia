import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UZAPI_URL = 'https://clinvia.uazapi.com';

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const { action, instanceId, ...payload } = await req.json();

        if (!instanceId) {
            throw new Error('instanceId is required');
        }

        console.log(`[uzapi-manager] Action: ${action} | Instance: ${instanceId}`);

        // Get Instance
        const { data: instance, error: fetchError } = await supabaseClient
            .from('instances')
            .select('*')
            .eq('id', instanceId)
            .single();

        if (fetchError || !instance) {
            throw new Error('Instance not found');
        }

        if (!instance.apikey) {
            throw new Error('Instance token (apikey) not found.');
        }

        // ==============================================================================
        // ACTION: CHECK_CONNECTION / CHECK_STATUS
        // ==============================================================================
        if (action === 'check_connection' || action === 'check_status') {
            console.log('[uzapi-manager] Checking connection status...');

            const statusResponse = await fetch(`${UZAPI_URL}/instance/status`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'token': instance.apikey
                }
            });

            if (!statusResponse.ok) {
                const errorText = await statusResponse.text();
                console.error('[uzapi-manager] Status Error:', errorText);
                throw new Error(`Failed to check status: ${errorText}`);
            }

            const statusData = await statusResponse.json();
            const responseItem = Array.isArray(statusData) ? statusData[0] : statusData;

            const instanceInfo = responseItem.instance || {};
            const statusInfo = responseItem.status || {};

            // Map Status
            let uzapiStatus = instanceInfo.status;
            if (!uzapiStatus && statusInfo.connected !== undefined) {
                uzapiStatus = statusInfo.connected ? 'connected' : 'disconnected';
            }

            let status = 'disconnected';
            if (uzapiStatus === 'connected' || uzapiStatus === 'open') {
                status = 'connected';
            } else if (uzapiStatus === 'connecting') {
                status = 'connecting';
            }

            // Handle Profile Picture
            let profilePicUrl = instance.profile_pic_url;
            const newPicUrl = instanceInfo.profilePicUrl || instanceInfo.profilePictureUrl || instanceInfo.avatar;

            if (newPicUrl && newPicUrl !== instance.profile_pic_url && newPicUrl.startsWith('http')) {
                try {
                    console.log('[uzapi-manager] Updating profile picture...');
                    const picResponse = await fetch(newPicUrl);
                    if (picResponse.ok) {
                        const picBlob = await picResponse.blob();
                        const fileName = `${instanceId}_avatar_${Date.now()}.jpg`;

                        const { error: uploadError } = await supabaseClient
                            .storage
                            .from('avatars')
                            .upload(fileName, picBlob, { contentType: 'image/jpeg', upsert: true });

                        if (!uploadError) {
                            const { data: publicUrlData } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
                            profilePicUrl = publicUrlData.publicUrl;
                        }
                    }
                } catch (e) {
                    console.error('[uzapi-manager] Error updating profile pic:', e);
                }
            }

            // Update DB
            await supabaseClient
                .from('instances')
                .update({
                    status,
                    profile_pic_url: profilePicUrl,
                    user_name: instanceInfo.profileName || instanceInfo.pushName || instance.user_name,
                    qr_code: status === 'connected' ? null : instance.qr_code
                })
                .eq('id', instanceId);

            return new Response(JSON.stringify({
                success: true,
                status,
                profilePicUrl,
                profileName: instanceInfo.profileName
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // ==============================================================================
        // ACTION: CONFIGURE_WEBHOOK
        // ==============================================================================
        if (action === 'configure_webhook') {
            const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/webhook-queue-receiver`;
            console.log(`[uzapi-manager] Configuring webhook to: ${webhookUrl}`);

            const uzapiResponse = await fetch(`${UZAPI_URL}/webhook`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'token': instance.apikey
                },
                body: JSON.stringify({
                    enabled: true,
                    url: webhookUrl,
                    events: [
                        "messages",
                        "connection",
                        "messages_update",
                        "ack",
                        "history"
                    ],
                    excludeMessages: ["wasSentByApi"]
                })
            });

            if (!uzapiResponse.ok) {
                const errorText = await uzapiResponse.text();
                throw new Error(`Failed to configure webhook: ${errorText}`);
            }

            const webhookData = await uzapiResponse.json();
            console.log('[uzapi-manager] Webhook configured:', webhookData);

            // Update DB
            await supabaseClient
                .from('instances')
                .update({
                    webhook_url: webhookUrl,
                    status: 'connected' // Assuming if we can set webhook, we are connected
                })
                .eq('id', instanceId);

            return new Response(JSON.stringify({
                success: true,
                data: webhookData
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        throw new Error(`Unknown action: ${action}`);

    } catch (error: any) {
        console.error(`[uzapi-manager] Error:`, error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
