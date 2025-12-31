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
        console.log('[INSTAGRAM SEND] Payload:', JSON.stringify(payload));

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
            recipient_id: legacyRecipientId
        } = payload;

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
        // Build message payload based on type
        // =============================================
        const apiUrl = `https://graph.instagram.com/v21.0/me/messages`;
        let messagePayload: any;
        let messageBody = '';

        if (message_type === 'audio') {
            // Audio message via attachment
            messagePayload = {
                recipient: { id: recipientId },
                message: {
                    attachment: {
                        type: 'audio',
                        payload: {
                            url: finalAudioUrl,
                            is_reusable: false
                        }
                    }
                }
            };
            messageBody = '[Áudio]';
            console.log('[INSTAGRAM SEND] Sending audio message');
        } else if (message_type === 'image') {
            // Image message via attachment
            messagePayload = {
                recipient: { id: recipientId },
                message: {
                    attachment: {
                        type: 'image',
                        payload: {
                            url: image_url,
                            is_reusable: false
                        }
                    }
                }
            };
            messageBody = '[Imagem]';
            console.log('[INSTAGRAM SEND] Sending image message');
        } else {
            // Text message
            messagePayload = {
                recipient: { id: recipientId },
                message: { text: message_text }
            };
            messageBody = message_text || '';
            console.log('[INSTAGRAM SEND] Sending text message');
        }

        console.log('[INSTAGRAM SEND] Sending to API:', apiUrl);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${instance.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(messagePayload)
        });

        const responseData = await response.json();
        console.log('[INSTAGRAM SEND] API Response:', JSON.stringify(responseData));

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
                console.log('[INSTAGRAM SEND] Message saved to database');

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
