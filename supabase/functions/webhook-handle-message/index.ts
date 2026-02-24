import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
    corsHeaders,
    createSupabaseClient,
    mapMessageType,
    base64ToUint8Array,
    getInstanceByName,
    downloadMediaFromUzapi,
    fetchChatDetails,
    validateWebhookHMAC,
    checkRateLimit,
    validateWebhookPayload
} from "../_shared/utils.ts";
import { makeOpenAIRequest, trackTokenUsage } from "../_shared/token-tracker.ts";

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

    try {
        // 🛡️ RATE LIMITING — máximo 120 req/min por IP
        const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
            req.headers.get('cf-connecting-ip') || 'unknown';
        if (!checkRateLimit(`whm:${clientIP}`, 120, 60000)) {
            console.warn(`[webhook-handle-message] Rate limited IP: ${clientIP}`);
            return new Response(
                JSON.stringify({ success: false, error: 'Too many requests' }),
                { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 🔐 HMAC VALIDATION — verifica assinatura se secret configurado
        const rawBody = await req.text();
        const webhookSecret = Deno.env.get('WEBHOOK_HMAC_SECRET');
        if (webhookSecret) {
            const signature = req.headers.get('x-webhook-signature') ||
                req.headers.get('x-hub-signature-256');
            const isValid = await validateWebhookHMAC(rawBody, signature, webhookSecret);
            if (!isValid) {
                console.warn(`[webhook-handle-message] Invalid HMAC signature from IP: ${clientIP}`);
                return new Response(
                    JSON.stringify({ success: false, error: 'Invalid webhook signature' }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        const payload = JSON.parse(rawBody);

        // ✅ INPUT VALIDATION
        const validationError = validateWebhookPayload(payload);
        if (validationError) {
            console.warn(`[webhook-handle-message] Payload validation failed: ${validationError}`);
            return new Response(
                JSON.stringify({ success: false, error: validationError }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const eventType = payload.EventType || payload.event || payload.type || 'messages';
        const instanceName = payload.instanceName;

        console.log('[webhook-handle-message] Received:', instanceName, eventType);

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
        let isNewContactForAutoDeal = false; // Flag para auto-create deal
        let conversation: any = null; // Declare in outer scope for webhook forwarding

        if (isGroup) {
            // ===== GROUP PROCESSING =====

            // Extract Group Data from Payload
            // Priority: chat.wa_name (User requested) > chat.name > message.groupName
            const chatData = payload.chat || payload.body?.chat || {};
            const waChatId = chatData.wa_chatid || payload.message?.chatid;
            const groupName = chatData.wa_name || chatData.name || payload.message?.groupName || "Grupo Desconhecido";
            // Support both imagePreview and image fields
            const groupImagePreview = chatData.imagePreview || chatData.image;

            if (!waChatId) {
                return new Response(
                    JSON.stringify({ success: false, error: "No chatid for group" }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Check/Create or Update Group
            let { data: group } = await supabase
                .from('groups')
                .select('*')
                .eq('remote_jid', waChatId)
                .single();

            if (!group) {
                console.log('[webhook-handle-message] Creating NEW group:', groupName);
                const { data: newGroup, error: createError } = await supabase
                    .from('groups')
                    .insert({
                        remote_jid: waChatId,
                        group_name: groupName,
                        instance_id: instance.id,
                        user_id: userId,
                    })
                    .select()
                    .single();

                if (createError) {
                    console.error('[webhook-handle-message] Error creating group:', createError);
                } else {
                    group = newGroup;
                }
            } else {
                // Group Exists - ALWAYS UPDATE Name and references as requested
                const updates: any = {};

                // Update Name if changed
                if (group.group_name !== groupName) {
                    updates.group_name = groupName;
                }

                // Update instance/user if missing
                if (!group.instance_id) updates.instance_id = instance.id;
                if (!group.user_id) updates.user_id = userId;

                if (Object.keys(updates).length > 0) {
                    await supabase.from('groups').update(updates).eq('id', group.id);
                }
            }

            groupId = group?.id;

            // Handle Group Image Update (ALWAYS CHECK if provided)
            if (group && groupImagePreview && groupImagePreview.startsWith('http')) {
                try {
                    const imageResponse = await fetch(groupImagePreview);
                    if (imageResponse.ok) {
                        const imageBlob = await imageResponse.blob();
                        const fileName = `group_${group.id}.jpg`;

                        const { error: uploadError } = await supabase.storage
                            .from('avatars')
                            .upload(fileName, imageBlob, { contentType: 'image/jpeg', upsert: true });

                        if (!uploadError) {
                            const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
                            const publicUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

                            await supabase.from('groups')
                                .update({ group_pic_url: publicUrl })
                                .eq('id', group.id);

                            console.log('[webhook-handle-message] Group image updated:', publicUrl);
                        } else {
                            console.error('[webhook-handle-message] Error uploading group image:', uploadError);
                        }
                    } else {
                        console.error('[webhook-handle-message] Failed to download group image:', groupImagePreview);
                    }
                } catch (imgErr) {
                    console.error('[webhook-handle-message] Exception processing group image:', imgErr);
                }
            }


            // Handle Group Member (Sender)
            const senderPn = payload.message?.sender_pn ||
                payload.message?.participant?.split('@')[0] ||
                payload.key?.participant?.split('@')[0] ||
                payload.participant?.split('@')[0] ||
                (payload.message?.fromMe ? instance?.phone : null); // Fallback for own messages

            const senderNameRaw = payload.message?.senderName ||
                payload.pushName ||
                payload.message?.pushName ||
                'Membro Desconhecido';

            const senderProfilePic = payload.message?.senderProfilePic ||
                payload.sender?.profilePicUrl ||
                payload.sender?.image ||
                null;

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
                            user_id: userId,
                            profile_pic_url: senderProfilePic,
                            lid: payload.message?.sender_lid || payload.sender_lid || null
                        })
                        .select()
                        .single();
                    member = newMember;
                } else {
                    // UPDATE EXISTING MEMBER if name or picture changed
                    const currentPic = member.profile_pic_url;
                    const newPic = senderProfilePic;

                    const updates: any = {};
                    if (senderNameRaw && senderNameRaw !== 'Membro Desconhecido' && member.push_name !== senderNameRaw) {
                        updates.push_name = senderNameRaw;
                    }
                    if (newPic && newPic !== currentPic) {
                        updates.profile_pic_url = newPic;
                    }

                    const newLid = payload.message?.sender_lid || payload.sender_lid;
                    if (newLid && member.lid !== newLid) {
                        updates.lid = newLid;
                    }

                    if (Object.keys(updates).length > 0) {
                        await supabase
                            .from('group_members')
                            .update(updates)
                            .eq('id', member.id);

                        // Update local object for this execution
                        if (updates.push_name) member.push_name = updates.push_name;
                        if (updates.profile_pic_url) member.profile_pic_url = updates.profile_pic_url;
                    }
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

            // Extrair dados do chat da raiz do payload
            const chatData = payload.chat || {};

            // Número do contato (wa_chatid do chat ou chatid da message como fallback)
            const waNumber = chatData.wa_chatid || payload.message?.chatid;

            // ========== PUSH_NAME (Nome do contato) ==========
            const contactName = chatData.wa_name || chatData.name || chatData.phone;

            // ========== PROFILE_PIC_URL (Foto do perfil) ==========
            const profilePicUrl = chatData.imagePreview || null;

            if (!waNumber) {
                console.error('[webhook-handle-message] No waNumber found in payload');
                return new Response(
                    JSON.stringify({ success: false, error: "No wa_chatid" }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Buscar contato existente - FILTRAR POR USER_ID
            let { data: contact } = await supabase
                .from('contacts')
                .select('*')
                .eq('user_id', userId)
                .eq('number', waNumber)
                .maybeSingle();

            if (contact) {
                // Contato existe - atualizar foto se mudou (sempre permitido)
                if (profilePicUrl && profilePicUrl !== contact.profile_pic_url) {
                    const { error: photoError } = await supabase
                        .from('contacts')
                        .update({ profile_pic_url: profilePicUrl })
                        .eq('id', contact.id);

                    if (photoError) {
                        console.error('[webhook-handle-message] Error updating profile picture:', photoError);
                    }
                }

                // Atualizar nome APENAS se não foi editado manualmente e não é grupo
                if (!contact.edited && !contact.is_group && contactName && contactName !== 'Desconhecido' && contactName !== contact.push_name) {
                    const hasLetters = /[a-zA-Z]/.test(contactName);
                    const { error: nameError } = await supabase.from('contacts').update({
                        push_name: contactName,
                        edited: hasLetters
                    }).eq('id', contact.id);

                    if (nameError) {
                        console.error('[webhook-handle-message] Error updating contact name:', nameError);
                    }
                }
            } else {
                // Criar novo contato
                const hasLetters = /[a-zA-Z]/.test(contactName || '');
                isNewContactForAutoDeal = true;

                const { data: newContact, error: createError } = await supabase
                    .from('contacts')
                    .insert({
                        number: waNumber,
                        push_name: contactName,
                        profile_pic_url: profilePicUrl,
                        is_group: false,
                        instance_id: instance.id,
                        user_id: userId,
                        edited: hasLetters
                    })
                    .select()
                    .single();

                if (createError) {
                    console.error('[webhook-handle-message] Error creating contact:', createError);

                    // FIX: Handle duplicate key error (23505) - fetch existing contact
                    if (createError.code === '23505') {
                        const { data: existingContact } = await supabase
                            .from('contacts')
                            .select('*')
                            .eq('user_id', userId)
                            .eq('number', waNumber)
                            .single();

                        if (existingContact) {
                            contact = existingContact;
                        }
                    }
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
            const messageType = mapMessageType(payload.message?.messageType || 'conversation');
            const messageText = payload.message?.text || payload.message?.content?.text || payload.body?.message?.text || '';

            // ========================================
            // EXTRACT REACTION DATA (if reactionMessage)
            // ========================================
            const reactionEmoji = messageType === 'reaction'
                ? (payload.message?.text || payload.message?.content?.text || '')
                : '';
            const reactionTargetId = messageType === 'reaction'
                ? (payload.message?.reaction ||
                    payload.message?.content?.key?.ID ||
                    payload.message?.content?.key?.id ||
                    null)
                : null;

            // ========================================
            // EXTRACT FILE METADATA FOR MEDIA MESSAGES
            // ========================================
            let mediaFilename: string | null = null;
            let mediaMimetype: string | null = null;

            if (['document', 'image', 'video', 'audio', 'sticker'].includes(messageType)) {
                const content = payload.message?.content || {};

                mediaFilename =
                    content.fileName ||
                    content.filename ||
                    payload.message?.fileName ||
                    payload.documentMessage?.fileName ||
                    null;

                mediaMimetype =
                    content.mimetype ||
                    content.mimeType ||
                    payload.message?.mimetype ||
                    payload.documentMessage?.mimetype ||
                    null;
            }

            const fromMe =
                payload.message?.fromMe === true ||
                payload.fromMe === true;
            const messageId = payload.message?.messageid || payload.message?.id || payload.body?.key?.id;

            // Extract vote field (UzAPI sends button response text here)
            const voteText = payload.message?.vote || '';

            // Extract button response display text
            const selectedDisplayText = payload.message?.selectedDisplayText ||
                payload.message?.buttonsResponseMessage?.selectedDisplayText ||
                payload.message?.content?.buttonsResponseMessage?.selectedDisplayText ||
                payload.message?.content?.contextInfo?.selectedDisplayText ||
                payload.body?.buttonsResponseMessage?.selectedDisplayText ||
                '';

            // Extract NPS button ID from content (nps_1 to nps_5)
            const npsButtonId = payload.message?.content?.selectedID ||
                payload.message?.content?.buttonOrListid ||
                '';

            // Use vote or selectedDisplayText as message body for button responses
            // For reactions, use the emoji directly
            const effectiveMessageBody = messageType === 'reaction'
                ? reactionEmoji
                : (voteText || selectedDisplayText || messageText);

            // Find existing conversation in CURRENT instance
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

            let { data: conversations } = await query;

            // FIX #4: Check for ORPHANED conversations (instance was deleted -> instance_id = NULL)
            if (!conversations || conversations.length === 0) {
                let orphanQuery = supabase
                    .from('conversations')
                    .select('*')
                    .is('instance_id', null)
                    .eq('user_id', userId)
                    .in('status', ['pending', 'open'])
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (groupId) {
                    orphanQuery = orphanQuery.eq('group_id', groupId);
                } else if (contactId) {
                    orphanQuery = orphanQuery.eq('contact_id', contactId);
                }

                const { data: orphanedConvs } = await orphanQuery;

                if (orphanedConvs && orphanedConvs.length > 0) {
                    const { error: migrateError } = await supabase
                        .from('conversations')
                        .update({ instance_id: instance.id })
                        .eq('id', orphanedConvs[0].id);

                    if (migrateError) {
                        console.error('[webhook-handle-message] Error migrating orphaned conversation:', migrateError);
                    } else {
                        conversations = [{ ...orphanedConvs[0], instance_id: instance.id }];
                    }
                }
            }

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
                    }
                } else {
                    conversation = newConv;
                    console.log('[webhook-handle-message] Conversation created:', conversation.id);
                }
            }

            // 4. Save Message & Handle Media
            if (conversation) {
                let mediaUrl = null;

                // Download Media
                if (['image', 'audio', 'video', 'document', 'sticker'].includes(messageType) && messageId) {
                    mediaUrl = await downloadMediaFromUzapi(
                        instance.apikey,
                        messageId,
                        messageType,
                        supabase,
                        conversation.id,
                        mediaFilename || undefined
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

                if (messageType === 'reaction') {
                    replyToId = reactionTargetId;
                } else if (contextInfo) {
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
                        body: effectiveMessageBody,
                        direction: fromMe ? 'outbound' : 'inbound',
                        message_type: messageType,
                        evolution_id: messageId,
                        user_id: userId,
                        sender_name: senderName,
                        sender_jid: senderJid,
                        sender_profile_pic_url: senderProfilePicUrl,
                        media_url: mediaUrl,
                        media_filename: mediaFilename,
                        media_mimetype: mediaMimetype,
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

                    // ========================================
                    // CRIAÇÃO AUTOMÁTICA DE NEGOCIAÇÃO (DEAL)
                    // ========================================
                    if (isNewContactForAutoDeal && !fromMe && contactId && instance.auto_create_deal_funnel_id) {
                        const hasValidName = /[a-zA-Z]/.test(senderName || '');
                        if (hasValidName && senderProfilePicUrl) {
                            try {
                                const { data: stages } = await supabase
                                    .from('crm_stages')
                                    .select('id')
                                    .eq('funnel_id', instance.auto_create_deal_funnel_id)
                                    .order('position', { ascending: true })
                                    .limit(1);

                                if (stages && stages.length > 0) {
                                    const { error: dealError } = await supabase
                                        .from('crm_deals')
                                        .insert({
                                            title: senderName || 'Novo Cliente',
                                            description: 'Criado automaticamente pelo sistema',
                                            contact_id: contactId,
                                            stage_id: stages[0].id,
                                            user_id: userId,
                                            status: 'active'
                                        });

                                    if (dealError) {
                                        console.error('[webhook-handle-message] Error auto-creating deal:', dealError);
                                    }
                                }
                            } catch (err) {
                                console.error('[webhook-handle-message] Exception auto-creating deal:', err);
                            }
                        }
                    }

                    // ========================================
                    // NPS RESPONSE DETECTION WITH AI FEEDBACK
                    // ========================================
                    const isNpsResponse = (npsButtonId && npsButtonId.startsWith('nps_')) ||
                        (voteText && (voteText.includes('Excelente') || voteText.includes('Muito Bom') ||
                            voteText.includes('Bom') || voteText.includes('Regular') || voteText.includes('Ruim')));

                    if (isNpsResponse && contactId && !fromMe) {
                        let notaText = '';
                        if (voteText) {
                            if (voteText.includes('Excelente')) notaText = 'Excelente';
                            else if (voteText.includes('Muito Bom')) notaText = 'Muito Bom';
                            else if (voteText.includes('Bom')) notaText = 'Bom';
                            else if (voteText.includes('Regular')) notaText = 'Regular';
                            else if (voteText.includes('Ruim')) notaText = 'Ruim';
                            else notaText = voteText.trim();
                        } else if (npsButtonId) {
                            const npsIdToText: Record<string, string> = {
                                'nps_5': 'Excelente',
                                'nps_4': 'Muito Bom',
                                'nps_3': 'Bom',
                                'nps_2': 'Regular',
                                'nps_1': 'Ruim'
                            };
                            notaText = npsIdToText[npsButtonId] || npsButtonId;
                        }

                        let feedback = '';
                        try {
                            const { data: recentMsgs } = await supabase
                                .from('messages')
                                .select('body, direction, created_at')
                                .eq('conversation_id', conversation.id)
                                .order('created_at', { ascending: false })
                                .limit(10);

                            if (recentMsgs && recentMsgs.length > 0) {
                                const conversationText = recentMsgs.reverse().map((m: any) =>
                                    `${m.direction === 'inbound' ? 'Cliente' : 'Agente'}: ${m.body || '[mídia]'}`
                                ).join('\n');

                                const feedbackPrompt = `Analise esta conversa e gere um breve feedback do cliente (1-2 frases):

Conversa:
${conversationText}

O cliente avaliou o atendimento como "${notaText}".
Gere um resumo MUITO breve focado na experiência e satisfação do cliente.
Responda APENAS com o texto do feedback, sem formatação JSON ou markdown.`;

                                const { response } = await makeOpenAIRequest(supabase, userId, {
                                    endpoint: 'https://api.openai.com/v1/chat/completions',
                                    body: {
                                        model: 'gpt-4o-mini',
                                        messages: [
                                            { role: 'system', content: 'Você é um analista de feedback de clientes. Seja conciso.' },
                                            { role: 'user', content: feedbackPrompt }
                                        ],
                                        temperature: 0.7,
                                        max_tokens: 150
                                    }
                                });

                                if (response.ok) {
                                    const aiData = await response.json();
                                    feedback = aiData.choices?.[0]?.message?.content?.trim() || '';

                                    if (aiData.usage && userId) {
                                        await trackTokenUsage(supabase, {
                                            ownerId: userId,
                                            teamMemberId: null,
                                            functionName: 'webhook-nps-feedback',
                                            model: 'gpt-4o-mini',
                                            usage: aiData.usage
                                        });
                                    }
                                } else {
                                    console.error('[webhook-handle-message] AI feedback error:', await response.text());
                                    const clientMsgs = recentMsgs.filter((m: any) => m.direction === 'inbound').length;
                                    const agentMsgs = recentMsgs.filter((m: any) => m.direction === 'outbound').length;
                                    feedback = `Conversa com ${clientMsgs} mensagens do cliente e ${agentMsgs} do atendente.`;
                                }
                            }
                        } catch (feedbackError) {
                            console.error('[webhook-handle-message] Error generating AI feedback:', feedbackError);
                        }

                        const { error: npsError } = await supabase.rpc('add_nps_entry', {
                            p_contact_id: contactId,
                            p_nota: notaText,
                            p_feedback: feedback
                        });

                        if (npsError) {
                            console.error('[webhook-handle-message] Error saving NPS:', npsError);
                        }
                    }

                    // ========================================
                    // PUSH NOTIFICATION FOR INBOUND MESSAGES
                    // ========================================
                    if (!fromMe && savedMessage) {
                        const { data: allTeamMembers } = await supabase
                            .from('team_members')
                            .select('id, auth_user_id, role, queue_ids, notifications_enabled, group_notifications_enabled')
                            .eq('user_id', userId)
                            .not('auth_user_id', 'is', null);

                        let teamMembersToNotify: any[] = [];

                        for (const tm of allTeamMembers || []) {
                            const role = tm.role as string;

                            if (isGroup) {
                                if (tm.group_notifications_enabled !== true) continue;
                            } else {
                                if (tm.notifications_enabled !== true) continue;
                            }

                            if (role === 'admin' || role === 'supervisor') {
                                teamMembersToNotify.push(tm);
                                continue;
                            }

                            if (role === 'agent') {
                                const agentQueues = tm.queue_ids || [];
                                const hasQueues = agentQueues.length > 0;

                                if (conversation.assigned_agent_id && conversation.assigned_agent_id === tm.id) {
                                    teamMembersToNotify.push(tm);
                                } else if (conversation.queue_id && hasQueues && agentQueues.includes(conversation.queue_id)) {
                                    teamMembersToNotify.push(tm);
                                } else if (!hasQueues && !conversation.assigned_agent_id) {
                                    teamMembersToNotify.push(tm);
                                }
                            }
                        }

                        const notificationTitle = isGroup
                            ? (payload.body?.chat?.name || senderName || 'Grupo')
                            : (senderName || payload.body?.from?.name || payload.message?.pushName || 'Cliente');

                        const notificationIcon = senderProfilePicUrl || undefined;

                        const messagePreview = (messageText || messageType || '').substring(0, 50) +
                            ((messageText?.length || 0) > 50 ? '...' : '');

                        const supabaseUrl = Deno.env.get('SUPABASE_URL');
                        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

                        for (const tm of teamMembersToNotify) {
                            if (tm.auth_user_id && supabaseUrl && serviceKey) {
                                fetch(`${supabaseUrl}/functions/v1/send-push`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${serviceKey}`
                                    },
                                    body: JSON.stringify({
                                        auth_user_id: tm.auth_user_id,
                                        title: notificationTitle,
                                        body: messagePreview,
                                        icon: notificationIcon,
                                        notification_type: 'messages',
                                        url: `/?conversationId=${conversation.id}`,
                                        tag: `message-${conversation.id}`
                                    })
                                }).catch(err => console.error('[webhook-handle-message] Push fetch error:', err));
                            }
                        }

                        console.log(`[webhook-handle-message] Push notifications sent to ${teamMembersToNotify.length} user(s)`);
                    }

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

        // 5. Forward to External Webhook (only for individual contacts, not groups)
        // Additional filters:
        // - conversation.status must be 'pending'
        // - contacts.ia_on must be TRUE
        // - ia_config.ia_on must be TRUE
        if (instance.webhook_url && eventType === 'messages' && !isGroup) {
            const conversationIsPending = conversation?.status === 'pending';

            let contactIaOn = true;
            if (contactId) {
                const { data: contactData } = await supabase
                    .from('contacts')
                    .select('ia_on')
                    .eq('id', contactId)
                    .single();
                contactIaOn = contactData?.ia_on !== false;
            }

            let iaConfigOn = false;
            const { data: iaConfig } = await supabase
                .from('ia_config')
                .select('ia_on')
                .eq('user_id', userId)
                .single();
            iaConfigOn = iaConfig?.ia_on === true;

            const instanceIaOn = instance.ia_on_wpp !== false;

            let queueIsIa = false;
            if (conversation?.queue_id) {
                const { data: queueData } = await supabase
                    .from('queues')
                    .select('name, user_id')
                    .eq('id', conversation.queue_id)
                    .single();

                if (queueData && queueData.name === 'Atendimento IA' && queueData.user_id === userId) {
                    queueIsIa = true;
                }
            }

            if (conversationIsPending && contactIaOn && iaConfigOn && instanceIaOn && queueIsIa) {
                console.log('[webhook-handle-message] All filters passed! Forwarding to external webhook...');

                let iaFunnelId: string | null = null;
                try {
                    const { data: iaFunnel, error: iaFunnelError } = await supabase
                        .from('crm_funnels')
                        .select('id')
                        .eq('name', 'Atendimento IA')
                        .eq('user_id', userId)
                        .single();

                    if (iaFunnelError) {
                        console.warn('[webhook-handle-message] Atendimento IA funnel not found:', iaFunnelError.message);
                    } else if (iaFunnel?.id) {
                        iaFunnelId = iaFunnel.id;
                    }
                } catch (err) {
                    console.error('[webhook-handle-message] Exception finding IA funnel:', err);
                }

                try {
                    const forwardedPayload = {
                        ...payload,
                        bd_data: {
                            user_id: userId,
                            contact_id: contactId || null,
                            conversation_id: conversation?.id || null,
                            group_id: groupId || null,
                            instance_id: instance.id,
                            ia_funnel_id: iaFunnelId
                        }
                    };

                    const webhookResponse = await fetch(instance.webhook_url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'Supabase-Webhook-Proxy/1.0'
                        },
                        body: JSON.stringify(forwardedPayload)
                    });

                    console.log('[webhook-handle-message] Webhook Response Status:', webhookResponse.status);

                    if (!webhookResponse.ok) {
                        const errorText = await webhookResponse.text();
                        console.error('[webhook-handle-message] Webhook Error Response:', errorText);
                    }
                } catch (forwardError) {
                    console.error('[webhook-handle-message] Forward error:', forwardError);
                }
            } else {
                console.log('[webhook-handle-message] Webhook NOT sent - filters failed:', {
                    conversationIsPending,
                    contactIaOn,
                    iaConfigOn,
                    instanceIaOn,
                    queueIsIa
                });
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
