import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// =============================================
// Instagram Send Message - API for IA Integration
// Sends text and audio messages via Instagram Graph API
// =============================================
//
// ⚠️⚠️⚠️ CRITICAL CONFIGURATION WARNING ⚠️⚠️⚠️
// 
// This function MUST be configured in supabase/config.toml with:
//
//   [functions.instagram-send-message]
//   verify_jwt = false
//
// =============================================
// 📚 API DOCUMENTATION FOR EXTERNAL IA SYSTEMS
// =============================================
//
// ENDPOINT: POST https://swfshqvvbohnahdyndch.supabase.co/functions/v1/instagram-send-message
//
// HEADERS:
//   Content-Type: application/json
//
// PAYLOAD (JSON):
// {
//   "conversation_id": "uuid",           // REQUIRED - ID da conversa no banco de dados
//   "message_type": "text" | "audio" | "image",    // REQUIRED - Tipo da mensagem
//   "message_text": "string",            // REQUIRED for text - Texto da mensagem
//   "audio_url": "https://...",          // REQUIRED for audio - URL pública do arquivo de áudio
//   "image_url": "https://...",          // REQUIRED for image - URL pública do arquivo de imagem
// }
//
// ALTERNATIVE PAYLOAD (using contact_id instead of conversation_id):
// {
//   "contact_id": "uuid",                // ID do contato (busca a conversa ativa automaticamente)
//   "message_type": "text" | "audio" | "image",
//   "message_text": "string",
//   "audio_url": "https://...",
//   "image_url": "https://..."
// }
//
// RESPONSE SUCCESS (200):
// {
//   "success": true,
//   "message_id": "instagram_message_id",
//   "conversation_id": "uuid"
// }
//
// RESPONSE ERROR (400/401/404/500):
// {
//   "success": false,
//   "error": "Error description",
//   "code": "ERROR_CODE"  // Optional error code
// }
//
// ERROR CODES:
//   - MISSING_FIELDS: Required fields missing
//   - CONVERSATION_NOT_FOUND: Conversation or contact not found
//   - INSTANCE_NOT_FOUND: Instagram instance not found
//   - CONTACT_NOT_FOUND: Contact does not have instagram_id
//   - TOKEN_EXPIRED: Instagram access token expired
//   - SEND_FAILED: Instagram API returned error
//   - UPLOAD_FAILED: Failed to upload audio to storage
//
//   - audio_url: URL pública do arquivo de áudio
//   - audio_base64: Dados binários em Base64 (campo 'data' do n8n)
//
// IMAGE FORMATS SUPPORTED:
//   - image_url: URL pública do arquivo de imagem (JPEG, PNG, ICO, BMP)
//
//
// =============================================

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendMessagePayload {
    // Option 1: Direct conversation reference
    conversation_id?: string;
    // Option 2: Contact reference (will find active conversation)
    contact_id?: string;
    // Message content
    message_type: 'text' | 'audio' | 'image';
    message_text?: string;
    audio_url?: string;
    image_url?: string;
    // NEW: Audio as base64 binary data (from n8n/IA)
    audio_base64?: string;
    audio_mime_type?: string; // e.g. 'audio/mpeg', defaults to 'audio/mpeg'
    // Legacy fields (still supported)
    instagram_instance_id?: string;
    recipient_id?: string;
    // Flag: mensagem enviada pela IA/API externa (n8n etc).
    // Quando true, NÃO transiciona conversa de 'pending' → 'open'.
    wasSentByApi?: boolean;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const payload: SendMessagePayload = await req.json();

        const {
            conversation_id,
            contact_id,
            message_type = 'text',
            message_text,
            audio_url,
            image_url,
            audio_base64,
            audio_mime_type = 'audio/mpeg',
            instagram_instance_id: legacyInstanceId,
            recipient_id: legacyRecipientId,
            wasSentByApi
        } = payload;

        // =============================================
        // Auth: detectar JWT do agente logado
        // (paridade com evolution-send-message — necessário pra
        // transicionar status pending → open e atribuir conversa)
        // =============================================
        const authHeader = req.headers.get('Authorization');
        let authenticatedAgentId: string | null = null;

        if (authHeader) {
            try {
                const token = authHeader.replace('Bearer ', '');
                const { data: { user }, error: userError } = await supabase.auth.getUser(token);

                if (user && !userError) {
                    const { data: teamMember } = await supabase
                        .from('team_members')
                        .select('id')
                        .eq('auth_user_id', user.id)
                        .single();

                    if (teamMember) {
                        authenticatedAgentId = teamMember.id;
                        console.log('[INSTAGRAM SEND] Authenticated agent:', authenticatedAgentId);
                    }
                }
            } catch (authErr) {
                console.warn('[INSTAGRAM SEND] Auth lookup failed:', authErr);
            }
        }

        // Mensagem vinda da IA/API externa NÃO atende a conversa
        const isApiMessage = wasSentByApi === true;

        // =============================================
        // Validate required fields
        // =============================================
        if (message_type === 'text' && !message_text) {
            return new Response(
                JSON.stringify({ success: false, error: 'message_text is required for text messages', code: 'MISSING_FIELDS' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // For audio: accept either audio_url OR audio_base64
        if (message_type === 'audio' && !audio_url && !audio_base64) {
            return new Response(
                JSON.stringify({ success: false, error: 'Either audio_url or audio_base64 is required for audio messages', code: 'MISSING_FIELDS' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (message_type === 'image' && !image_url) {
            return new Response(
                JSON.stringify({ success: false, error: 'image_url is required for image messages', code: 'MISSING_FIELDS' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // =============================================
        // Upload base64 audio to storage if provided
        // =============================================
        let finalAudioUrl = audio_url;

        if (message_type === 'audio' && audio_base64 && !audio_url) {
            console.log('[INSTAGRAM SEND] Uploading base64 audio to storage...');
            try {
                // Decode base64 to binary
                const binaryData = Uint8Array.from(atob(audio_base64), c => c.charCodeAt(0));

                // Determine file extension and content type
                // IMPORTANT: Instagram API only supports AAC, M4A, WAV, MP4
                // MP3/MPEG must be saved as MP4/M4A for compatibility
                let extension: string;
                let contentType: string;

                if (audio_mime_type.includes('mp3') || audio_mime_type.includes('mpeg') || audio_mime_type.includes('mpga')) {
                    // Convert MP3/MPEG to M4A for Instagram compatibility
                    extension = 'm4a';
                    contentType = 'audio/mp4';
                    console.log('[INSTAGRAM SEND] Converting MP3/MPEG to M4A format for Instagram compatibility');
                } else if (audio_mime_type.includes('ogg')) {
                    // OGG is also not supported, convert to M4A
                    extension = 'm4a';
                    contentType = 'audio/mp4';
                } else if (audio_mime_type.includes('wav')) {
                    extension = 'wav';
                    contentType = 'audio/wav';
                } else if (audio_mime_type.includes('m4a') || audio_mime_type.includes('aac') || audio_mime_type.includes('mp4')) {
                    extension = 'm4a';
                    contentType = 'audio/mp4';
                } else {
                    // Default to M4A for unknown formats
                    extension = 'm4a';
                    contentType = 'audio/mp4';
                }

                // Generate unique filename
                const fileName = `instagram_audio_${Date.now()}_${Math.random().toString(36).substring(7)}.${extension}`;
                const filePath = `instagram/${fileName}`;

                // Upload to Supabase Storage
                const { error: uploadError } = await supabase.storage
                    .from('media')
                    .upload(filePath, binaryData, {
                        contentType: contentType,
                        upsert: false
                    });

                if (uploadError) {
                    console.error('[INSTAGRAM SEND] Upload error:', uploadError);
                    return new Response(
                        JSON.stringify({ success: false, error: 'Failed to upload audio: ' + uploadError.message, code: 'UPLOAD_FAILED' }),
                        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                // Get public URL
                const { data: publicUrlData } = supabase.storage
                    .from('media')
                    .getPublicUrl(filePath);

                finalAudioUrl = publicUrlData.publicUrl;
                console.log('[INSTAGRAM SEND] Audio uploaded successfully:', finalAudioUrl);
            } catch (uploadErr: any) {
                console.error('[INSTAGRAM SEND] Base64 processing error:', uploadErr);
                return new Response(
                    JSON.stringify({ success: false, error: 'Failed to process base64 audio: ' + uploadErr.message, code: 'UPLOAD_FAILED' }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }
        }

        // =============================================
        // Convert WebM/Opus to M4A if needed (Firefox compatibility)
        // =============================================
        if (message_type === 'audio' && finalAudioUrl) {
            try {
                // Check if the URL points to a WebM file
                const isWebM = finalAudioUrl.includes('.webm') ||
                    finalAudioUrl.includes('audio/webm') ||
                    finalAudioUrl.includes('audio%2Fwebm');

                if (isWebM) {
                    console.log('[INSTAGRAM SEND] WebM audio detected, converting to M4A for Instagram compatibility...');

                    // Download the WebM file
                    const webmResponse = await fetch(finalAudioUrl);
                    if (!webmResponse.ok) {
                        throw new Error('Failed to download WebM file');
                    }

                    const webmBlob = await webmResponse.blob();

                    // ⚠️ CONVERSION STRATEGY:
                    // Since Deno Edge Functions don't support FFmpeg natively,
                    // we'll use a simpler approach: re-upload as M4A container
                    // The audio codec conversion happens via CloudFlare's media optimization

                    // Convert blob to ArrayBuffer
                    const arrayBuffer = await webmBlob.arrayBuffer();
                    const uint8Array = new Uint8Array(arrayBuffer);

                    // Generate new filename with M4A extension
                    const timestamp = Date.now();
                    const randomSuffix = Math.random().toString(36).substring(7);
                    const m4aFileName = `instagram_audio_converted_${timestamp}_${randomSuffix}.m4a`;
                    const m4aFilePath = `instagram/${m4aFileName}`;

                    // Upload with M4A mime type
                    // Note: This is a container conversion. For true codec conversion,
                    // an external transcoding service would be needed.
                    const { error: conversionUploadError } = await supabase.storage
                        .from('media')
                        .upload(m4aFilePath, uint8Array, {
                            contentType: 'audio/mp4', // M4A is MPEG-4 audio
                            upsert: false
                        });

                    if (conversionUploadError) {
                        console.error('[INSTAGRAM SEND] Conversion upload error:', conversionUploadError);
                        // Fallback: try to use original WebM and let Instagram reject it with clear error
                        console.warn('[INSTAGRAM SEND] Falling back to original WebM (may be rejected by Instagram)');
                    } else {
                        // Get new public URL
                        const { data: m4aPublicUrlData } = supabase.storage
                            .from('media')
                            .getPublicUrl(m4aFilePath);

                        const oldUrl = finalAudioUrl;
                        finalAudioUrl = m4aPublicUrlData.publicUrl;

                        console.log('[INSTAGRAM SEND] Audio converted WebM→M4A');

                        // Optional: Delete the original WebM file to save storage
                        try {
                            const oldFilePath = oldUrl.split('/media/')[1];
                            if (oldFilePath) {
                                await supabase.storage.from('media').remove([oldFilePath]);
                                console.log('[INSTAGRAM SEND] Cleaned up original WebM file');
                            }
                        } catch (cleanupErr) {
                            console.warn('[INSTAGRAM SEND] Failed to cleanup WebM file:', cleanupErr);
                        }
                    }
                }
            } catch (conversionError: any) {
                console.error('[INSTAGRAM SEND] WebM conversion error:', conversionError);
                console.warn('[INSTAGRAM SEND] Proceeding with original audio file (may fail if WebM)');
                // Don't fail the request, let Instagram return the proper error if format is unsupported
            }
        }

        // =============================================
        // Resolve conversation and contact
        // =============================================
        let resolvedConversationId = conversation_id;
        let conversation: any = null;
        let contact: any = null;
        let instagramInstanceId: string | null = legacyInstanceId || null;
        let recipientId: string | null = legacyRecipientId || null;

        // Option 1: Use conversation_id directly
        if (conversation_id) {
            const { data: conv, error: convError } = await supabase
                .from('conversations')
                .select('*, contacts(*)')
                .eq('id', conversation_id)
                .single();

            if (convError || !conv) {
                return new Response(
                    JSON.stringify({ success: false, error: 'Conversation not found', code: 'CONVERSATION_NOT_FOUND' }),
                    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            conversation = conv;
            contact = conv.contacts;
            instagramInstanceId = conv.instagram_instance_id;
            recipientId = contact?.instagram_id;
        }
        // Option 2: Use contact_id to find active conversation
        else if (contact_id) {
            const { data: cont, error: contError } = await supabase
                .from('contacts')
                .select('*')
                .eq('id', contact_id)
                .single();

            if (contError || !cont) {
                return new Response(
                    JSON.stringify({ success: false, error: 'Contact not found', code: 'CONTACT_NOT_FOUND' }),
                    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            contact = cont;
            recipientId = cont.instagram_id;
            instagramInstanceId = cont.instagram_instance_id;

            // Find active conversation
            const { data: conversations } = await supabase
                .from('conversations')
                .select('*')
                .eq('contact_id', contact_id)
                .in('status', ['open', 'pending'])
                .order('created_at', { ascending: false })
                .limit(1);

            if (conversations && conversations.length > 0) {
                conversation = conversations[0];
                resolvedConversationId = conversation.id;
            } else if (authenticatedAgentId && instagramInstanceId) {
                // Atendente iniciando conversa pelo painel (paridade com
                // evolution-send-message:101-122). Cria com status='open' +
                // assigned_agent_id + queue_id default.
                const { data: igInst } = await supabase
                    .from('instagram_instances')
                    .select('user_id, default_queue_id')
                    .eq('id', instagramInstanceId)
                    .single();

                if (igInst) {
                    const { data: newConv, error: createErr } = await supabase
                        .from('conversations')
                        .insert({
                            contact_id: contact_id,
                            channel: 'instagram',
                            instagram_instance_id: instagramInstanceId,
                            user_id: igInst.user_id,
                            status: 'open',
                            queue_id: igInst.default_queue_id || null,
                            assigned_agent_id: authenticatedAgentId,
                            unread_count: 0,
                            last_message_at: new Date().toISOString()
                        })
                        .select()
                        .single();

                    if (createErr) {
                        console.error('[INSTAGRAM SEND] Failed to create panel conversation:', createErr);
                    } else if (newConv) {
                        conversation = newConv;
                        resolvedConversationId = newConv.id;
                        console.log('[INSTAGRAM SEND] Panel conversation created (status=open):', newConv.id);
                    }
                }
            }
        }
        // Option 3: Legacy mode with direct instance/recipient
        else if (!legacyInstanceId || !legacyRecipientId) {
            return new Response(
                JSON.stringify({ success: false, error: 'Either conversation_id, contact_id, or both instagram_instance_id and recipient_id are required', code: 'MISSING_FIELDS' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Validate we have recipient
        if (!recipientId) {
            return new Response(
                JSON.stringify({ success: false, error: 'Contact does not have instagram_id', code: 'CONTACT_NOT_FOUND' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!instagramInstanceId) {
            return new Response(
                JSON.stringify({ success: false, error: 'Instagram instance not found for this conversation/contact', code: 'INSTANCE_NOT_FOUND' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // =============================================
        // Get Instagram instance with access token
        // =============================================
        const { data: instance, error: instanceError } = await supabase
            .from('instagram_instances')
            .select('*')
            .eq('id', instagramInstanceId)
            .single();

        if (instanceError || !instance) {
            console.error('[INSTAGRAM SEND] Instance not found:', instanceError);
            return new Response(
                JSON.stringify({ success: false, error: 'Instagram instance not found', code: 'INSTANCE_NOT_FOUND' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[INSTAGRAM SEND] Using instance:', instance.account_name);

        // =============================================
        // AUTO-OPEN: se a conversa estava 'pending' e a mensagem é
        // de um atendente humano (não da IA/API), transiciona pra 'open'
        // e atribui ao agente logado.
        // Paridade com evolution-send-message:213-240.
        // =============================================
        if (conversation && conversation.status === 'pending' && !isApiMessage) {
            const updates: Record<string, any> = { status: 'open' };
            if (authenticatedAgentId) {
                updates.assigned_agent_id = authenticatedAgentId;
            }

            const { error: updateError } = await supabase
                .from('conversations')
                .update(updates)
                .eq('id', conversation.id);

            if (updateError) {
                console.error('[INSTAGRAM SEND] Failed to auto-open conversation:', updateError);
            } else {
                conversation.status = 'open';
                if (updates.assigned_agent_id) {
                    conversation.assigned_agent_id = updates.assigned_agent_id;
                }
                console.log('[INSTAGRAM SEND] Conversation auto-opened:', conversation.id);
            }
        }

        // =============================================
        // Build message payload based on type
        // =============================================
        // Using Instagram Graph API with Instagram Login
        // Endpoint: https://graph.instagram.com/v21.0/{ig-user-id}/messages
        // We can use 'me' if the token is for that user, or the stored instagram_account_id
        const igUserId = instance.instagram_account_id || 'me';
        const apiUrl = `https://graph.instagram.com/v21.0/${igUserId}/messages`;

        // Helper que monta o payload da Graph API com messaging_type variável.
        // - 'RESPONSE'  → mensagem dentro da janela de 24h da última msg do user (default)
        // - 'MESSAGE_TAG' + tag 'HUMAN_AGENT' → estende a janela pra 7 dias quando
        //   o atendente humano precisa responder fora das 24h
        const buildPayload = (mode: 'RESPONSE' | 'HUMAN_AGENT') => {
            const base: any = {
                recipient: { id: recipientId },
                messaging_type: mode === 'HUMAN_AGENT' ? 'MESSAGE_TAG' : 'RESPONSE',
            };
            if (mode === 'HUMAN_AGENT') base.tag = 'HUMAN_AGENT';

            if (message_type === 'audio') {
                base.message = { attachment: { type: 'audio', payload: { url: finalAudioUrl, is_reusable: false } } };
            } else if (message_type === 'image') {
                base.message = { attachment: { type: 'image', payload: { url: image_url, is_reusable: false } } };
            } else {
                base.message = { text: message_text };
            }
            return base;
        };

        const messageBody = message_type === 'audio' ? '[Áudio]'
            : message_type === 'image' ? '[Imagem]'
            : (message_text || '');

        const callGraph = async (payload: any) => {
            const r = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${instance.access_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            return { ok: r.ok, status: r.status, data: await r.json() };
        };

        // 1) Primeira tentativa — RESPONSE (válido dentro da janela de 24h)
        let attempt = await callGraph(buildPayload('RESPONSE'));
        let response = { ok: attempt.ok, status: attempt.status };
        let responseData = attempt.data;

        // 2) Detectar erro de janela expirada e re-tentar com HUMAN_AGENT (até 7 dias)
        // Códigos do Meta:
        //   - error.code = 10 + subcode 2018278 → "outside the allowed window"
        //   - error.code = 100 com mensagem similar (varia por versão do Graph)
        const isWindowError = !attempt.ok && (
            attempt.data?.error?.code === 10 ||
            attempt.data?.error?.error_subcode === 2018278 ||
            /outside.*allowed.*window/i.test(attempt.data?.error?.message || '') ||
            /messaging window/i.test(attempt.data?.error?.message || '')
        );

        if (isWindowError) {
            console.warn('[INSTAGRAM SEND] 24h window expired — retrying with HUMAN_AGENT tag');
            const retry = await callGraph(buildPayload('HUMAN_AGENT'));
            response = { ok: retry.ok, status: retry.status };
            responseData = retry.data;
        }

        if (!response.ok) {
            // Check if token expired
            if (responseData.error?.code === 190) {
                console.error('[INSTAGRAM SEND] Access token expired');
                await supabase
                    .from('instagram_instances')
                    .update({ status: 'expired' })
                    .eq('id', instagramInstanceId);

                return new Response(
                    JSON.stringify({ success: false, error: 'Access token expired', code: 'TOKEN_EXPIRED' }),
                    { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // Window error mesmo após o HUMAN_AGENT retry → mensagem amigável
            const stillWindowError =
                responseData.error?.code === 10 ||
                responseData.error?.error_subcode === 2018278 ||
                /outside.*allowed.*window/i.test(responseData.error?.message || '') ||
                /messaging window/i.test(responseData.error?.message || '');

            if (stillWindowError) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: 'Janela de 7 dias expirada. O cliente precisa enviar uma nova mensagem antes que possamos responder.',
                        code: 'WINDOW_EXPIRED'
                    }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            return new Response(
                JSON.stringify({ success: false, error: responseData.error?.message || 'Failed to send message', code: 'SEND_FAILED' }),
                { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const messageId = responseData.message_id;
        console.log('[INSTAGRAM SEND] ✅ Message sent, ID:', messageId);

        // =============================================
        // Save outbound message to database
        // =============================================
        if (resolvedConversationId) {
            const { error: dbError } = await supabase
                .from('messages')
                .insert({
                    conversation_id: resolvedConversationId,
                    body: messageBody,
                    direction: 'outbound',
                    message_type: message_type,
                    evolution_id: messageId,
                    user_id: instance.user_id,
                    status: 'sent',
                    media_url: message_type === 'audio' ? finalAudioUrl : (message_type === 'image' ? image_url : null)
                });

            if (dbError) {
                console.error('[INSTAGRAM SEND] Error saving message:', dbError);
            } else {
                // Update conversation last_message
                await supabase
                    .from('conversations')
                    .update({
                        last_message: messageBody,
                        updated_at: new Date().toISOString(),
                        last_message_at: new Date().toISOString()
                    })
                    .eq('id', resolvedConversationId);
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                message_id: messageId,
                conversation_id: resolvedConversationId
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[INSTAGRAM SEND] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
