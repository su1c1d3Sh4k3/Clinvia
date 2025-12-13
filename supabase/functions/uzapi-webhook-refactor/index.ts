import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const mapMessageType = (uzapiType: string): string => {
    const typeMap: Record<string, string> = {
        'extendedtextmessage': 'text',
        'conversation': 'text',
        'imagemessage': 'image',
        'audiomessage': 'audio',
        'videomessage': 'video',
        'documentmessage': 'document',
    };
    return typeMap[uzapiType?.toLowerCase()] || 'text';
};

// Helper to convert base64 to Uint8Array
function base64ToUint8Array(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const method = req.method;
    console.log(`[UZAPI WEHOOK REFACTOR] Request received. Method: ${method}`);

    try {
        const rawBody = await req.text();
        console.log(`[UZAPI WEHOOK REFACTOR] Raw Body length: ${rawBody.length}`);

        let payload: any = {};
        if (rawBody) {
            try {
                payload = JSON.parse(rawBody);
                console.log('[UZAPI WEHOOK REFACTOR] Payload Parsed Successfully');
            } catch (e) {
                console.error('[UZAPI WEHOOK REFACTOR] Failed to parse JSON body:', e);
                return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), { status: 400, headers: corsHeaders });
            }
        }

        // =============================================
        // LOG ALL EVENT TYPES FOR DEBUGGING
        // =============================================
        const eventType = payload.EventType || payload.event || payload.type || 'unknown';
        console.log('[UZAPI WEHOOK REFACTOR] ========================================');
        console.log('[UZAPI WEHOOK REFACTOR] EVENT TYPE:', eventType);
        console.log('[UZAPI WEHOOK REFACTOR] ========================================');

        // Special handling for specific event types
        if (eventType === 'sender' || eventType === 'send') {
            console.log('[UZAPI WEHOOK REFACTOR] ===== SENDER EVENT DETECTED =====');
            console.log('[UZAPI WEHOOK REFACTOR] Sender payload data:', JSON.stringify(payload.data || payload.message || payload, null, 2));
        }

        if (eventType === 'history') {
            console.log('[UZAPI WEHOOK REFACTOR] ===== HISTORY EVENT DETECTED =====');
            console.log('[UZAPI WEHOOK REFACTOR] History payload data:', JSON.stringify(payload.data || payload.messages || payload, null, 2));
        }

        if (eventType === 'messages_update' || eventType === 'message_update' || eventType === 'update' || eventType === 'ack') {
            console.log('[UZAPI WEHOOK REFACTOR] ===== MESSAGES_UPDATE EVENT DETECTED =====');
            console.log('[UZAPI WEHOOK REFACTOR] Update payload data:', JSON.stringify(payload, null, 2));
        }

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // =============================================
        // EARLY HANDLING FOR READ RECEIPTS (messages_update)
        // Must be handled before regular message processing
        // =============================================
        if (eventType === 'messages_update' && payload.type === 'ReadReceipt') {
            console.log('[UZAPI WEHOOK REFACTOR] ===== PROCESSING READ RECEIPT =====');
            console.log('[UZAPI WEHOOK REFACTOR] State:', payload.state);
            console.log('[UZAPI WEHOOK REFACTOR] MessageIDs:', JSON.stringify(payload.event?.MessageIDs));

            const messageIds = payload.event?.MessageIDs || [];
            const state = payload.state; // "Delivered" or "Read"

            if (messageIds.length > 0) {
                // Map state to our status values
                let status: string;
                if (state === 'Read') {
                    status = 'read';
                } else if (state === 'Delivered') {
                    status = 'delivered';
                } else {
                    console.log('[UZAPI WEHOOK REFACTOR] Unknown state:', state);
                    status = 'sent';
                }

                console.log('[UZAPI WEHOOK REFACTOR] Mapped status:', status);

                // Update each message
                for (const messageId of messageIds) {
                    console.log('[UZAPI WEHOOK REFACTOR] Updating message:', messageId, 'to status:', status);

                    const { data, error: updateError } = await supabaseClient
                        .from('messages')
                        .update({ status: status })
                        .eq('evolution_id', messageId)
                        .select('id');

                    if (updateError) {
                        console.error('[UZAPI WEHOOK REFACTOR] Error updating message:', messageId, updateError);
                    } else if (data && data.length > 0) {
                        console.log('[UZAPI WEHOOK REFACTOR] Successfully updated message:', messageId, 'DB ID:', data[0].id);
                    } else {
                        console.log('[UZAPI WEHOOK REFACTOR] Message not found in database:', messageId);
                    }
                }
            } else {
                console.log('[UZAPI WEHOOK REFACTOR] No MessageIDs in payload');
            }

            // Return early - don't process as regular message
            return new Response(
                JSON.stringify({ success: true, message: "Read receipt processed" }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
        }

        // 1. Fetch Instance and Owner (User ID)
        const instanceName = payload.instanceName;
        const { data: instance, error: instanceError } = await supabaseClient
            .from('instances')
            .select('id, apikey, user_id, webhook_url, default_queue_id') // Fetch user_id, webhook_url and default_queue_id
            .eq('name', instanceName)
            .single();

        if (instanceError || !instance) {
            console.error('[UZAPI WEHOOK REFACTOR] Instance not found or error:', instanceName, instanceError);
            return new Response(JSON.stringify({ success: false, error: "Instance not found" }), { status: 404, headers: corsHeaders });
        }

        const userId = instance.user_id;
        if (!userId) {
            console.warn('[UZAPI WEHOOK REFACTOR] WARNING: Proceeding without user_id!');
        }

        // 2. Check if it is a Group Message
        const isGroup = payload.message?.isGroup === true;
        let groupId: string | null = null;
        let contactId: string | null = null;

        // Variables to store sender info for the message table
        let senderName: string | null = null;
        let senderJid: string | null = null;
        let senderProfilePicUrl: string | null = null;

        if (isGroup) {
            console.log('[UZAPI WEHOOK REFACTOR] Processing Group Message...');
            const waChatId = payload.body?.chat?.wa_chatid || payload.message?.chatid;
            const groupName = payload.body?.chat?.name || payload.message?.groupName || "Grupo Desconhecido";

            if (!waChatId) {
                console.error('[UZAPI WEHOOK REFACTOR] Group message without chatid/wa_chatid');
                return new Response(JSON.stringify({ success: false, error: "No chatid for group" }), { status: 400, headers: corsHeaders });
            }

            // 2.1 Check/Create Group
            let { data: group, error: groupError } = await supabaseClient
                .from('groups')
                .select('*')
                .eq('remote_jid', waChatId)
                .single();

            if (!group) {
                console.log('[UZAPI WEHOOK REFACTOR] Group does not exist. Creating...');
                const { data: newGroup, error: createGroupError } = await supabaseClient
                    .from('groups')
                    .insert({
                        remote_jid: waChatId,
                        group_name: groupName,
                        instance_id: instance.id,
                        user_id: userId // Set user_id
                    })
                    .select()
                    .single();

                if (createGroupError) {
                    console.error('[UZAPI WEHOOK REFACTOR] Error creating group:', createGroupError);
                    throw createGroupError;
                }
                group = newGroup;
                console.log('[UZAPI WEHOOK REFACTOR] Group created:', group.id);
            } else {
                // Update instance_id or user_id if missing
                const updates: any = {};
                if (!group.instance_id) updates.instance_id = instance.id;
                if (!group.user_id && userId) updates.user_id = userId;

                if (Object.keys(updates).length > 0) {
                    await supabaseClient.from('groups').update(updates).eq('id', group.id);
                }
            }
            groupId = group.id;

            // 2.2 Sync Group Profile Picture
            if (group) {
                const numberOnly = waChatId.replace(/\D/g, '');
                // ... (Keep existing image sync logic) ...
                try {
                    const detailsResponse = await fetch('https://clinvia.uazapi.com/chat/details', {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                            'token': instance.apikey
                        },
                        body: JSON.stringify({ number: numberOnly, preview: false })
                    });

                    if (detailsResponse.ok) {
                        const detailsData = await detailsResponse.json();
                        const imagePreviewUrl = detailsData.imagePreview || detailsData[0]?.imagePreview;

                        if (imagePreviewUrl && imagePreviewUrl.startsWith('http')) {
                            try {
                                const imageResponse = await fetch(imagePreviewUrl);
                                if (imageResponse.ok) {
                                    const imageBlob = await imageResponse.blob();
                                    const fileName = `group_${group.id}_${Date.now()}.jpg`;

                                    const { error: uploadError } = await supabaseClient.storage
                                        .from('avatars')
                                        .upload(fileName, imageBlob, { contentType: 'image/jpeg', upsert: true });

                                    if (!uploadError) {
                                        const { data: publicUrlData } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
                                        await supabaseClient.from('groups').update({ group_pic_url: publicUrlData.publicUrl }).eq('id', group.id);
                                    }
                                }
                            } catch (e) { console.error('[UZAPI WEHOOK REFACTOR] Error processing group image:', e); }
                        }
                    }
                } catch (e) { console.error('[UZAPI WEHOOK REFACTOR] Error fetching group details:', e); }
            }

            // 2.3 Handle Group Member (Sender)
            const senderPn = payload.message?.sender_pn;
            const senderNameRaw = payload.message?.senderName || 'Membro Desconhecido';

            if (senderPn && group) {
                const memberNumber = senderPn.replace(/\D/g, '');

                // Check/Create Member
                let { data: member, error: memberError } = await supabaseClient
                    .from('group_members')
                    .select('*')
                    .eq('group_id', group.id)
                    .eq('number', senderPn)
                    .single();

                if (!member) {
                    console.log('[UZAPI WEHOOK REFACTOR] Member does not exist. Creating...');
                    const { data: newMember, error: createMemberError } = await supabaseClient
                        .from('group_members')
                        .insert({
                            group_id: group.id,
                            push_name: senderNameRaw,
                            number: senderPn,
                            user_id: userId // Set user_id
                        })
                        .select()
                        .single();

                    if (createMemberError) {
                        console.error('[UZAPI WEHOOK REFACTOR] Error creating group member:', createMemberError);
                    } else {
                        member = newMember;
                        console.log('[UZAPI WEHOOK REFACTOR] Group member created:', member.id);
                    }
                } else {
                    if (!member.user_id && userId) {
                        await supabaseClient.from('group_members').update({ user_id: userId }).eq('id', member.id);
                    }
                }

                // 2.4 Sync Member Profile Picture
                if (member) {
                    // Set sender info for message
                    senderName = member.push_name || senderNameRaw;
                    senderJid = member.number;
                    senderProfilePicUrl = member.profile_pic_url;

                    console.log('[UZAPI WEHOOK REFACTOR] Fetching details for member:', memberNumber);
                    try {
                        const memberDetailsResponse = await fetch('https://clinvia.uazapi.com/chat/details', {
                            method: 'POST',
                            headers: {
                                'Accept': 'application/json',
                                'Content-Type': 'application/json',
                                'token': instance.apikey
                            },
                            body: JSON.stringify({ number: memberNumber, preview: false })
                        });

                        if (memberDetailsResponse.ok) {
                            const memberDetailsData = await memberDetailsResponse.json();
                            const memberImagePreviewUrl = memberDetailsData.imagePreview || memberDetailsData[0]?.imagePreview;

                            if (memberImagePreviewUrl && memberImagePreviewUrl.startsWith('http')) {
                                console.log('[UZAPI WEHOOK REFACTOR] Found member image preview URL:', memberImagePreviewUrl);
                                try {
                                    const memImageResponse = await fetch(memberImagePreviewUrl);
                                    if (memImageResponse.ok) {
                                        const memImageBlob = await memImageResponse.blob();
                                        const memFileName = `member_${member.id}_${Date.now()}.jpg`;

                                        const { error: memUploadError } = await supabaseClient.storage
                                            .from('avatars')
                                            .upload(memFileName, memImageBlob, { contentType: 'image/jpeg', upsert: true });

                                        if (!memUploadError) {
                                            const { data: memPublicUrlData } = supabaseClient.storage.from('avatars').getPublicUrl(memFileName);
                                            const newPicUrl = memPublicUrlData.publicUrl;
                                            await supabaseClient.from('group_members').update({ profile_pic_url: newPicUrl }).eq('id', member.id);
                                            console.log('[UZAPI WEHOOK REFACTOR] Member profile pic updated.');
                                            senderProfilePicUrl = newPicUrl; // Update local variable
                                        }
                                    }
                                } catch (e) { console.error('[UZAPI WEHOOK REFACTOR] Error processing member image:', e); }
                            }
                        }
                    } catch (e) { console.error('[UZAPI WEHOOK REFACTOR] Error fetching member details:', e); }
                }
            }

        } else {
            // 3. Existing Logic for Individual Contacts (Non-Group)
            const chatid = payload.message?.chatid;
            if (!chatid) {
                console.error('[UZAPI WEHOOK REFACTOR] No chatid in message');
                return new Response(JSON.stringify({ success: false, error: "No chatid" }), { status: 400, headers: corsHeaders });
            }

            let { data: contact, error: contactError } = await supabaseClient
                .from('contacts')
                .select('*')
                .eq('number', chatid)
                .single();

            if (contact) {
                console.log('[UZAPI WEHOOK REFACTOR] Contact already exists:', contact.id);
                // Update user_id if missing
                if (!contact.user_id && userId) {
                    await supabaseClient.from('contacts').update({ user_id: userId }).eq('id', contact.id);
                }
            } else {
                console.log('[UZAPI WEHOOK REFACTOR] Contact does not exist. Creating...');
                const senderNameRaw = payload.message?.senderName || 'Unknown';
                const { data: newContact, error: createError } = await supabaseClient
                    .from('contacts')
                    .insert({
                        number: chatid,
                        push_name: senderNameRaw,
                        is_group: false,
                        instance_id: instance.id,
                        user_id: userId // Set user_id
                    })
                    .select()
                    .single();

                if (createError) {
                    console.error('[UZAPI WEHOOK REFACTOR] Error creating contact:', createError);
                } else {
                    contact = newContact;
                    console.log('[UZAPI WEHOOK REFACTOR] Contact created:', contact.id);
                }
            }
            contactId = contact?.id;

            // 4. Fetch Chat Details & Update Profile Picture (Individual)
            if (contact) {
                // Set sender info for message
                senderName = contact.push_name;
                senderJid = contact.number;
                senderProfilePicUrl = contact.profile_pic_url;

                const numberOnly = chatid.replace(/\D/g, '');
                // ... (Keep existing image sync logic) ...
                try {
                    const detailsResponse = await fetch('https://clinvia.uazapi.com/chat/details', {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                            'token': instance.apikey
                        },
                        body: JSON.stringify({ number: numberOnly, preview: false })
                    });

                    if (detailsResponse.ok) {
                        const detailsData = await detailsResponse.json();
                        const imagePreviewUrl = detailsData.imagePreview || detailsData[0]?.imagePreview;

                        if (imagePreviewUrl && imagePreviewUrl.startsWith('http')) {
                            try {
                                const imageResponse = await fetch(imagePreviewUrl);
                                if (imageResponse.ok) {
                                    const imageBlob = await imageResponse.blob();
                                    const fileName = `${contact.id}_${Date.now()}.jpg`;

                                    const { data: uploadData, error: uploadError } = await supabaseClient
                                        .storage
                                        .from('avatars')
                                        .upload(fileName, imageBlob, { contentType: 'image/jpeg', upsert: true });

                                    if (!uploadError) {
                                        const { data: publicUrlData } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
                                        const newPicUrl = publicUrlData.publicUrl;
                                        await supabaseClient.from('contacts').update({ profile_pic_url: newPicUrl }).eq('id', contact.id);
                                        senderProfilePicUrl = newPicUrl; // Update local variable
                                    }
                                }
                            } catch (imgError) { console.error('[UZAPI WEHOOK REFACTOR] Exception handling image:', imgError); }
                        }
                    }
                } catch (apiError) { console.error('[UZAPI WEHOOK REFACTOR] Error fetching chat details:', apiError); }
            }
        }

        // 5. Conversation Logic
        if (contactId || groupId) {
            console.log('[UZAPI WEHOOK REFACTOR] Processing Conversation Logic...');

            let query = supabaseClient
                .from('conversations')
                .select('*')
                .eq('instance_id', instance.id)
                .in('status', ['pending', 'open'])
                .order('created_at', { ascending: false })
                .limit(1);

            if (groupId) {
                query = query.eq('group_id', groupId);
            } else if (contactId) {
                query = query.eq('contact_id', contactId);
            }

            const { data: conversations, error: convError } = await query;

            let conversation;
            if (conversations && conversations.length > 0) {
                conversation = conversations[0];
                console.log('[UZAPI WEHOOK REFACTOR] Found existing conversation:', conversation.id);

                // Update conversation
                await supabaseClient
                    .from('conversations')
                    .update({
                        unread_count: (conversation.unread_count || 0) + 1,
                        updated_at: new Date().toISOString(),
                        last_message_at: new Date().toISOString()
                    })
                    .eq('id', conversation.id);
            } else {
                console.log('[UZAPI WEHOOK REFACTOR] No active conversation found. Creating new...');
                const { data: newConversation, error: createConvError } = await supabaseClient
                    .from('conversations')
                    .insert({
                        contact_id: contactId, // Can be null if group
                        group_id: groupId,     // Can be null if individual
                        instance_id: instance.id,
                        user_id: userId,
                        status: 'pending',
                        unread_count: 1,
                        queue_id: instance.default_queue_id, // Assign default queue if set
                        last_message_at: new Date().toISOString()
                    })
                    .select()
                    .single();

                if (createConvError) {
                    console.error('[UZAPI WEHOOK REFACTOR] Error creating conversation:', createConvError);
                } else {
                    conversation = newConversation;
                    console.log('[UZAPI WEHOOK REFACTOR] New conversation created:', conversation.id);
                }
            }

            // 6. Save Message & Handle Media
            if (conversation) {
                const messageType = mapMessageType(payload.message?.messageType || 'conversation');
                const messageText = payload.message?.text || payload.message?.content?.text || payload.body?.message?.text || '';
                const fromMe = payload.message?.fromMe === true;
                const messageId = payload.message?.messageid || payload.message?.id || payload.body?.key?.id;

                let mediaUrl = null;

                // Handle Media Download
                if (['image', 'audio', 'video', 'document'].includes(messageType) && messageId) {
                    console.log(`[UZAPI WEHOOK REFACTOR] Downloading media for message ${messageId} (${messageType})...`);
                    try {
                        const downloadResponse = await fetch('https://clinvia.uazapi.com/message/download', {
                            method: 'POST',
                            headers: {
                                'Accept': 'application/json',
                                'Content-Type': 'application/json',
                                'token': instance.apikey
                            },
                            body: JSON.stringify({
                                id: messageId,
                                return_base64: true,
                                return_link: false
                            })
                        });

                        if (downloadResponse.ok) {
                            const downloadData = await downloadResponse.json();
                            const base64Data = downloadData[0]?.base64Data || downloadData.base64Data;

                            if (base64Data) {
                                const fileBytes = base64ToUint8Array(base64Data);
                                let extension = 'bin';
                                let contentType = 'application/octet-stream';

                                if (messageType === 'image') { extension = 'jpg'; contentType = 'image/jpeg'; }
                                else if (messageType === 'audio') { extension = 'ogg'; contentType = 'audio/ogg'; }
                                else if (messageType === 'video') { extension = 'mp4'; contentType = 'video/mp4'; }
                                else if (messageType === 'document') { extension = 'pdf'; contentType = 'application/pdf'; } // Simplification

                                const fileName = `media/${conversation.id}/${Date.now()}_${messageId}.${extension}`;

                                const { error: uploadError } = await supabaseClient.storage
                                    .from('media') // Assuming 'media' bucket exists
                                    .upload(fileName, fileBytes, { contentType: contentType, upsert: true });

                                if (uploadError) {
                                    console.error('[UZAPI WEHOOK REFACTOR] Error uploading media:', uploadError);
                                } else {
                                    const { data: publicUrlData } = supabaseClient.storage.from('media').getPublicUrl(fileName);
                                    mediaUrl = publicUrlData.publicUrl;
                                    console.log('[UZAPI WEHOOK REFACTOR] Media uploaded:', mediaUrl);
                                }
                            }
                        } else {
                            console.error('[UZAPI WEHOOK REFACTOR] Failed to download media from API:', await downloadResponse.text());
                        }
                    } catch (mediaError) {
                        console.error('[UZAPI WEHOOK REFACTOR] Exception handling media:', mediaError);
                    }
                }

                // Extract contextInfo for quoted/reply messages
                const contextInfo = payload.message?.content?.contextInfo;
                let replyToId = null;
                let quotedBody = null;
                let quotedSender = null;

                if (contextInfo) {
                    replyToId = contextInfo.stanzaID || payload.message?.quoted || null;
                    quotedBody = contextInfo.quotedMessage?.conversation ||
                        contextInfo.quotedMessage?.extendedTextMessage?.text ||
                        null;
                    // Try to determine quoted sender from participant field
                    quotedSender = contextInfo.participant ?
                        (contextInfo.participant.includes('@lid') ? 'Atendente' : 'Cliente') :
                        null;

                    console.log('[UZAPI WEHOOK REFACTOR] Quote detected:');
                    console.log('[UZAPI WEHOOK REFACTOR] - replyToId:', replyToId);
                    console.log('[UZAPI WEHOOK REFACTOR] - quotedBody:', quotedBody);
                    console.log('[UZAPI WEHOOK REFACTOR] - quotedSender:', quotedSender);
                }

                const { data: savedMessage, error: msgError } = await supabaseClient
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
                    console.error('[UZAPI WEHOOK REFACTOR] Error saving message:', msgError);
                } else {
                    console.log('[UZAPI WEHOOK REFACTOR] Message saved successfully.');

                    // Trigger Audio Transcription if applicable
                    if (messageType === 'audio' && mediaUrl && savedMessage) {
                        console.log('[UZAPI WEHOOK REFACTOR] Triggering audio transcription...');
                        console.log('[UZAPI WEHOOK REFACTOR] Message ID:', savedMessage.id);
                        console.log('[UZAPI WEHOOK REFACTOR] Media URL:', mediaUrl);
                        try {
                            const { data: transcribeResult, error: transcribeError } = await supabaseClient.functions.invoke('transcribe-audio', {
                                body: { messageId: savedMessage.id, mediaUrl: mediaUrl }
                            });

                            if (transcribeError) {
                                console.error('[UZAPI WEHOOK REFACTOR] Transcription function error:', transcribeError);
                            } else {
                                console.log('[UZAPI WEHOOK REFACTOR] Transcription result:', JSON.stringify(transcribeResult));
                            }
                        } catch (transcribeError) {
                            console.error('[UZAPI WEHOOK REFACTOR] Exception invoking transcription:', transcribeError);
                        }
                    }

                    // --- SATISFACTION INDEX AUTOMATION ---
                    // Check total message count to trigger AI Analysis every 20 messages
                    try {
                        const { count, error: countError } = await supabaseClient
                            .from('messages')
                            .select('*', { count: 'exact', head: true })
                            .eq('conversation_id', conversation.id);

                        if (!countError && count !== null) {
                            console.log(`[UZAPI WEHOOK REFACTOR] Total messages for conversation ${conversation.id}: ${count}`);

                            // Trigger every 20 messages (20, 40, 60...)
                            if (count > 0 && count % 20 === 0) {
                                console.log('[UZAPI WEHOOK REFACTOR] Triggering AI Satisfaction Analysis (Count % 20 === 0)...');
                                supabaseClient.functions.invoke('ai-analyze-conversation', {
                                    body: { conversationId: conversation.id }
                                }).catch((err: any) => {
                                    console.error('[UZAPI WEHOOK REFACTOR] Failed to trigger AI analysis:', err);
                                });
                            }
                        } else {
                            console.error('[UZAPI WEHOOK REFACTOR] Error counting messages:', countError);
                        }
                    } catch (countErr) {
                        console.error('[UZAPI WEHOOK REFACTOR] Exception checking message count:', countErr);
                    }

                    // --- AUTO FOLLOW UP RESET ---
                    // If this is an inbound message (from client), reset auto follow up
                    if (!fromMe && conversation.id) {
                        try {
                            console.log('[UZAPI WEHOOK REFACTOR] Checking auto follow up reset for conversation:', conversation.id);

                            // Get follow up for this conversation
                            const { data: followUp } = await supabaseClient
                                .from('conversation_follow_ups')
                                .select('id, category_id, auto_send')
                                .eq('conversation_id', conversation.id)
                                .single();

                            if (followUp && followUp.auto_send) {
                                console.log('[UZAPI WEHOOK REFACTOR] Active auto follow up found. Resetting...');

                                // Get first template's time_minutes
                                const { data: templates } = await supabaseClient
                                    .from('follow_up_templates')
                                    .select('time_minutes')
                                    .eq('category_id', followUp.category_id)
                                    .order('time_minutes', { ascending: true })
                                    .limit(1);

                                if (templates && templates.length > 0) {
                                    const firstTemplateMinutes = templates[0].time_minutes;
                                    const nextSendAt = new Date(Date.now() + firstTemplateMinutes * 60 * 1000);

                                    // Reset to first template
                                    await supabaseClient
                                        .from('conversation_follow_ups')
                                        .update({
                                            current_template_index: 0,
                                            next_send_at: nextSendAt.toISOString(),
                                            completed: false
                                        })
                                        .eq('id', followUp.id);

                                    console.log('[UZAPI WEHOOK REFACTOR] Auto follow up reset. Next send at:', nextSendAt.toISOString());
                                }
                            }
                        } catch (followUpErr) {
                            console.error('[UZAPI WEHOOK REFACTOR] Error resetting auto follow up:', followUpErr);
                        }
                    }
                }
            }
        }

        // 7. Forward to External Webhook (if configured)
        // ONLY forward 'messages' type events, NOT 'messages_update' or other types
        if (instance.webhook_url && eventType === 'messages') {
            console.log('[UZAPI WEHOOK REFACTOR] Forwarding to external webhook:', instance.webhook_url);
            try {
                // Forward the parsed payload (or rawBody if preferred, but payload is safer JSON)
                await fetch(instance.webhook_url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Supabase-Webhook-Proxy/1.0'
                    },
                    body: JSON.stringify(payload)
                });
                console.log('[UZAPI WEHOOK REFACTOR] Successfully forwarded to external webhook');
            } catch (forwardError) {
                console.error('[UZAPI WEHOOK REFACTOR] Failed to forward to external webhook:', forwardError);
            }
        } else if (instance.webhook_url && eventType !== 'messages') {
            console.log('[UZAPI WEHOOK REFACTOR] Skipping external webhook for event type:', eventType);
        }

        return new Response(
            JSON.stringify({ success: true, message: "Processed" }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            }
        );
    } catch (error: any) {
        console.error('[UZAPI WEHOOK REFACTOR] Error processing request:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500
            }
        );
    }
});
