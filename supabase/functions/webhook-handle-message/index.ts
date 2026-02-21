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

    console.log('[webhook-handle-message] Starting...');

    // ========================================
    // PRE-PARSE DIAGNOSTICS
    // ========================================
    console.log('[webhook-handle-message] 🔍 REQUEST METHOD:', req.method);
    console.log('[webhook-handle-message] 🔍 REQUEST URL:', req.url);
    console.log('[webhook-handle-message] 🔍 CONTENT-TYPE:', req.headers.get('content-type'));
    console.log('[webhook-handle-message] 🔍 ALL HEADERS:');
    req.headers.forEach((value, key) => {
        console.log(`  ${key}: ${value}`);
    });

    try {
        // Clone request to read body as text first
        const clonedReq = req.clone();
        const rawBody = await clonedReq.text();
        console.log('[webhook-handle-message] 🔍 RAW BODY LENGTH:', rawBody.length);
        console.log('[webhook-handle-message] 🔍 RAW BODY FIRST 5000 CHARS:', rawBody.substring(0, 5000));
        console.log('[webhook-handle-message] 🔍 RAW BODY COMPLETE:', rawBody);


        const payload = await req.json();

        // ========================================
        // -- RECEIVED WEBHOOK LOG --
        // ========================================
        console.log('==========================================');
        console.log('-- RECEIVED WEBHOOK LOG --');
        console.log('==========================================');
        console.log('PAYLOAD TYPE:', typeof payload);
        console.log('PAYLOAD IS NULL/UNDEFINED:', payload === null || payload === undefined);
        console.log('PAYLOAD KEYS:', payload ? Object.keys(payload) : 'N/A');
        console.log('FULL PAYLOAD:');
        console.log(JSON.stringify(payload, null, 2));
        console.log('==========================================');
        console.log('-- END WEBHOOK LOG --');
        console.log('==========================================');

        const eventType = payload.EventType || payload.event || payload.type || 'messages';
        const instanceName = payload.instanceName;

        console.log('[webhook-handle-message] Event Type:', eventType);
        console.log('[webhook-handle-message] Instance:', instanceName);

        // 🔥🔥🔥 ALWAYS LOG FULL PAYLOAD - FOR DEBUGGING 🔥🔥🔥
        console.log('[webhook-handle-message] ═══════════════════════════════════════');
        console.log('[webhook-handle-message] 📦 FULL WEBHOOK PAYLOAD RECEIVED:');
        console.log('[webhook-handle-message] ═══════════════════════════════════════');
        console.log(JSON.stringify(payload, null, 2));
        console.log('[webhook-handle-message] ═══════════════════════════════════════');

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
            console.log('[webhook-handle-message] Processing Group Message...');

            // Extract Group Data from Payload
            // Priority: chat.wa_name (User requested) > chat.name > message.groupName
            const chatData = payload.chat || payload.body?.chat || {};
            const waChatId = chatData.wa_chatid || payload.message?.chatid;
            const groupName = chatData.wa_name || chatData.name || payload.message?.groupName || "Grupo Desconhecido";
            // Support both imagePreview and image fields
            const groupImagePreview = chatData.imagePreview || chatData.image;

            console.log('[webhook-handle-message] Group Data Extracted:', {
                waChatId,
                groupName,
                groupImagePreview,
                source: 'payload.chat'
            });

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
                        // If we have an image URL, we'll update it momentarily, but initially null is fine 
                        // or we could try to download before insert, but better to do it after to have the ID for naming
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
                console.log('[webhook-handle-message] Updating EXISTING group:', group.id);
                const updates: any = {};

                // Update Name if changed
                if (group.group_name !== groupName) {
                    updates.group_name = groupName;
                    console.log(`[webhook-handle-message] Updating group name: ${group.group_name} -> ${groupName}`);
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
                // Check if we need to update:
                // 1. If group has no pic URL
                // 2. OR if the new preview URL is different? 
                //    Hard to check if "new preview" is different from "our stored public url".
                //    Process: Download -> Upload -> Compare? Too expensive.
                //    User said "SEMPRE que for um grupo... atualizar a foto".
                //    We'll do it, but maybe add a small check to avoid spamming storage if not needed?
                //    For now, we will execute the update logic. To optimize, we could store the hash or original URL.
                //    Let's just proceed with download/upload.

                console.log('[webhook-handle-message] Processing Group Image Update...');
                try {
                    const imageResponse = await fetch(groupImagePreview);
                    if (imageResponse.ok) {
                        const imageBlob = await imageResponse.blob();
                        // Use a consistent filename strategy or timestamped?
                        // If timestamped, we fill storage. If consistent, we overwrite.
                        // Overwriting is better for storage space, but browser caching might be an issue.
                        // Adding a timestamp query param to the URL usually fixes caching.
                        const fileName = `group_${group.id}.jpg`;

                        const { error: uploadError } = await supabase.storage
                            .from('avatars')
                            .upload(fileName, imageBlob, { contentType: 'image/jpeg', upsert: true });

                        if (!uploadError) {
                            // Get Public URL
                            const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
                            // Add a random query param to bust cache if we overwrote the file
                            const publicUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

                            await supabase.from('groups')
                                .update({ group_pic_url: publicUrl })
                                .eq('id', group.id);

                            console.log('[webhook-handle-message] Group image updated successfully:', publicUrl);
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
                            profile_pic_url: senderProfilePic, // Initial picture
                            lid: payload.message?.sender_lid || payload.sender_lid || null // Save LID
                        })
                        .select()
                        .single();
                    member = newMember;
                } else {
                    // UPDATE EXISTING MEMBER
                    // If name or picture changed, update it.
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
                        console.log(`[webhook-handle-message] Updating member ${member.number} details:`, updates);
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
            console.log('[webhook-handle-message] Payload received:', JSON.stringify(payload, null, 2));

            // Extrair dados do chat da raiz do payload
            const chatData = payload.chat || {};

            // Número do contato (wa_chatid do chat ou chatid da message como fallback)
            const waNumber = chatData.wa_chatid || payload.message?.chatid;

            // ========== PUSH_NAME (Nome do contato) ==========
            // Prioridade:
            // 1. chat.wa_name (nome definido pelo usuário no WhatsApp)
            // 2. chat.name (nome salvo na lista de contatos do celular)
            // 3. chat.phone (número formatado como fallback)
            const contactName = chatData.wa_name || chatData.name || chatData.phone;

            // ========== PROFILE_PIC_URL (Foto do perfil) ==========
            // Usar apenas imagePreview para foto de perfil
            const profilePicUrl = chatData.imagePreview || null;

            if (!waNumber) {
                console.error('[webhook-handle-message] No waNumber found in payload');
                return new Response(
                    JSON.stringify({ success: false, error: "No wa_chatid" }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Buscar contato existente - FILTRAR POR USER_ID
            // Permite que contatos sejam compartilhados entre instâncias do mesmo user
            let { data: contact } = await supabase
                .from('contacts')
                .select('*')
                .eq('user_id', userId)
                .eq('number', waNumber)
                .maybeSingle();

            if (contact) {
                console.log(`[webhook-handle-message] Contact found: ${contact.id}, current photo: ${contact.profile_pic_url}`);
                console.log(`[webhook-handle-message] New photo from payload: ${profilePicUrl}`);

                // Contato existe - atualizar foto se mudou (sempre permitido)
                if (profilePicUrl && profilePicUrl !== contact.profile_pic_url) {
                    console.log(`[webhook-handle-message] Updating profile picture for contact ${contact.id}`);
                    const { error: photoError } = await supabase
                        .from('contacts')
                        .update({ profile_pic_url: profilePicUrl })
                        .eq('id', contact.id);

                    if (photoError) {
                        console.error('[webhook-handle-message] Error updating profile picture:', photoError);
                    } else {
                        console.log('[webhook-handle-message] Profile picture updated successfully');
                    }
                }

                // Atualizar nome APENAS se não foi editado manualmente e não é grupo
                if (!contact.edited && !contact.is_group && contactName && contactName !== 'Desconhecido' && contactName !== contact.push_name) {
                    console.log(`[webhook-handle-message] Updating contact name from "${contact.push_name}" to "${contactName}"`);
                    // Verificar se o novo nome tem letras (nome real) - se sim, marcar como edited
                    const hasLetters = /[a-zA-Z]/.test(contactName);
                    const { error: nameError } = await supabase.from('contacts').update({
                        push_name: contactName,
                        edited: hasLetters // Se tem letras, marcar como editado para não sobrescrever
                    }).eq('id', contact.id);

                    if (nameError) {
                        console.error('[webhook-handle-message] Error updating contact name:', nameError);
                    } else {
                        console.log(`[webhook-handle-message] Contact name updated successfully, edited flag set to: ${hasLetters}`);
                    }
                } else if (contact.edited) {
                    console.log(`[webhook-handle-message] Skipping name update - contact was manually edited`);
                } else if (contact.is_group) {
                    console.log(`[webhook-handle-message] Skipping name update - contact is a group`);
                }
            } else {
                // Criar novo contato
                // Verificar se o nome tem letras (nome real vs número)
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
                        edited: hasLetters // Se nome tem letras, já marcar como editado
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
                            console.log('[webhook-handle-message] Recovered existing contact after 23505:', contact.id);
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
            console.log('[webhook-handle-message] Processing Conversation...');

            // 🔍 DEBUG: Log raw messageType BEFORE mapping
            console.log('[webhook-handle-message] 🔍 RAW payload.message?.messageType:', payload.message?.messageType);
            console.log('[webhook-handle-message] 🔍 payload.message?.type:', payload.message?.type);

            const messageType = mapMessageType(payload.message?.messageType || 'conversation');

            // 🔍 DEBUG: Log AFTER mapping - FOR ALL MESSAGES
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📨 [webhook-handle-message] MESSAGE TYPE AFTER MAPPING:', messageType);
            console.log('📝 RAW uzapi type:', payload.message?.messageType);
            console.log('📑 Message text preview:', (payload.message?.text || payload.message?.content?.text || '').substring(0, 50));
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');


            const messageText = payload.message?.text || payload.message?.content?.text || payload.body?.message?.text || '';

            // ========================================
            // EXTRACT REACTION DATA (if reactionMessage)
            // Real UzAPI payload structure:
            //   emoji  → payload.message.text OR payload.message.content.text
            //   target → payload.message.reaction (string ID)  OR payload.message.content.key.ID (uppercase!)
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
            if (messageType === 'reaction') {
                console.log('[webhook-handle-message] 💬 REACTION detected:', reactionEmoji, '→ target:', reactionTargetId);
            }

            // ========================================
            // EXTRACT FILE METADATA FOR MEDIA MESSAGES
            // ========================================
            let mediaFilename: string | null = null;
            let mediaMimetype: string | null = null;

            if (['document', 'image', 'video', 'audio', 'sticker'].includes(messageType)) {
                // Try multiple payload structures for filename
                const content = payload.message?.content || {};

                // 🔍 DEBUG: Log full content structure for documents or stickers
                if (messageType === 'document' || messageType === 'sticker') {
                    console.log(`[webhook-handle-message] 🔍🔍🔍 ===== ${messageType.toUpperCase()} RECEIVED ===== 🔍🔍🔍`);
                    console.log('[webhook-handle-message] 🔍 messageType:', messageType);
                    console.log('[webhook-handle-message] 🔍 payload.message FULL:', JSON.stringify(payload.message, null, 2));
                    console.log('[webhook-handle-message] 🔍 payload.message.content:', JSON.stringify(content, null, 2));
                    console.log('[webhook-handle-message] 🔍 payload.documentMessage:', JSON.stringify(payload.documentMessage, null, 2));
                }

                mediaFilename =
                    content.fileName ||           // UzAPI format
                    content.filename ||           // Alternative format  
                    payload.message?.fileName ||  // Root level
                    payload.documentMessage?.fileName ||
                    null;

                // Try multiple payload structures for mimetype
                mediaMimetype =
                    content.mimetype ||           // UzAPI format
                    content.mimeType ||           // Alternative format
                    payload.message?.mimetype ||  // Root level
                    payload.documentMessage?.mimetype ||
                    null;

                console.log('[webhook-handle-message] 📎 Media Metadata:', {
                    messageType,
                    mediaFilename,
                    mediaMimetype
                });

                // 🔍 Extra logging for documents
                if (messageType === 'document') {
                    console.log('[webhook-handle-message] 🔍 EXTRACTED VALUES:');
                    console.log('[webhook-handle-message] 🔍   → mediaFilename:', mediaFilename);
                    console.log('[webhook-handle-message] 🔍   → mediaMimetype:', mediaMimetype);
                    console.log('[webhook-handle-message] 🔍 ===== END DOCUMENT DEBUG =====');
                }
            }

            // ==== DEBUG: EXTENSIVE FROMMEN LOGGING ====
            console.log('[webhook-handle-message] 🔍 === PAYLOAD STRUCTURE DEBUG ===');
            console.log('[webhook-handle-message] 🔍 payload.fromMe:', payload.fromMe);
            console.log('[webhook-handle-message] 🔍 payload.message?.fromMe:', payload.message?.fromMe);
            console.log('[webhook-handle-message] 🔍 payload.data?.fromMe:', payload.data?.fromMe);
            console.log('[webhook-handle-message] 🔍 payload.body?.fromMe:', payload.body?.fromMe);
            console.log('[webhook-handle-message] 🔍 payload.content?.fromMe:', payload.content?.fromMe);
            console.log('[webhook-handle-message] 🔍 payload.owner:', payload.owner);
            console.log('[webhook-handle-message] 🔍 payload.sender:', payload.sender);
            console.log('[webhook-handle-message] 🔍 instance.phone:', (instance as any).phone);
            console.log('[webhook-handle-message] 🔍 FULL PAYLOAD KEYS:', Object.keys(payload));
            if (payload.message) {
                console.log('[webhook-handle-message] 🔍 FULL payload.message KEYS:', Object.keys(payload.message));
            }

            const fromMe =
                payload.message?.fromMe === true ||  // UzAPI/WhatsApp format
                payload.fromMe === true;              // N8N API format (root level)
            const messageId = payload.message?.messageid || payload.message?.id || payload.body?.key?.id;

            // ========================================
            // DETAILED LOGGING FOR BUTTON RESPONSES
            // ========================================
            console.log('[webhook-handle-message] messageType:', payload.message?.messageType);
            console.log('[webhook-handle-message] messageText:', messageText);
            console.log('[webhook-handle-message] ⚠️ FINAL fromMe VALUE:', fromMe);
            console.log('[webhook-handle-message] fromMe source:',
                payload.message?.fromMe ? 'payload.message.fromMe' :
                    payload.fromMe ? 'payload.fromMe' : '❌ NOT FOUND');
            console.log('[webhook-handle-message] Raw payload.fromMe:', payload.fromMe);
            console.log('[webhook-handle-message] Raw payload.message?.fromMe:', payload.message?.fromMe);

            // Extract vote field (UzAPI sends button response text here)
            const voteText = payload.message?.vote || '';
            console.log('[webhook-handle-message] voteText:', voteText);



            // Log button response specific fields
            const buttonResponseId = payload.message?.buttonsResponseMessage?.selectedButtonId ||
                payload.body?.buttonsResponseMessage?.selectedButtonId ||
                payload.message?.content?.buttonsResponseMessage?.selectedButtonId;
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

            console.log('[webhook-handle-message] buttonResponseId:', buttonResponseId);
            console.log('[webhook-handle-message] selectedDisplayText:', selectedDisplayText);
            console.log('[webhook-handle-message] npsButtonId:', npsButtonId);

            // Use vote or selectedDisplayText as message body for button responses
            // For reactions, use the emoji directly
            const effectiveMessageBody = messageType === 'reaction'
                ? reactionEmoji
                : (voteText || selectedDisplayText || messageText);
            console.log('[webhook-handle-message] effectiveMessageBody:', effectiveMessageBody);

            // Log full message structure for debugging
            if (payload.message?.messageType?.toLowerCase().includes('button') ||
                payload.message?.messageType?.toLowerCase().includes('template') ||
                npsButtonId || buttonResponseId || voteText) {
                console.log('[webhook-handle-message] BUTTON RESPONSE DETECTED - Full message:', JSON.stringify(payload.message));
            }

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
                console.log('[webhook-handle-message] No conversation in current instance, checking for orphaned...');

                let orphanQuery = supabase
                    .from('conversations')
                    .select('*')
                    .is('instance_id', null)  // Instance was deleted -> SET NULL
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
                    console.log('[webhook-handle-message] Found orphaned conversation, migrating to current instance:', orphanedConvs[0].id);

                    // Migrate ONLY instance_id (keep all other fields as-is per user requirement)
                    const { error: migrateError } = await supabase
                        .from('conversations')
                        .update({ instance_id: instance.id })
                        .eq('id', orphanedConvs[0].id);

                    if (migrateError) {
                        console.error('[webhook-handle-message] Error migrating orphaned conversation:', migrateError);
                    } else {
                        conversations = [{ ...orphanedConvs[0], instance_id: instance.id }];
                        console.log('[webhook-handle-message] Orphaned conversation migrated successfully');
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
                if (['image', 'audio', 'video', 'document', 'sticker'].includes(messageType) && messageId) {
                    console.log('[webhook-handle-message] Downloading media with filename:', mediaFilename);
                    mediaUrl = await downloadMediaFromUzapi(
                        instance.apikey,
                        messageId,
                        messageType,
                        supabase,
                        conversation.id,
                        mediaFilename || undefined  // Pass filename to download function
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
                    // For reactions: link to the reacted message via evolution_id match
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
                        media_filename: mediaFilename,      // NEW: Original filename
                        media_mimetype: mediaMimetype,      // NEW: MIME type
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
                    // Apenas se for contato recém-criado, mensagem recebida, via WhatsApp individual
                    // O contato precisa ter nome válido (hasLetters) e uma foto
                    // Instância precisar ter um funil configurado
                    if (isNewContactForAutoDeal && !fromMe && contactId && instance.auto_create_deal_funnel_id) {
                        const hasValidName = /[a-zA-Z]/.test(senderName || '');
                        if (hasValidName && senderProfilePicUrl) {
                            console.log('[webhook-handle-message] Requirements met for Auto Deal creation. Funnel ID:', instance.auto_create_deal_funnel_id);
                            try {
                                // 1. Buscar a primeira etapa do Funil
                                const { data: stages } = await supabase
                                    .from('crm_stages')
                                    .select('id')
                                    .eq('funnel_id', instance.auto_create_deal_funnel_id)
                                    .order('position', { ascending: true })
                                    .limit(1);

                                if (stages && stages.length > 0) {
                                    // 2. Inserir negócio na primeira etapa
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
                                    } else {
                                        console.log('[webhook-handle-message] Deal auto-created successfully for new contact:', contactId);
                                    }
                                } else {
                                    console.log('[webhook-handle-message] Could not find any stages for the configured funnel.');
                                }
                            } catch (err) {
                                console.error('[webhook-handle-message] Exception auto-creating deal:', err);
                            }
                        } else {
                            console.log('[webhook-handle-message] Auto Deal skipped: Contact lacks valid name or profile picture.', { hasValidName, hasProfilePic: !!senderProfilePicUrl });
                        }
                    }

                    // ========================================
                    // NPS RESPONSE DETECTION WITH AI FEEDBACK
                    // ========================================
                    // Detect NPS response via npsButtonId (nps_1 to nps_5) or text match
                    const isNpsResponse = (npsButtonId && npsButtonId.startsWith('nps_')) ||
                        (voteText && (voteText.includes('Excelente') || voteText.includes('Muito Bom') ||
                            voteText.includes('Bom') || voteText.includes('Regular') || voteText.includes('Ruim')));

                    if (isNpsResponse && contactId && !fromMe) {
                        console.log('[webhook-handle-message] NPS response detected!');
                        console.log('[webhook-handle-message] npsButtonId:', npsButtonId);
                        console.log('[webhook-handle-message] voteText:', voteText);

                        // Extract nota text (e.g., "Excelente", "Muito Bom", etc.)
                        let notaText = '';
                        if (voteText) {
                            // Extract just the rating name from vote (remove stars)
                            if (voteText.includes('Excelente')) notaText = 'Excelente';
                            else if (voteText.includes('Muito Bom')) notaText = 'Muito Bom';
                            else if (voteText.includes('Bom')) notaText = 'Bom';
                            else if (voteText.includes('Regular')) notaText = 'Regular';
                            else if (voteText.includes('Ruim')) notaText = 'Ruim';
                            else notaText = voteText.trim();
                        } else if (npsButtonId) {
                            // Map npsButtonId to text
                            const npsIdToText: Record<string, string> = {
                                'nps_5': 'Excelente',
                                'nps_4': 'Muito Bom',
                                'nps_3': 'Bom',
                                'nps_2': 'Regular',
                                'nps_1': 'Ruim'
                            };
                            notaText = npsIdToText[npsButtonId] || npsButtonId;
                        }

                        console.log('[webhook-handle-message] notaText extracted:', notaText);

                        // Generate AI feedback from conversation context
                        let feedback = '';
                        try {
                            // Get recent messages for context (last 10)
                            const { data: recentMsgs } = await supabase
                                .from('messages')
                                .select('body, direction, created_at')
                                .eq('conversation_id', conversation.id)
                                .order('created_at', { ascending: false })
                                .limit(10);

                            if (recentMsgs && recentMsgs.length > 0) {
                                // Format conversation text for AI
                                const conversationText = recentMsgs.reverse().map((m: any) =>
                                    `${m.direction === 'inbound' ? 'Cliente' : 'Agente'}: ${m.body || '[mídia]'}`
                                ).join('\n');

                                console.log('[webhook-handle-message] Generating AI feedback...');

                                // Prepare prompt for AI feedback generation
                                const feedbackPrompt = `Analise esta conversa e gere um breve feedback do cliente (1-2 frases):

Conversa:
${conversationText}

O cliente avaliou o atendimento como "${notaText}".
Gere um resumo MUITO breve focado na experiência e satisfação do cliente.
Responda APENAS com o texto do feedback, sem formatação JSON ou markdown.`;

                                // Call OpenAI for feedback generation
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
                                    console.log('[webhook-handle-message] AI feedback generated:', feedback);

                                    // Track token usage
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
                                    // Fallback to simple feedback
                                    const clientMsgs = recentMsgs.filter((m: any) => m.direction === 'inbound').length;
                                    const agentMsgs = recentMsgs.filter((m: any) => m.direction === 'outbound').length;
                                    feedback = `Conversa com ${clientMsgs} mensagens do cliente e ${agentMsgs} do atendente.`;
                                }
                            }
                        } catch (feedbackError) {
                            console.error('[webhook-handle-message] Error generating AI feedback:', feedbackError);
                        }

                        // Save to contacts.nps using RPC (nota as TEXT now)
                        console.log('[webhook-handle-message] Saving NPS entry:', { contactId, notaText, feedback });
                        const { error: npsError } = await supabase.rpc('add_nps_entry', {
                            p_contact_id: contactId,
                            p_nota: notaText,  // Now sending text like "Excelente"
                            p_feedback: feedback
                        });

                        if (npsError) {
                            console.error('[webhook-handle-message] Error saving NPS:', npsError);
                        } else {
                            console.log('[webhook-handle-message] NPS saved successfully for contact:', contactId);
                        }
                    }

                    // ========================================
                    // PUSH NOTIFICATION FOR INBOUND MESSAGES
                    // ========================================
                    if (!fromMe && savedMessage) {
                        console.log('[webhook-handle-message] Triggering push notification for inbound message...');

                        // Get team members who should receive the notification
                        // Rules:
                        // 1. If conversation.assigned_agent_id exists -> notify only that agent
                        // 2. If conversation.queue_id exists -> notify only members in that queue
                        // 3. Otherwise -> notify all team members of the company
                        // 
                        // Notification preferences:
                        // - notifications_enabled: true = receives notifications for individual contacts
                        // - group_notifications_enabled: true = receives notifications for groups

                        // Get ALL team members with role info and notification preferences
                        const { data: allTeamMembers } = await supabase
                            .from('team_members')
                            .select('id, auth_user_id, role, queue_ids, notifications_enabled, group_notifications_enabled')
                            .eq('user_id', userId)
                            .not('auth_user_id', 'is', null);

                        let teamMembersToNotify: any[] = [];

                        for (const tm of allTeamMembers || []) {
                            const role = tm.role as string;

                            // Check notification preferences based on message type
                            // For groups: check group_notifications_enabled
                            // For contacts: check notifications_enabled
                            if (isGroup) {
                                if (tm.group_notifications_enabled !== true) {
                                    continue; // Skip this member - group notifications disabled
                                }
                            } else {
                                if (tm.notifications_enabled !== true) {
                                    continue; // Skip this member - contact notifications disabled
                                }
                            }

                            // Admin/Supervisor: receive ALL inbound messages (if notifications enabled for the type)
                            if (role === 'admin' || role === 'supervisor') {
                                teamMembersToNotify.push(tm);
                                continue;
                            }

                            // Agent: role-based filtering
                            if (role === 'agent') {
                                const agentQueues = tm.queue_ids || [];
                                const hasQueues = agentQueues.length > 0;

                                // Case 1: Conversation is assigned to this specific agent
                                if (conversation.assigned_agent_id && conversation.assigned_agent_id === tm.id) {
                                    teamMembersToNotify.push(tm);
                                }
                                // Case 2: Conversation is in a queue that this agent belongs to
                                else if (conversation.queue_id && hasQueues && agentQueues.includes(conversation.queue_id)) {
                                    teamMembersToNotify.push(tm);
                                }
                                // Case 3: Agent has no queues AND conversation is not assigned to anyone
                                else if (!hasQueues && !conversation.assigned_agent_id) {
                                    teamMembersToNotify.push(tm);
                                }
                            }
                        }

                        // Get contact name and profile picture for notification
                        // Use senderName/senderProfilePicUrl which are set for both contacts and group members
                        const notificationTitle = isGroup
                            ? (payload.body?.chat?.name || senderName || 'Grupo')
                            : (senderName || payload.body?.from?.name || payload.message?.pushName || 'Cliente');

                        const notificationIcon = senderProfilePicUrl || undefined;

                        const messagePreview = (messageText || messageType || '').substring(0, 50) +
                            ((messageText?.length || 0) > 50 ? '...' : '');

                        // Send push to each team member using direct fetch (invoke doesn't work reliably from Edge Functions)
                        const supabaseUrl = Deno.env.get('SUPABASE_URL');
                        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

                        for (const tm of teamMembersToNotify) {
                            if (tm.auth_user_id && supabaseUrl && serviceKey) {
                                console.log('[webhook-handle-message] Sending push to auth_user_id:', tm.auth_user_id);

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
                                }).then(res => {
                                    console.log('[webhook-handle-message] Push response status:', res.status);
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
            console.log('[webhook-handle-message] Checking webhook filters...');

            // Check filter 1: conversation.status === 'pending'
            const conversationIsPending = conversation?.status === 'pending';
            if (!conversationIsPending) {
                console.log('[webhook-handle-message] Skipping webhook: conversation status is not pending (status:', conversation?.status || 'no conversation', ')');
            }

            // Check filter 2: contacts.ia_on === TRUE
            let contactIaOn = true; // Default to true if not found
            if (contactId) {
                const { data: contactData } = await supabase
                    .from('contacts')
                    .select('ia_on')
                    .eq('id', contactId)
                    .single();
                contactIaOn = contactData?.ia_on !== false; // Default to true if null/undefined
            }
            if (!contactIaOn) {
                console.log('[webhook-handle-message] Skipping webhook: contact.ia_on is FALSE');
            }

            // Check filter 3: ia_config.ia_on === TRUE
            let iaConfigOn = false; // Default to false
            let crmAuto = false; // Flag for CRM auto
            const { data: iaConfig } = await supabase
                .from('ia_config')
                .select('ia_on, crm_auto')
                .eq('user_id', userId)
                .single();
            iaConfigOn = iaConfig?.ia_on === true;
            crmAuto = iaConfig?.crm_auto === true;
            if (!iaConfigOn) {
                console.log('[webhook-handle-message] Skipping webhook: ia_config.ia_on is FALSE');
            }

            // Check filter 4: instances.ia_on_wpp === TRUE
            const instanceIaOn = instance.ia_on_wpp !== false; // Default to true if null/undefined
            if (!instanceIaOn) {
                console.log('[webhook-handle-message] Skipping webhook: instance.ia_on_wpp is FALSE');
            }

            // Check filter 5: Queue must be "Atendimento IA"
            let queueIsIa = false;
            if (conversation?.queue_id) {
                const { data: queueData } = await supabase
                    .from('queues')
                    .select('name, user_id')
                    .eq('id', conversation.queue_id)
                    .single();

                if (queueData && queueData.name === 'Atendimento IA' && queueData.user_id === userId) {
                    queueIsIa = true;
                } else {
                    console.log(`[webhook-handle-message] Skipping webhook: queue is "${queueData?.name}" (expected "Atendimento IA")`);
                }
            } else {
                console.log('[webhook-handle-message] Skipping webhook: conversation has no queue_id');
            }

            // Only forward webhook if ALL 5 filters pass
            if (conversationIsPending && contactIaOn && iaConfigOn && instanceIaOn && queueIsIa) {
                console.log('[webhook-handle-message] All filters passed! Forwarding to external webhook...');

                // Fetch the 'Atendimento IA' funnel ID unconditionally to include in the payload
                let iaFunnelId: string | null = null;
                try {
                    console.log('[webhook-handle-message] Looking for "Atendimento IA" funnel unconditionally...');
                    const { data: iaFunnel, error: iaFunnelError } = await supabase
                        .from('crm_funnels')
                        .select('id')
                        .eq('name', 'Atendimento IA')
                        .eq('user_id', userId)
                        .single();

                    if (iaFunnelError) {
                        console.log('[webhook-handle-message] Error or not found "Atendimento IA" funnel:', iaFunnelError.message);
                    } else if (iaFunnel?.id) {
                        iaFunnelId = iaFunnel.id;
                        console.log('[webhook-handle-message] Found Atendimento IA funnel:', iaFunnelId);
                    }
                } catch (err) {
                    console.error('[webhook-handle-message] Exception finding IA funnel:', err);
                }

                try {
                    // Build the forwarded payload with bd_data containing database IDs
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

                    console.log('[webhook-handle-message] bd_data:', JSON.stringify(forwardedPayload.bd_data));

                    // ========================================
                    // DETAILED WEBHOOK LOGGING
                    // ========================================
                    console.log('[webhook-handle-message] SENDING TO EXTERNAL WEBHOOK:');
                    console.log('[webhook-handle-message] Webhook URL:', instance.webhook_url);
                    console.log('[webhook-handle-message] Instance ID:', instance.id);

                    const webhookResponse = await fetch(instance.webhook_url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'User-Agent': 'Supabase-Webhook-Proxy/1.0'
                        },
                        body: JSON.stringify(forwardedPayload)
                    });

                    console.log('[webhook-handle-message] Webhook Response Status:', webhookResponse.status);
                    console.log('[webhook-handle-message] Webhook Response OK:', webhookResponse.ok);

                    if (!webhookResponse.ok) {
                        const errorText = await webhookResponse.text();
                        console.error('[webhook-handle-message] Webhook Error Response:', errorText);
                    } else {
                        console.log('[webhook-handle-message] Forwarded successfully with bd_data');
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
