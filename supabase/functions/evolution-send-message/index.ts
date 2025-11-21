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

    const { conversationId, body } = await req.json();
    console.log('Sending message for conversation:', conversationId);

    // Buscar conversation + contact
    const { data: conversation, error: convError } = await supabaseClient
      .from('conversations')
      .select(`
        *,
        contact:contacts(*)
      `)
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      throw new Error('Conversation not found');
    }

    const contact = conversation.contact;
    if (!contact) {
      throw new Error('Contact not found');
    }

    // Buscar primeira instância conectada (por enquanto usamos a primeira)
    // TODO: melhorar para permitir múltiplas instâncias
    const { data: instance, error: instanceError } = await supabaseClient
      .from('instances')
      .select('*')
      .eq('status', 'connected')
      .limit(1)
      .single();

    if (instanceError || !instance) {
      throw new Error('No connected instance found');
    }

    console.log('Using instance:', instance.instance_name);

    // Extrair número do remote_jid (formato: 5511999999999@s.whatsapp.net)
    const phoneNumber = contact.remote_jid.split('@')[0];

    // Enviar mensagem via Evolution API
    const sendResponse = await fetch(
      `${instance.server_url}/message/sendText/${instance.instance_name}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': instance.apikey
        },
        body: JSON.stringify({
          number: phoneNumber,
          text: body
        })
      }
    );

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error('Evolution API error:', errorText);
      throw new Error(`Failed to send message: ${errorText}`);
    }

    const sendData = await sendResponse.json();
    console.log('Message sent via Evolution API:', sendData);

    // Salvar mensagem no banco
    const { data: message, error: messageError } = await supabaseClient
      .from('messages')
      .insert({
        conversation_id: conversationId,
        body,
        direction: 'outbound',
        message_type: 'text',
        evolution_id: sendData.key?.id || null
      })
      .select()
      .single();

    if (messageError) throw messageError;

    // Atualizar conversation updated_at
    await supabaseClient
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);

    console.log('Message saved to database');

    return new Response(
      JSON.stringify({
        success: true,
        messageId: message.id,
        evolutionId: sendData.key?.id
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error('Error in evolution-send-message:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
