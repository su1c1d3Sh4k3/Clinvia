import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
    corsHeaders,
    createSupabaseClient,
    mapMessageType,
    base64ToUint8Array,
    getInstanceByName,
    downloadMediaFromUzapi,
    fetchChatDetails
} from "../_shared/utils.ts";

/**
 * webhook-handle-message
 * 
 * Processa mensagens inbound (recebidas) e outbound (enviadas):
 * - Cria/atualiza contatos ou grupos
 * - Cria/atualiza conversas
 * - Salva mensagens no banco
 * - Faz download de mídia
 * - Dispara transcrição de áudio
 * - Encaminha para webhook externo
 */
serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    console.log('[webhook-handle-message] Starting...');

    try {
        const payload = await req.json();
        const eventType = payload.EventType || payload.event || payload.type || 'messages';
        const instanceName = payload.instanceName;

        console.log('[webhook-handle-message] Event Type:', eventType);
        console.log('[webhook-handle-message] Instance:', instanceName);

        const supabase = createSupabaseClient();

        // 1. Fetch Instance
        const instance = await getInstanceByName(supabase, instanceName);
        if (!instance) {
            return new Response(
                JSON.stringify({ success: false, error: "Instance not found" }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const userId = instance.user_id;
        if (!userId) {
            console.error('[webhook-handle-message] Instance has no user_id!');
            return new Response(
                JSON.stringify({ success: false, error: "Instance has no user_id" }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 2. Check if it's a Group Message
        const isGroup = payload.message?.isGroup === true;
        let groupId: string | null = null;
        let contactId: string | null = null;
        let senderName: string | null = null;
        let senderJid: string | null = null;
        let senderProfilePicUrl: string | null = null;

        if (isGroup) {
            // ===== GROUP PROCESSING =====
            console.log('[webhook-handle-message] Processing Group Message...');
            const waChatId = payload.body?.chat?.wa_chatid || payload.message?.chatid;
            const groupName = payload.body?.chat?.name || payload.message?.groupName || "Grupo Desconhecido";

            if (!waChatId) {
                return new Response(
                    JSON.stringify({ success: false, error: "No chatid for group" }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Check/Create Group
            let { data: group } = await supabase
                .from('groups')
                .select('*')
                .eq('remote_jid', waChatId)
                .single();

            if (!group) {
                console.log('[webhook-handle-message] Creating group...');
                const { data: newGroup, error: createError } = await supabase
                    .from('groups')
                    .insert({
                        remote_jid: waChatId,
                        group_name: groupName,
                        instance_id: instance.id,
                        user_id: userId
                    })
                    .select()
                    .single();

                if (createError) {
                    console.error('[webhook-handle-message] Error creating group:', createError);
                } else {
                    group = newGroup;
                }
            } else {
                // Update missing fields
                const updates: any = {};
                if (!group.instance_id) updates.instance_id = instance.id;
                if (!group.user_id) updates.user_id = userId;
                if (Object.keys(updates).length > 0) {
                    await supabase.from('groups').update(updates).eq('id', group.id);
                }
            }

            groupId = group?.id;

            // Handle Group Member (Sender)
            const senderPn = payload.message?.sender_pn;
            const senderNameRaw = payload.message?.senderName || 'Membro Desconhecido';

            if (senderPn && group) {
                let { data: member } = await supabase
                    .from('group_members')
                    .select('*')
                    .eq('group_id', group.id)
                    .eq('number', senderPn)
                    .single();

                if (!member) {
                    const { data: newMember } = await supabase
                        .from('group_members')
                        .insert({
                            group_id: group.id,
                            push_name: senderNameRaw,
                            number: senderPn,
                            user_id: userId
                        })
                        .select()
                        .single();
                    member = newMember;
                }

                if (member) {
                    senderName = member.push_name || senderNameRaw;
                    senderJid = member.number;
                    senderProfilePicUrl = member.profile_pic_url;
                }
            }

        } else {
            // ===== INDIVIDUAL CONTACT PROCESSING =====
            // IMPORTANTE: O campo 'chat' está diretamente na raiz do payload, NÃO em body.chat
            console.log('[webhook-handle-message] Payload received:', JSON.stringify(payload, null, 2));

            // Extrair dados do chat da raiz do payload
            const chatData = payload.chat || {};

            // Número do contato (wa_chatid do chat ou chatid da message como fallback)
            const waNumber = chatData.wa_chatid || payload.message?.chatid;

            // ========== PUSH_NAME (Nome do contato) ==========
            // Prioridade:
            // 1. chat.name (nome do cliente no WhatsApp)
            // 2. chat.phone (número formatado como fallback)
            // 3. 'Desconhecido' (último recurso)
            const contactName = chatData.name || chatData.phone || 'Desconhecido';

            // ========== PROFILE_PIC_URL (Foto do perfil) ==========
            // Prioridade:
            // 1. chat.image (URL completa/alta qualidade)
            // 2. chat.imagePreview (URL de preview como fallback)
            // 3. null
            const profilePicUrl = chatData.image || chatData.imagePreview || null;

            if (!waNumber) {
                console.error('[webhook-handle-message] No waNumber found in payload');
                return new Response(
                    JSON.stringify({ success: false, error: "No wa_chatid" }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Buscar contato existente - FILTRAR POR INSTANCE_ID PRIMEIRO
            // Isso garante que cada instância tenha seus próprios contatos isolados
            let { data: contact } = await supabase
                .from('contacts')
                .select('*')
                .eq('instance_id', instance.id)  // FILTRO PRIMÁRIO - isolamento por instância
                .eq('user_id', userId)
                .eq('number', waNumber)
                .maybeSingle();

            if (contact) {
                // Contato existe - atualizar foto se mudou
                if (profilePicUrl && profilePicUrl !== contact.profile_pic_url) {
                    await supabase.from('contacts').update({ profile_pic_url: profilePicUrl }).eq('id', contact.id);
                }
                // Atualizar nome se mudou e não está vazio
                if (contactName && contactName !== 'Desconhecido' && contactName !== contact.push_name) {
                    await supabase.from('contacts').update({ push_name: contactName }).eq('id', contact.id);
                }
            } else {
                // Criar novo contato
                const { data: newContact, error: createError } = await supabase
                    .from('contacts')
                    .insert({
                        number: waNumber,
                        push_name: contactName,
                        profile_pic_url: profilePicUrl,
                        is_group: false,
                        instance_id: instance.id,
                        user_id: userId
                    })
                    .select()
                    .single();

                if (createError) {
                    console.error('[webhook-handle-message] Error creating contact:', createError);
                } else {
                    contact = newContact;
                }
            }

            contactId = contact?.id;

            if (contact) {
                senderName = contact.push_name;
                senderJid = contact.number;
                senderProfilePicUrl = contact.profile_pic_url;
            }
        }

        // 3. Conversation Logic
        if (contactId || groupId) {
            console.log('[webhook-handle-message] Processing Conversation...');

            const messageType = mapMessageType(payload.message?.messageType || 'conversation');
            const messageText = payload.message?.text || payload.message?.content?.text || payload.body?.message?.text || '';
            const fromMe = payload.message?.fromMe === true;
            const messageId = payload.message?.messageid || payload.message?.id || payload.body?.key?.id;

            // Find existing conversation
            let query = supabase
                .from('conversations')
                .select('*')
                .eq('instance_id', instance.id)
                .eq('user_id', userId)
                .in('status', ['pending', 'open'])
                .order('created_at', { ascending: false })
                .limit(1);

            if (groupId) {
                query = query.eq('group_id', groupId);
            } else if (contactId) {
                query = query.eq('contact_id', contactId);
            }

            const { data: conversations } = await query;

            let conversation;
            if (conversations && conversations.length > 0) {
                conversation = conversations[0];
                console.log('[webhook-handle-message] Found conversation:', conversation.id);

                await supabase
                    .from('conversations')
                    .update({
                        last_message: messageText || 'Mídia',
                        unread_count: (conversation.unread_count || 0) + 1,
                        updated_at: new Date().toISOString(),
                        last_message_at: new Date().toISOString()
                    })
                    .eq('id', conversation.id);
            } else {
                console.log('[webhook-handle-message] Creating conversation...');

                // Use INSERT with fallback - upsert doesn't work with partial indexes
                const { data: newConv, error: convError } = await supabase
                    .from('conversations')
                    .insert({
                        contact_id: contactId,
                        group_id: groupId,
                        instance_id: instance.id,
                        user_id: userId,
                        status: 'pending',
                        unread_count: 1,
                        queue_id: instance.default_queue_id,
                        last_message_at: new Date().toISOString()
                    })
                    .select()
                    .single();

                if (convError) {
                    console.error('[webhook-handle-message] Error creating conversation:', convError);
                    // If insert failed (likely duplicate), fetch existing conversation
                    let existingQuery = supabase
                        .from('conversations')
                        .select('*')
                        .eq('instance_id', instance.id)
                        .in('status', ['pending', 'open'])
                        .order('created_at', { ascending: false })
                        .limit(1);

                    if (contactId) {
                        existingQuery = existingQuery.eq('contact_id', contactId);
                    } else if (groupId) {
                        existingQuery = existingQuery.eq('group_id', groupId);
                    }

                    const { data: existingConvs } = await existingQuery;

                    if (existingConvs && existingConvs.length > 0) {
                        conversation = existingConvs[0];
                        console.log('[webhook-handle-message] Using existing conversation after conflict:', conversation.id);
                    }
                } else {
                    conversation = newConv;
                }
            }

            // 4. Save Message & Handle Media
            if (conversation) {
                let mediaUrl = null;

                // Download Media
                if (['image', 'audio', 'video', 'document'].includes(messageType) && messageId) {
                    console.log('[webhook-handle-message] Downloading media...');
                    mediaUrl = await downloadMediaFromUzapi(
                        instance.apikey,
                        messageId,
                        messageType,
                        supabase,
                        conversation.id
                    );
                    if (mediaUrl) {
                        console.log('[webhook-handle-message] Media uploaded:', mediaUrl);
                    }
                }

                // Extract Quote/Reply info
                const contextInfo = payload.message?.content?.contextInfo;
                let replyToId = null;
                let quotedBody = null;
                let quotedSender = null;

                if (contextInfo) {
                    replyToId = contextInfo.stanzaID || null;
                    quotedBody = contextInfo.quotedMessage?.conversation ||
                        contextInfo.quotedMessage?.extendedTextMessage?.text || null;
                    quotedSender = contextInfo.participant ?
                        (contextInfo.participant.includes('@lid') ? 'Atendente' : 'Cliente') : null;
                }

                // Save Message
                const { data: savedMessage, error: msgError } = await supabase
                    .from('messages')
                    .insert({
                        conversation_id: conversation.id,
                        body: messageText,
                        direction: fromMe ? 'outbound' : 'inbound',
                        message_type: messageType,
                        evolution_id: messageId,
                        user_id: userId,
                        sender_name: senderName,
                        sender_jid: senderJid,
                        sender_profile_pic_url: senderProfilePicUrl,
                        media_url: mediaUrl,
                        reply_to_id: replyToId,
                        quoted_body: quotedBody,
                        quoted_sender: quotedSender
                    })
                    .select()
                    .single();

                if (msgError) {
                    console.error('[webhook-handle-message] Error saving message:', msgError);
                } else {
                    console.log('[webhook-handle-message] Message saved:', savedMessage.id);

                    // Trigger Audio Transcription
                    if (messageType === 'audio' && mediaUrl && savedMessage) {
                        console.log('[webhook-handle-message] Triggering transcription...');
                        supabase.functions.invoke('transcribe-audio', {
                            body: { messageId: savedMessage.id, mediaUrl: mediaUrl }
                        }).catch(err => console.error('[webhook-handle-message] Transcription error:', err));
                    }

                    // AI Satisfaction Analysis (every 20 messages)
                    const { count } = await supabase
                        .from('messages')
                        .select('*', { count: 'exact', head: true })
                        .eq('conversation_id', conversation.id);

                    if (count && count > 0 && count % 20 === 0) {
                        console.log('[webhook-handle-message] Triggering AI analysis...');
                        supabase.functions.invoke('ai-analyze-conversation', {
                            body: { conversationId: conversation.id }
                        }).catch(err => console.error('[webhook-handle-message] AI analysis error:', err));
                    }

                    // Auto Follow Up Reset
                    if (!fromMe && conversation.id) {
                        const { data: followUp } = await supabase
                            .from('conversation_follow_ups')
                            .select('id, category_id, auto_send')
                            .eq('conversation_id', conversation.id)
                            .single();

                        if (followUp?.auto_send) {
                            const { data: templates } = await supabase
                                .from('follow_up_templates')
                                .select('time_minutes')
                                .eq('category_id', followUp.category_id)
                                .order('time_minutes', { ascending: true })
                                .limit(1);

                            if (templates?.length > 0) {
                                const nextSendAt = new Date(Date.now() + templates[0].time_minutes * 60 * 1000);
                                await supabase
                                    .from('conversation_follow_ups')
                                    .update({
                                        current_template_index: 0,
                                        next_send_at: nextSendAt.toISOString(),
                                        completed: false
                                    })
                                    .eq('id', followUp.id);
                            }
                        }
                    }
                }
            }
        }

        // 5. Forward to External Webhook
        if (instance.webhook_url && eventType === 'messages') {
            console.log('[webhook-handle-message] Forwarding to external webhook...');
            try {
                await fetch(instance.webhook_url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Supabase-Webhook-Proxy/1.0'
                    },
                    body: JSON.stringify(payload)
                });
                console.log('[webhook-handle-message] Forwarded successfully');
            } catch (forwardError) {
                console.error('[webhook-handle-message] Forward error:', forwardError);
            }
        }

        return new Response(
            JSON.stringify({ success: true, message: "Processed" }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (error: any) {
        console.error('[webhook-handle-message] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
    }
});
