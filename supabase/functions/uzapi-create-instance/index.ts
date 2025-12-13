import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UZAPI_URL = 'https://clinvia.uazapi.com';
const UZAPI_ADMIN_TOKEN = '6EiMFTZGDpLxaP5u1pD2oXpzTjwL5B73WEdcCfjOIRYsTlGx1l';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { instanceName, userId } = await req.json(); // Expect userId in body
    const sanitizedName = instanceName.trim();

    console.log('[1] Creating Uzapi instance:', sanitizedName, 'for user:', userId);

    if (!userId) {
      throw new Error("User ID is required to create an instance.");
    }

    const uzapiResponse = await fetch(`${UZAPI_URL}/instance/init`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'admintoken': UZAPI_ADMIN_TOKEN
      },
      body: JSON.stringify({
        name: sanitizedName,
        systemName: 'apilocal'
      })
    });

    if (!uzapiResponse.ok) {
      const errorText = await uzapiResponse.text();
      console.error('[2] Uzapi API Error:', errorText);
      throw new Error(`Uzapi rejected request: ${errorText}`);
    }

    const uzapiData = await uzapiResponse.json();
    console.log('[3] Uzapi response received');

    const instanceToken = uzapiData.token;
    const instanceStatus = uzapiData.instance?.status || 'disconnected';
    const finalName = uzapiData.name || sanitizedName;

    // Webhook externo que receberá os dados APÓS processamento
    const externalWebhook = `https://webhooks.clinvia.com.br/webhook/${finalName}`;

    const { data: newInstance, error: insertError } = await supabaseClient
      .from('instances')
      .insert({
        name: finalName,
        instance_name: finalName,
        server_url: UZAPI_URL,
        apikey: instanceToken,
        status: instanceStatus,
        qr_code: uzapiData.qrcode || uzapiData.qr || uzapiData.base64 || null,
        webhook_url: externalWebhook,
        user_id: userId // Save user_id
      })
      .select()
      .single();

    if (insertError) {
      console.error('[4] Database Insert Error:', insertError);
      throw insertError;
    }

    console.log('[5] Instance saved to database');

    return new Response(
      JSON.stringify({
        success: true,
        id: newInstance.id,
        instanceName: finalName,
        token: instanceToken,
        status: instanceStatus,
        ...uzapiData
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('[ERROR] uzapi-create-instance failed:', error);
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
