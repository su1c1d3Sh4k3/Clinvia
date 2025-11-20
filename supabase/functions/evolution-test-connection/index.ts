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

    const { data: instance, error } = await supabaseClient
      .from('instances')
      .select('*')
      .eq('id', instanceId)
      .single();

    if (error) throw error;

    const testResponse = await fetch(`${instance.server_url}/instance/fetchInstances`, {
      headers: { 'apikey': instance.apikey }
    });

    const status = testResponse.ok ? 'connected' : 'disconnected';

    await supabaseClient
      .from('instances')
      .update({ status })
      .eq('id', instanceId);

    return new Response(JSON.stringify({ status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
