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

    const reqData = await req.json();
    let { conversationId, body, messageType = 'text', mediaUrl, caption, replyId, quotedBody, quotedSender, contactId, groupId, mentions, forward } = reqData;
    console.log('[evolution-send-message] Start conversationId:', conversationId);

    // ✅ CONVERSATION CREATION LOGIC (Agent-initiated conversations)
    // Se não temos conversationId, mas temos contactId ou groupId, buscar/criar conversa
    if (!conversationId && (contactId || groupId)) {

      // 1. Identificar agente autenticado
      const authHeader = req.headers.get('Authorization');
      let authenticatedAgentId = null;
      let userId = null;

      if (authHeader) {
        try {
          const token = authHeader.replace('Bearer ', '');
          const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

          if (user && !userError) {
            userId = user.id;

            const { data: teamMember } = await supabaseClient
              .from('team_members')
              .select('id, user_id')
              .eq('auth_user_id', user.id)
              .single();

            if (teamMember) {
              authenticatedAgentId = teamMember.id;
              userId = teamMember.user_id; // Owner user_id
            }
          }
        } catch (authError) {
          console.error('[CONV-CREATE] ❌ Auth error:', authError);
        }
      }

      if (!userId) {
        throw new Error('Cannot create conversation: User not authenticated');
      }

      // 2. Buscar instância a partir do contactId ou groupId
      let instanceId = null;

      if (contactId) {
        const { data: contact } = await supabaseClient
          .from('contacts')
          .select('instance_id')
          .eq('id', contactId)
          .single();
        instanceId = contact?.instance_id;
      } else if (groupId) {
        const { data: group } = await supabaseClient
          .from('groups')
          .select('instance_id')
          .eq('id', groupId)
          .single();
        instanceId = group?.instance_id;
      }

      if (!instanceId) {
        throw new Error('Cannot create conversation: Instance not found for contact/group');
      }

      // 3. Buscar conversa existente
      let searchQuery = supabaseClient
        .from('conversations')
        .select('*')
        .eq('instance_id', instanceId)
        .eq('user_id', userId)
        .in('status', ['pending', 'open'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (contactId) searchQuery = searchQuery.eq('contact_id', contactId);
      if (groupId) searchQuery = searchQuery.eq('group_id', groupId);

      const { data: existingConvs } = await searchQuery;

      if (existingConvs && existingConvs.length > 0) {
        conversationId = existingConvs[0].id;
      } else if (authenticatedAgentId) {
        // 4. Criar nova conversa como 'open' + assigned to agent

        const { data: newConv, error: createError } = await supabaseClient
          .from('conversations')
          .insert({
            contact_id: contactId || null,
            group_id: groupId || null,
            instance_id: instanceId,
            user_id: userId,
            status: 'open',
            source: 'panel', // Criado pelo painel
            assigned_agent_id: authenticatedAgentId
          })
          .select()
          .single();

        if (createError) throw createError;
        conversationId = newConv.id;
      } else {
        throw new Error('Cannot create conversation: Agent not authenticated');
      }
    }

    // Buscar conversation (agora com conversationId garantido)
    if (!conversationId) {
      throw new Error('Conversation ID is required');
    }

    const { data: conversation, error: convError } = await supabaseClient
      .from('conversations')
      .select('*, instance:instances(*)')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      throw new Error(`Conversation not found: ${convError?.message}`);
    }

    const instance = conversation.instance;
    if (!instance || !instance.apikey) {
      throw new Error('Instance configuration missing');
    }

    let remoteJid = '';
    let isGroup = false;

    if (conversation.group_id) {
      const { data: group, error: groupError } = await supabaseClient
        .from('groups')
        .select('remote_jid')
        .eq('id', conversation.group_id)
        .single();

      if (groupError || !group?.remote_jid) throw new Error('Group JID not found');
      remoteJid = group.remote_jid;
      isGroup = true;
    } else if (conversation.contact_id) {
      const { data: contact, error: contactError } = await supabaseClient
        .from('contacts')
        .select('number')
        .eq('id', conversation.contact_id)
        .single();

      if (contactError || !contact?.number) throw new Error('Contact number not found');
      remoteJid = contact.number;
    } else {
      throw new Error('Invalid conversation: missing group_id and contact_id');
    }

    if (instance.status !== 'connected') {
      console.warn(`Instance ${instance.name} status is ${instance.status}, attempting to send anyway.`);
    }

    const userId = instance.user_id;

    // ✅ Lógica de Auth e Status Update (Human vs API)
    // SOLUÇÃO: Passar JWT diretamente para getUser(jwt)
    const authHeader = req.headers.get('Authorization');
    let authenticatedAgentId = null;

    if (authHeader) {
      try {
        // Extrair token do header
        const token = authHeader.replace('Bearer ', '');

        // ✅ CORRETO: Usar getUser(jwt) passando o token diretamente
        // Funciona com qualquer cliente (SERVICE_ROLE ou ANON_KEY)
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

        if (user && !userError) {
          // Buscar team_member usando o cliente SERVICE_ROLE (bypass RLS)
          const { data: teamMember, error: teamError } = await supabaseClient
            .from('team_members')
            .select('id')
            .eq('auth_user_id', user.id)
            .single();

          if (teamMember && !teamError) {
            authenticatedAgentId = teamMember.id;
          } else {
            console.warn('⚠️ Team member not found for user:', user.id, teamError);
          }
        }
      } catch (authError) {
        console.error('❌ Auth error:', authError);
      }
    }

    // 3. Verificar flag wasSentByApi e Status
    // Se NÃO foi enviado pela API (ou flag não existe/false) -> É Humano
    const isApiMessage = reqData?.message?.wasSentByApi === true;

    if (!isApiMessage) {
      if (conversation.status === 'pending') {
        try {
          const updates: any = {
            status: 'open'
          };

          // Se identificamos o agente logado, atribuir a ele
          if (authenticatedAgentId) {
            updates.assigned_agent_id = authenticatedAgentId;
          } else if (conversation.assigned_agent_id) {
            // Mantém o agente atual
          }

          const { error: updateError } = await supabaseClient
            .from('conversations')
            .update(updates)
            .eq('id', conversationId);

          if (updateError) {
            console.error('[AUTO-UPDATE] Error updating conversation:', updateError);
          } else {
            conversation.status = 'open'; // Atualizar local
            if (updates.assigned_agent_id) conversation.assigned_agent_id = updates.assigned_agent_id;
          }

        } catch (statusError) {
          console.error('[AUTO-UPDATE] Exception updating status:', statusError);
        }
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
      }
      if (forward) {
        payload.forward = true;
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
      }
      if (forward) {
        payload.forward = true;
      }
    }

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
