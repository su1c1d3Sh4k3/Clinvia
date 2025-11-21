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
    console.log('Checking connection for instance:', instanceId);

    // Buscar instância
    const { data: instance, error: fetchError } = await supabaseClient
      .from('instances')
      .select('*')
      .eq('id', instanceId)
      .single();

    if (fetchError || !instance) {
      throw new Error('Instance not found');
    }

    if (!instance.instance_name) {
      throw new Error('Instance not initialized');
    }

    // Verificar status na Evolution API
    const stateResponse = await fetch(
      `${instance.server_url}/instance/connectionState/${instance.instance_name}`,
      {
        headers: { 'apikey': instance.apikey }
      }
    );

    if (!stateResponse.ok) {
      console.error('Evolution API error:', await stateResponse.text());
      throw new Error('Failed to check connection state');
    }

    const stateData = await stateResponse.json();
    console.log('Connection state:', stateData);

    const evolutionState = stateData.instance?.state || stateData.state;
    let status = 'disconnected';

    if (evolutionState === 'open' || evolutionState === 'connected') {
      status = 'connected';
    } else if (evolutionState === 'connecting' || evolutionState === 'qr') {
      status = 'qr';
    }

    // Atualizar status no banco
    const { error: updateError } = await supabaseClient
      .from('instances')
      .update({ 
        status,
        qr_code: status === 'connected' ? null : instance.qr_code
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
    console.error('Error in evolution-check-connection:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
