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

    const { conversationId, body, messageType = 'text', mediaUrl, caption, replyId, quotedBody, quotedSender, agentId } = await req.json();
    console.log('=== [UZAPI SEND MESSAGE] START ===');
    console.log('Conversation ID:', conversationId);
    console.log('Message Type:', messageType);
    console.log('Agent ID:', agentId);
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
      remoteJid = contact.number; // Changed from remote_jid to number as per schema update
    } else {
      throw new Error('Invalid conversation: missing group_id and contact_id');
    }

    let instance;

    // 1. Strict Priority: Use conversation.instance_id
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

    // 2. Fallback: Try to get from contact
    if (!instance && conversation.contact_id) {
      // ... (Keep existing fallback logic if needed, but instance_id should be on conversation now)
      // For brevity and since we enforced instance_id in conversation logic, we might skip complex fallback
      // but let's keep it simple: if no instance, fail.
    }

    if (!instance) {
      throw new Error('No instance associated with this conversation.');
    }

    if (instance.status !== 'connected') {
      // throw new Error(`Instance ${instance.name} is not connected.`);
      // Proceeding anyway as status might be out of sync
      console.warn(`Instance ${instance.name} status is ${instance.status}, attempting to send anyway.`);
    }

    const userId = instance.user_id;

    // ✅ FIX: Atribuir agente e mudar status para 'open' se conversa estiver 'pending'
    if (conversation.status === 'pending' && conversation.assigned_agent_id === null && agentId) {
      console.log('[AUTO-ASSIGN] Conversation is pending with no agent. Assigning agent:', agentId);

      const { error: updateError } = await supabaseClient
        .from('conversations')
        .update({
          status: 'open',
          assigned_agent_id: agentId,
          assigned_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      if (updateError) {
        console.error('[AUTO-ASSIGN] Error updating conversation:', updateError);
      } else {
        console.log('[AUTO-ASSIGN] Conversation updated to open, agent assigned!');
        // Atualizar objeto local para assinatura funcionar corretamente
        conversation.status = 'open';
        conversation.assigned_agent_id = agentId;
      }
    }

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
    // Uzapi seems to expect just the number for individuals, and likely the same for groups (stripping suffix)
    // or maybe full JID. The user example showed "number": "<numero_do_remetente>"
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
      // Add replyid if present
      if (replyId) {
        payload.replyid = replyId;
        console.log('Adding replyid to payload:', replyId);
      }
    } else {
      sendUrl = `https://clinvia.uazapi.com/send/media`;
      // Map internal types to Uzapi types if necessary
      // Internal: text, image, audio, video, document
      // Uzapi: image, video, document, audio, myaudio, ptt, sticker
      let uzapiType = messageType;
      if (messageType === 'audio') uzapiType = 'ptt'; // Sending as PTT (voice note) usually preferred

      payload = {
        number: targetNumber,
        type: uzapiType,
        file: mediaUrl
      };

      // ✅ FIX: Adicionar caption se existir (mensagem do usuário)
      if (caption) {
        payload.caption = caption;
        console.log('Adding caption to media payload:', caption);
      }
    }

    console.log('Uzapi URL:', sendUrl);
    console.log('Payload:', JSON.stringify(payload));

    // ✅ OTIMIZAÇÃO: Timeout de 10s
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

      console.log('=== DEBUG: Database Insert Preparation ===');
      console.log('body (original):', body);
      console.log('caption (original):', caption);
      console.log('messageType:', messageType);
      console.log('finalBody:', finalBody);
      console.log('conversation.assigned_agent_id:', conversation.assigned_agent_id);

      // ✅ FIX: Para documentos, preservar filename no body SEMPRE
      // caption = mensagem do usuário (com ou sem assinatura)
      // body = nome do arquivo SEMPRE (para documentos)
      let insertBody = body; // Padrão: usar body original
      let insertCaption = caption || null;

      if (messageType === 'document') {
        // 📄 DOCUMENTOS: body = filename, caption = mensagem do usuário
        insertBody = body; // Nome do arquivo (NUNCA modificar!)

        // ✅ FIX CRÍTICO: usar caption (não finalBody!)
        // Se houver caption E agente atribuído, adicionar assinatura
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
        // 💬 TEXTO: usar finalBody (já tem assinatura)
        insertBody = finalBody;
        insertCaption = null;
      } else {
        // 🖼️ IMAGEM/VÍDEO/ÁUDIO: caption opcional
        insertBody = finalBody || `[${messageType}]`;
        insertCaption = caption || null;
      }

      console.log('=== DEBUG: Final Insert Values ===');
      console.log('insertBody:', insertBody);
      console.log('insertCaption:', insertCaption);

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
          caption: insertCaption, // ✅ Caption separado (mensagemcom assinatura para docs)
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
