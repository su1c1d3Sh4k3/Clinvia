import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    console.log('Creating instance for:', instanceId);

    // Buscar dados da instância
    const { data: instance, error: fetchError } = await supabaseClient
      .from('instances')
      .select('*')
      .eq('id', instanceId)
      .single();

    if (fetchError) throw fetchError;

    // Gerar nome único para a instância
    const instanceName = `omnichat_${instanceId.slice(0, 8)}_${Date.now()}`;
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/evolution-webhook`;

    console.log('Instance name:', instanceName);
    console.log('Webhook URL:', webhookUrl);

    // Criar instância na Evolution API
    const createResponse = await fetch(`${instance.server_url}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': instance.apikey
      },
      body: JSON.stringify({
        instanceName: instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        webhook: {
          url: webhookUrl,
          byEvents: true,
          events: [
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'CONNECTION_UPDATE',
            'QRCODE_UPDATED'
          ]
        }
      })
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('Evolution API error:', errorText);
      throw new Error(`Failed to create instance: ${errorText}`);
    }

    const createData = await createResponse.json();
    console.log('Instance created:', createData);

    // Conectar à instância para obter QR Code
    const connectResponse = await fetch(`${instance.server_url}/instance/connect/${instanceName}`, {
      headers: { 'apikey': instance.apikey }
    });

    if (!connectResponse.ok) {
      const errorText = await connectResponse.text();
      console.error('Evolution API connect error:', errorText);
      throw new Error(`Failed to connect instance: ${errorText}`);
    }

    const connectData = await connectResponse.json();
    console.log('QR Code obtained');

    // Extrair o QR code base64
    const qrCodeBase64 = connectData.base64 || connectData.qrcode?.base64 || connectData.code;

    if (!qrCodeBase64) {
      console.error('No QR code in response:', connectData);
      throw new Error('QR code not found in Evolution API response');
    }

    // Atualizar banco com instance_name, qr_code e webhook_url
    const { error: updateError } = await supabaseClient
      .from('instances')
      .update({
        instance_name: instanceName,
        qr_code: qrCodeBase64,
        webhook_url: webhookUrl,
        status: 'qr'
      })
      .eq('id', instanceId);

    if (updateError) throw updateError;

    console.log('Instance updated in database');

    return new Response(
      JSON.stringify({
        success: true,
        instanceName,
        qrCode: qrCodeBase64,
        status: 'qr'
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error('Error in evolution-create-instance:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
