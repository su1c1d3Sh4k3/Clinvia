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

    const payload = await req.json();
    console.log('Webhook received:', JSON.stringify(payload, null, 2));

    const { event, instance: instanceName, data } = payload;

    // Buscar instância pelo instance_name
    const { data: instance, error: instanceError } = await supabaseClient
      .from('instances')
      .select('*')
      .eq('instance_name', instanceName)
      .single();

    if (instanceError || !instance) {
      console.error('Instance not found:', instanceName);
      return new Response(
        JSON.stringify({ error: 'Instance not found' }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

      // Processar evento CONNECTION_UPDATE
    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      console.log('Processing connection update:', data);
      
      const state = data.state || data.status;
      let status = 'disconnected';
      
      if (state === 'open' || state === 'connected') {
        status = 'connected';
      }

      await supabaseClient
        .from('instances')
        .update({ status, qr_code: null })
        .eq('id', instance.id);

      console.log('Connection status updated to:', status);
    }

    // Processar evento MESSAGES_UPSERT
    if (event === 'messages.upsert' || event === 'MESSAGES_UPSERT') {
      console.log('Processing message upsert');
      
      const messageData = data.messages?.[0] || data;
      const key = messageData.key;
      const message = messageData.message;
      const pushName = messageData.pushName || 'Unknown';
      
      // Extrair remote_jid
      const remoteJid = key.remoteJid;
      const fromMe = key.fromMe;
      
      // Ignorar mensagens enviadas por nós
      if (fromMe) {
        console.log('Ignoring message from self');
        return new Response(
          JSON.stringify({ success: true, ignored: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log('Message from:', remoteJid, 'Name:', pushName);

      // Mapear tipo de mensagem da Evolution para o enum do banco
      const mapMessageType = (evolutionType: string): string => {
        const typeMap: Record<string, string> = {
          'conversation': 'text',
          'extendedTextMessage': 'text',
          'imageMessage': 'image',
          'audioMessage': 'audio',
          'videoMessage': 'video',
          'documentMessage': 'document',
        };
        return typeMap[evolutionType] || 'text';
      };

      const messageType = mapMessageType(messageData.messageType || 'text');
      console.log('Mapped message type:', messageType);

      // Extrair URL de mídia
      let mediaUrl = null;
      if (message.imageMessage?.url) {
        mediaUrl = message.imageMessage.url;
      } else if (message.audioMessage?.url) {
        mediaUrl = message.audioMessage.url;
      } else if (message.videoMessage?.url) {
        mediaUrl = message.videoMessage.url;
      } else if (message.documentMessage?.url) {
        mediaUrl = message.documentMessage.url;
      }
      console.log('Media URL extracted:', mediaUrl);

      // Buscar foto de perfil do contato via Evolution API
      let profilePicUrl = null;
      try {
        const profilePicResponse = await fetch(
          `${instance.server_url}/chat/fetchProfilePictureUrl/${instanceName}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': instance.apikey,
            },
            body: JSON.stringify({ number: remoteJid }),
          }
        );

        if (profilePicResponse.ok) {
          const profileData = await profilePicResponse.json();
          profilePicUrl = profileData.profilePictureUrl || null;
          console.log('Profile picture fetched:', profilePicUrl);
        }
      } catch (error) {
        console.error('Error fetching profile picture:', error);
      }

      // UPSERT contact com foto de perfil
      const { data: contact, error: contactError } = await supabaseClient
        .from('contacts')
        .upsert({
          remote_jid: remoteJid,
          push_name: pushName,
          profile_pic_url: profilePicUrl,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'remote_jid',
          ignoreDuplicates: false
        })
        .select()
        .single();

      if (contactError) {
        console.error('Error upserting contact:', contactError);
        throw contactError;
      }

      console.log('Contact upserted:', contact.id);

      // UPSERT conversation
      const { data: conversation, error: conversationError } = await supabaseClient
        .from('conversations')
        .select('*')
        .eq('contact_id', contact.id)
        .maybeSingle();

      let conversationId;

      if (conversation) {
        // Atualizar conversa existente
        const { error: updateError } = await supabaseClient
          .from('conversations')
          .update({
            updated_at: new Date().toISOString(),
            unread_count: (conversation.unread_count || 0) + 1,
            status: 'open'
          })
          .eq('id', conversation.id);

        if (updateError) throw updateError;
        conversationId = conversation.id;
        console.log('Conversation updated:', conversationId);
      } else {
        // Criar nova conversa
        const { data: newConversation, error: createError } = await supabaseClient
          .from('conversations')
          .insert({
            contact_id: contact.id,
            status: 'open',
            unread_count: 1
          })
          .select()
          .single();

        if (createError) throw createError;
        conversationId = newConversation.id;
        console.log('Conversation created:', conversationId);
      }

      // Extrair corpo da mensagem
      let bodyText = '';
      if (message.conversation) {
        bodyText = message.conversation;
      } else if (message.extendedTextMessage?.text) {
        bodyText = message.extendedTextMessage.text;
      } else if (message.imageMessage?.caption) {
        bodyText = message.imageMessage.caption;
      } else if (message.audioMessage) {
        bodyText = '[Áudio]';
      } else if (message.videoMessage) {
        bodyText = '[Vídeo]';
      } else if (message.documentMessage) {
        bodyText = message.documentMessage.fileName || '[Documento]';
      }

      // Inserir mensagem com mídia
      const { error: messageError } = await supabaseClient
        .from('messages')
        .insert({
          conversation_id: conversationId,
          body: bodyText,
          direction: 'inbound',
          message_type: messageType,
          media_url: mediaUrl,
          evolution_id: key.id
        });

      if (messageError) throw messageError;

      console.log('Message inserted successfully');
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error('Error in evolution-webhook:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
