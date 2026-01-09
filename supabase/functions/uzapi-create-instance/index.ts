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

    const { instanceName, userId } = await req.json();

    // Sanitize name: lowercase, spaces to hyphens, trim
    const sanitizedName = instanceName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    console.log('[1] Validating instance name:', sanitizedName, 'for user:', userId);

    if (!sanitizedName) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Nome da instância inválido"
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!userId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "User ID is required to create an instance."
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ===== STEP 1: CHECK FOR DUPLICATE NAME IN DATABASE FIRST =====
    console.log('[2] Checking for duplicate instance name in database...');
    const { data: existingInstance, error: checkError } = await supabaseClient
      .from('instances')
      .select('id, name, user_id')
      .eq('name', sanitizedName)
      .maybeSingle();

    if (checkError) {
      console.error('[2.1] Error checking for duplicates:', checkError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Erro ao verificar nome da instância"
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (existingInstance) {
      console.log('[2.2] Duplicate found:', existingInstance);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Instâncias precisam ter nomes únicos para evitar conflitos e esse nome já foi usado."
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[3] No duplicate found, proceeding to create on UzAPI...');

    // ===== STEP 2: CREATE ON UZAPI (only after duplicate check passes) =====
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
      console.error('[4] Uzapi API Error:', errorText);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Erro na UzAPI: ${errorText}`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const uzapiData = await uzapiResponse.json();
    console.log('[5] Uzapi response received');

    const instanceToken = uzapiData.token;
    const instanceStatus = uzapiData.instance?.status || 'disconnected';
    const finalName = uzapiData.name || sanitizedName;

    // Webhook externo que receberá os dados APÓS processamento
    const externalWebhook = `https://webhooks.clinvia.com.br/webhook/${finalName}`;

    // ===== STEP 3: SAVE TO DATABASE =====
    console.log('[6] Saving instance to database...');
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
        user_id: userId
      })
      .select()
      .single();

    if (insertError) {
      console.error('[7] Database Insert Error:', insertError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Erro ao salvar instância no banco de dados"
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[8] Instance saved to database successfully');

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
        error: error.message || "Erro desconhecido ao criar instância"
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
