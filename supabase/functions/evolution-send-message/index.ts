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

    const { conversationId, body, messageType = 'text', mediaUrl, caption, replyId, quotedBody, quotedSender } = await req.json();
    console.log('=== [UZAPI SEND MESSAGE] START ===');
    console.log('Conversation ID:', conversationId);
    console.log('Message Type:', messageType);
    console.log('Reply ID:', replyId);

    // Buscar conversation
    const { data: conversation, error: convError } = await supabaseClient
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .single();

    if (convError) {
      console.error('Conversation error:', convError);
      throw new Error(`Conversation not found: ${convError.message}`);
    }

    let remoteJid = '';
    let isGroup = false;

    if (conversation.group_id) {
      console.log('Processing as Group Conversation. Group ID:', conversation.group_id);
      const { data: group, error: groupError } = await supabaseClient
        .from('groups')
        .select('*')
        .eq('id', conversation.group_id)
        .single();

      if (groupError || !group) throw new Error('Group not found');
      remoteJid = group.remote_jid;
      isGroup = true;
    } else if (conversation.contact_id) {
      console.log('Processing as Contact Conversation. Contact ID:', conversation.contact_id);
      const { data: contact, error: contactError } = await supabaseClient
        .from('contacts')
        .select('*')
        .eq('id', conversation.contact_id)
        .single();

      if (contactError || !contact) throw new Error('Contact not found');
      remoteJid = contact.number;
    } else {
      throw new Error('Invalid conversation: missing group_id and contact_id');
    }

    let instance;

    if (conversation.instance_id) {
      const { data: specificInstance, error: instanceError } = await supabaseClient
        .from('instances')
        .select('*')
        .eq('id', conversation.instance_id)
        .single();

      if (!instanceError && specificInstance) {
        instance = specificInstance;
      }
    }

    if (!instance && conversation.contact_id) {
      // Fallback logic could go here
    }

    if (!instance) {
      throw new Error('No instance associated with this conversation.');
    }

    if (instance.status !== 'connected') {
      console.warn(`Instance ${instance.name} status is ${instance.status}, attempting to send anyway.`);
    }

    const userId = instance.user_id;

    // ✅ OTIMIZAÇÃO: Adicionar assinatura do agente no BACKEND (movido do frontend)
    let finalBody = body;

    if (conversation.status === 'open' && messageType === 'text' && conversation.assigned_agent_id) {
      const { data: teamMember } = await supabaseClient
        .from('team_members')
        .select('full_name, name, sign_messages')
        .eq('id', conversation.assigned_agent_id)
        .single();

      if (teamMember && teamMember.sign_messages !== false) {
        const senderName = teamMember.full_name || teamMember.name || "Atendente";
        finalBody = `*${senderName}:*\n${body}`;
      }
    }

    // Tratamento do JID para Uzapi
    let targetNumber = remoteJid;
    if (remoteJid.includes('@')) {
      targetNumber = remoteJid.split('@')[0];
    }

    console.log('Sending to Number:', targetNumber);

    let sendUrl;
    let payload;

    if (messageType === 'text') {
      sendUrl = `https://clinvia.uazapi.com/send/text`;
      payload = {
        number: targetNumber,
        text: finalBody
      };
      if (replyId) {
        payload.replyid = replyId;
        console.log('Adding replyid to payload:', replyId);
      }
    } else {
      sendUrl = `https://clinvia.uazapi.com/send/media`;
      let uzapiType = messageType;
      if (messageType === 'audio') uzapiType = 'ptt';

      payload = {
        number: targetNumber,
        type: uzapiType,
        file: mediaUrl
      };

      if (caption) {
        payload.caption = caption;
        console.log('Adding caption to media payload:', caption);
      }
    }

    console.log('Uzapi URL:', sendUrl);
    // console.log('Payload:', JSON.stringify(payload));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const sendResponse = await fetch(sendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'token': instance.apikey
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('Uzapi response status:', sendResponse.status);

      if (!sendResponse.ok) {
        const errorText = await sendResponse.text();
        console.error('Uzapi error:', errorText);
        throw new Error(`Failed to send message via Uzapi: ${errorText}`);
      }

      const sendData = await sendResponse.json();
      console.log('Uzapi response:', sendData);

      let insertBody = body;
      let insertCaption = caption || null;

      if (messageType === 'document') {
        insertBody = body;
        if (caption && conversation.assigned_agent_id) {
          const { data: teamMember } = await supabaseClient
            .from('team_members')
            .select('full_name, name, sign_messages')
            .eq('id', conversation.assigned_agent_id)
            .single();

          if (teamMember && teamMember.sign_messages !== false) {
            const senderName = teamMember.full_name || teamMember.name || "Atendente";
            insertCaption = `*${senderName}:*\n${caption}`;
          } else {
            insertCaption = caption;
          }
        } else {
          insertCaption = caption || null;
        }
      } else if (messageType === 'text') {
        insertBody = finalBody;
        insertCaption = null;
      } else {
        insertBody = finalBody || `[${messageType}]`;
        insertCaption = caption || null;
      }

      // Salvar mensagem no banco
      const { data: message, error: messageError } = await supabaseClient
        .from('messages')
        .insert({
          conversation_id: conversationId,
          body: insertBody,
          direction: 'outbound',
          message_type: messageType,
          media_url: mediaUrl,
          evolution_id: sendData.messageid || sendData.id || null,
          user_id: userId,
          reply_to_id: replyId || null,
          quoted_body: quotedBody || null,
          quoted_sender: quotedSender || null,
          caption: insertCaption,
          status: 'sent'
        })
        .select('id, conversation_id, body, direction, message_type, created_at')
        .single();

      if (messageError) {
        console.error('Message insert error:', messageError);
        throw new Error(`Failed to save message: ${messageError.message}`);
      }

      console.log('Message saved to database:', message.id);

      // ✅ OTIMIZAÇÃO: Conversation update automático via trigger
      // Ver: 20250203_auto_update_conversation_timestamp.sql

      console.log('=== [UZAPI SEND MESSAGE] SUCCESS ===');

      return new Response(
        JSON.stringify({
          success: true,
          messageId: message.id,
          providerId: sendData.messageid
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        throw new Error('Uzapi timeout: Request aborted after 10 seconds');
      }
      throw fetchError;
    }
  } catch (error: any) {
    console.error('=== [UZAPI SEND MESSAGE] ERROR ===');
    console.error('Error:', error.message);

    return new Response(
      JSON.stringify({
        error: error.message,
        details: error.stack
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
