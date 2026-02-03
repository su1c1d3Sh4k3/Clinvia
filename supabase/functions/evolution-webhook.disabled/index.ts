import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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

      if (!key) {
        console.error('Message key is missing:', messageData);
        return new Response(JSON.stringify({ error: 'Message key missing' }), { status: 400 });
      }

      // Initial pushName from payload (usually sender's name)
      let payloadPushName = messageData.pushName || 'Unknown';

      // Extrair remote_jid
      const remoteJid = key.remoteJid;
      const fromMe = key.fromMe;

      // Determine if it is a group based on payload or JID
      const participant = messageData.key?.participant || messageData.participant || payload.data?.participant;
      const isGroupJid = remoteJid.endsWith('@g.us') || remoteJid.includes('-');
      const isGroupPayload = payload.data?.isGroup === true || messageData.isGroup === true;

      const isGroup = !!participant || isGroupJid || isGroupPayload;

      console.log('Group Detection:', {
        remoteJid,
        participant,
        isGroupJid,
        isGroupPayload,
        finalIsGroup: isGroup
      });

      // Log message keys to debug structure
      console.log('Message Keys:', Object.keys(message));
      if (message.audioMessage) console.log('Audio Message Keys:', Object.keys(message.audioMessage));
      if (message.imageMessage) console.log('Image Message Keys:', Object.keys(message.imageMessage));

      // Ignorar mensagens enviadas por nós APENAS para automação, mas salvar no banco
      if (fromMe) {
        console.log('Message from self. Will save to DB but skip AI/Automation.');
      }

      console.log('Message from:', remoteJid, 'Name:', payloadPushName, 'Is Group:', isGroup);

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

      // Extrair URL de mídia (Default)
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

      // HANDLE BASE64 MEDIA UPLOAD
      const base64Content = message.base64 ||
        message.audioMessage?.base64 ||
        message.imageMessage?.base64 ||
        message.videoMessage?.base64 ||
        message.documentMessage?.base64;

      if (base64Content) {
        console.log("Base64 content detected. Length:", base64Content.length);
        try {
          // Sanitize Base64 (remove data URI prefix if present)
          const cleanBase64 = base64Content.replace(/^data:.*,/, '');
          const binary = decode(cleanBase64);

          // Determine MimeType
          const mimetype = message.audioMessage?.mimetype ||
            message.imageMessage?.mimetype ||
            message.videoMessage?.mimetype ||
            message.documentMessage?.mimetype ||
            (message.audioMessage ? 'audio/ogg' : 'application/octet-stream');

          console.log("Detected MimeType:", mimetype);

          // Determine Extension from MimeType
          let fileExt = 'bin';
          if (mimetype.includes('audio/ogg')) fileExt = 'ogg';
          else if (mimetype.includes('audio/mp4') || mimetype.includes('audio/mp3') || mimetype.includes('audio/mpeg')) fileExt = 'mp3';
          else if (mimetype.includes('image/jpeg')) fileExt = 'jpg';
          else if (mimetype.includes('image/png')) fileExt = 'png';
          else if (mimetype.includes('image/webp')) fileExt = 'webp';
          else if (mimetype.includes('video/mp4')) fileExt = 'mp4';
          else if (message.audioMessage) fileExt = 'ogg'; // Fallback
          else if (message.imageMessage) fileExt = 'jpg';
          else if (message.videoMessage) fileExt = 'mp4';

          const fileName = `${crypto.randomUUID()}.${fileExt}`;
          const filePath = `${fileName}`;

          console.log(`Uploading file: ${filePath} with Content-Type: ${mimetype}`);

          const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from('media')
            .upload(filePath, binary, {
              contentType: mimetype,
              upsert: false
            });

          if (uploadError) {
            console.error("Error uploading to storage:", uploadError);
          } else {
            const { data: publicUrlData } = supabaseClient.storage
              .from('media')
              .getPublicUrl(filePath);

            if (publicUrlData.publicUrl) {
              mediaUrl = publicUrlData.publicUrl;
              console.log("Media uploaded successfully. New Public URL:", mediaUrl);
            }
          }
        } catch (err) {
          console.error("Error processing base64:", err);
        }
      } else {
        console.log("No Base64 content found in message payload.");
      }

      let contactId = null;
      let groupId = null;
      let groupMemberId = null;
      let senderName = payloadPushName;
      let senderProfilePicUrl = null;

      if (isGroup) {
        // --- GROUP LOGIC ---
        console.log('Processing Group Message (New Architecture)...');
        let groupName = null;
        let groupPicUrl = null;

        // 1. Fetch Group Info
        try {
          const groupInfoResponse = await fetch(
            `${instance.server_url}/group/findGroupInfos/${instanceName}?groupJid=${remoteJid}`,
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'apikey': instance.apikey,
              }
            }
          );

          if (groupInfoResponse.ok) {
            const groupData = await groupInfoResponse.json();
            if (groupData) {
              groupName = groupData.subject;
              groupPicUrl = groupData.pictureUrl || null;
              console.log('Group Info Fetched:', { subject: groupName, pictureUrl: groupPicUrl });
            }
          }
        } catch (err) {
          console.error('Error fetching group info:', err);
        }

        // 2. Upsert Group
        const { data: group, error: groupError } = await supabaseClient
          .from('groups')
          .upsert({
            remote_jid: remoteJid,
            group_name: groupName || 'Grupo sem Nome', // Fallback
            group_pic_url: groupPicUrl,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'remote_jid',
            ignoreDuplicates: false
          })
          .select()
          .single();

        if (groupError) {
          console.error('Error upserting group:', groupError);
          throw groupError;
        }
        groupId = group.id;
        console.log('Group upserted:', groupId);

        // 3. Fetch Member Info (Sender)
        const senderJid = participant || key.participant || messageData.participant;
        if (senderJid) {
          let memberPushName = payloadPushName;
          let memberPicUrl = null;

          try {
            const senderPicResponse = await fetch(
              `${instance.server_url}/chat/fetchProfilePictureUrl/${instanceName}`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                  'apikey': instance.apikey,
                },
                body: JSON.stringify({ number: senderJid }),
              }
            );

            if (senderPicResponse.ok) {
              const senderPicData = await senderPicResponse.json();
              memberPicUrl = senderPicData.profilePictureUrl || null;
            }
          } catch (err) {
            console.error('Error fetching sender profile pic:', err);
          }

          senderName = memberPushName;
          senderProfilePicUrl = memberPicUrl;

          // 4. Upsert Group Member
          const { data: member, error: memberError } = await supabaseClient
            .from('group_members')
            .upsert({
              group_id: groupId,
              remote_jid: senderJid,
              push_name: memberPushName,
              profile_pic_url: memberPicUrl,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'group_id,remote_jid',
              ignoreDuplicates: false
            })
            .select()
            .single();

          if (memberError) {
            console.error('Error upserting group member:', memberError);
          } else {
            groupMemberId = member.id;
          }
        }
      } else {
        // --- INDIVIDUAL CONTACT LOGIC ---
        console.log('Processing Individual Message...');

        // Fetch Contact Profile Picture
        let contactProfilePicUrl = null;
        try {
          const contactPicResponse = await fetch(
            `${instance.server_url}/chat/fetchProfilePictureUrl/${instanceName}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'apikey': instance.apikey,
              },
              body: JSON.stringify({ number: remoteJid }),
            }
          );

          if (contactPicResponse.ok) {
            const contactPicData = await contactPicResponse.json();
            contactProfilePicUrl = contactPicData.profilePictureUrl || null;
          }
        } catch (err) {
          console.error('Error fetching contact profile pic:', err);
        }

        const { data: contact, error: contactError } = await supabaseClient
          .from('contacts')
          .upsert({
            remote_jid: remoteJid,
            push_name: payloadPushName,
            profile_pic_url: contactProfilePicUrl,
            instance_id: instance.id
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
        contactId = contact.id;
        senderProfilePicUrl = contactProfilePicUrl;
      }

      // Upsert Conversation
      // Find or Create Conversation
      let conversation;

      if (isGroup) {
        // For groups, find any existing conversation
        const { data: existingGroupConv } = await supabaseClient
          .from('conversations')
          .select('*')
          .eq('group_id', groupId)
          .maybeSingle();

        conversation = existingGroupConv;
      } else {
        // For contacts, find the latest open or pending conversation
        const { data: existingContactConv } = await supabaseClient
          .from('conversations')
          .select('*')
          .eq('contact_id', contactId)
          .in('status', ['open', 'pending'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        conversation = existingContactConv;
      }

      if (conversation) {
        // Update existing conversation
        const { data: updatedConv, error: updateError } = await supabaseClient
          .from('conversations')
          .update({
            last_message: message.conversation || message.extendedTextMessage?.text || 'Mídia',
            last_message_at: new Date().toISOString(),
            unread_count: (conversation.unread_count || 0) + 1
          })
          .eq('id', conversation.id)
          .select()
          .single();

        if (updateError) {
          console.error('Error updating conversation:', updateError);
          throw updateError;
        }
        conversation = updatedConv;
      } else {
        // Create new conversation
        const { data: newConv, error: insertError } = await supabaseClient
          .from('conversations')
          .insert({
            contact_id: contactId,
            group_id: groupId,
            instance_id: instance.id,
            last_message: message.conversation || message.extendedTextMessage?.text || 'Mídia',
            last_message_at: new Date().toISOString(),
            unread_count: 1,
            status: 'pending'
          })
          .select()
          .single();

        if (insertError) {
          console.error('Error inserting conversation:', insertError);
          throw insertError;
        }
        conversation = newConv;
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
        bodyText = 'Áudio do cliente';
      } else if (message.videoMessage) {
        bodyText = '[Vídeo]';
      } else if (message.documentMessage) {
        bodyText = message.documentMessage.fileName || '[Documento]';
      }

      // Inserir mensagem com informações do remetente
      const { error: messageError } = await supabaseClient
        .from('messages')
        .upsert({
          conversation_id: conversation.id,
          body: bodyText,
          media_url: mediaUrl,
          message_type: messageType,
          direction: fromMe ? 'outbound' : 'inbound',
          status: 'delivered',
          evolution_id: key.id,
          sender_name: senderName,
          sender_jid: isGroup ? (participant || key.participant || messageData.participant) : remoteJid,
          sender_profile_pic_url: senderProfilePicUrl
        }, {
          onConflict: 'evolution_id',
          ignoreDuplicates: false
        });

      if (messageError) {
        console.error('Error upserting message:', messageError);
        throw messageError;
      }

      console.log('Message processed successfully');

      // Trigger AI analysis asynchronously (ONLY for inbound messages OR every 20 messages)
      // Updated Logic: Trigger based on total message count (inbound + outbound)
      try {
        const { count, error: countError } = await supabaseClient
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conversation.id);

        if (!countError && count !== null) {
          console.log(`[EVOLUTION WEBHOOK] Total messages for conversation ${conversation.id}: ${count}`);

          // Trigger every 20 messages (20, 40, 60...)
          if (count > 0 && count % 20 === 0) {
            console.log('[EVOLUTION WEBHOOK] Triggering AI Satisfaction Analysis (Count % 20 === 0)...');
            supabaseClient.functions.invoke('ai-analyze-conversation', {
              body: { conversationId: conversation.id }
            }).catch((err: any) => {
              console.error('[EVOLUTION WEBHOOK] Failed to trigger AI analysis:', err);
            });
          }
        } else {
          console.error('[EVOLUTION WEBHOOK] Error counting messages:', countError);
        }
      } catch (countErr) {
        console.error('[EVOLUTION WEBHOOK] Exception checking message count:', countErr);
      }

      // Trigger Audio Transcription if applicable
      if (messageType === 'audio' && mediaUrl) {
        console.log('Triggering audio transcription...');
        supabaseClient.functions.invoke('transcribe-audio', {
          body: {
            messageId: (await supabaseClient.from('messages').select('id').eq('conversation_id', conversation.id).order('created_at', { ascending: false }).limit(1).single()).data?.id,
            mediaUrl
          }
        }).catch((err: any) => {
          console.error('Failed to trigger audio transcription:', err);
        });
      }
    }
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
