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
        console.log('Checking Uzapi connection for instance:', instanceId);

        // 1. Get Instance Token from DB
        const { data: instance, error: fetchError } = await supabaseClient
            .from('instances')
            .select('*')
            .eq('id', instanceId)
            .single();

        if (fetchError || !instance) {
            throw new Error('Instance not found');
        }

        if (!instance.apikey) {
            throw new Error('Instance token (apikey) not found. Instance might not be initialized.');
        }

        // 2. Fetch Status from Uzapi
        const statusResponse = await fetch(`${UZAPI_URL}/instance/status`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'token': instance.apikey
            }
        });

        if (!statusResponse.ok) {
            console.error('Uzapi Status Error:', await statusResponse.text());
            throw new Error('Failed to check connection state');
        }

        const statusData = await statusResponse.json();

        // ===== DEBUG: Log full UzAPI response =====
        console.log('========== UZAPI FULL RESPONSE DEBUG ==========');
        console.log('Raw statusData type:', typeof statusData);
        console.log('Raw statusData:', JSON.stringify(statusData, null, 2));
        console.log('Is Array:', Array.isArray(statusData));

        // Handle Array Response
        const responseItem = Array.isArray(statusData) ? statusData[0] : statusData;
        console.log('responseItem:', JSON.stringify(responseItem, null, 2));

        const instanceData = responseItem.instance || {};
        const statusInfo = responseItem.status || {};

        console.log('instanceData:', JSON.stringify(instanceData, null, 2));
        console.log('statusInfo:', JSON.stringify(statusInfo, null, 2));
        console.log('All keys in responseItem:', Object.keys(responseItem));
        console.log('All keys in instanceData:', Object.keys(instanceData));

        // Check for profile picture in different possible locations
        console.log('===== PROFILE PICTURE SEARCH =====');
        console.log('instanceData.profilePicUrl:', instanceData.profilePicUrl);
        console.log('instanceData.profilePictureUrl:', instanceData.profilePictureUrl);
        console.log('instanceData.profilePic:', instanceData.profilePic);
        console.log('instanceData.picture:', instanceData.picture);
        console.log('instanceData.photo:', instanceData.photo);
        console.log('instanceData.avatar:', instanceData.avatar);
        console.log('responseItem.profilePicUrl:', responseItem.profilePicUrl);
        console.log('responseItem.profilePictureUrl:', responseItem.profilePictureUrl);
        console.log('statusInfo.profilePicUrl:', statusInfo.profilePicUrl);
        console.log('========================================');

        // Map Status
        let uzapiStatus = instanceData.status;

        // If status is not explicitly provided, infer from connected boolean
        if (!uzapiStatus && statusInfo.connected !== undefined) {
            uzapiStatus = statusInfo.connected ? 'connected' : 'disconnected';
        }

        let status = 'disconnected';

        if (uzapiStatus === 'connected' || uzapiStatus === 'open') {
            status = 'connected';
        } else if (uzapiStatus === 'connecting') {
            status = 'connecting';
        }

        // 3. Handle Profile Picture
        let profilePicUrl = instance.profile_pic_url;
        if (instanceData.profilePicUrl && instanceData.profilePicUrl !== instance.profile_pic_url) {
            try {
                console.log('Downloading profile picture from:', instanceData.profilePicUrl);
                const picResponse = await fetch(instanceData.profilePicUrl);
                if (picResponse.ok) {
                    const picBlob = await picResponse.blob();
                    const fileName = `${instanceId}_avatar.jpg`;

                    const { data: uploadData, error: uploadError } = await supabaseClient
                        .storage
                        .from('avatars')
                        .upload(fileName, picBlob, {
                            contentType: 'image/jpeg',
                            upsert: true
                        });

                    if (uploadError) {
                        console.error('Error uploading avatar:', uploadError);
                    } else {
                        const { data: publicUrlData } = supabaseClient
                            .storage
                            .from('avatars')
                            .getPublicUrl(fileName);

                        profilePicUrl = publicUrlData.publicUrl;
                        console.log('New profile pic url:', profilePicUrl);
                    }
                }
            } catch (picError) {
                console.error('Error handling profile pic:', picError);
            }
        }

        // 4. Update DB
        const { error: updateError } = await supabaseClient
            .from('instances')
            .update({
                status,
                qr_code: status === 'connected' ? null : instance.qr_code,
                profile_pic_url: profilePicUrl
            })
            .eq('id', instanceId);

        if (updateError) throw updateError;

        console.log('Status updated to:', status);

        return new Response(
            JSON.stringify({ status }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );

    } catch (error: any) {
        console.error('Error in uzapi-check-connection:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }
});
