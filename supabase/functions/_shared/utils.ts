/**
 * Shared Utilities for Webhook Functions
 * 
 * Este módulo contém funções e constantes compartilhadas entre
 * webhook-handle-message e webhook-handle-status.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Mapeia tipos de mensagem do UZAPI para tipos internos
 */
export const mapMessageType = (uzapiType: string): string => {
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

/**
 * Converte base64 para Uint8Array para upload de arquivos
 */
export function base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

/**
 * Cria cliente Supabase com service role key
 */
export function createSupabaseClient(): SupabaseClient {
    return createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
}

/**
 * Extrai informações da instância do banco de dados
 */
export async function getInstanceByName(supabase: SupabaseClient, instanceName: string) {
    const { data: instance, error } = await supabase
        .from('instances')
        .select('id, apikey, user_id, webhook_url, default_queue_id, ia_on_wpp')
        .eq('instance_name', instanceName)
        .single();

    if (error || !instance) {
        console.error('[SHARED] Instance not found:', instanceName, error);
        return null;
    }

    return instance;
}

/**
 * Faz download de mídia da API UZAPI
 */
export async function downloadMediaFromUzapi(
    apiKey: string,
    messageId: string,
    messageType: string,
    supabase: SupabaseClient,
    conversationId: string,
    originalFileName?: string
): Promise<string | null> {
    try {
        // 🔍 DEBUG: Log parameters received
        console.log('[SHARED] 🔍 downloadMediaFromUzapi CALLED:');
        console.log('[SHARED] 🔍   → messageId:', messageId);
        console.log('[SHARED] 🔍   → messageType:', messageType);
        console.log('[SHARED] 🔍   → originalFileName:', originalFileName);

        const downloadResponse = await fetch('https://clinvia.uazapi.com/message/download', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'token': apiKey
            },
            body: JSON.stringify({
                id: messageId,
                return_base64: true,
                return_link: false
            })
        });

        if (!downloadResponse.ok) {
            console.error('[SHARED] Failed to download media:', await downloadResponse.text());
            return null;
        }

        const downloadData = await downloadResponse.json();
        const rawBase64 = downloadData[0]?.base64Data || downloadData.base64Data;

        if (!rawBase64) {
            console.error('[SHARED] No base64 data in response');
            return null;
        }

        // SANITIZATION: Clean up base64 string
        const cleanBase64 = rawBase64.replace(/^data:.*?;base64,/, '').replace(/[\r\n]/g, '');
        const fileBytes = base64ToUint8Array(cleanBase64);

        // DEFAULT fallbacks
        let extension = 'bin';
        let contentType = 'application/octet-stream';

        // DETECT EXTENSION AND MIMETYPE from originalFileName first
        if (originalFileName && originalFileName.includes('.')) {
            const extractedExt = originalFileName.split('.').pop()?.toLowerCase() || '';

            // Comprehensive extension to MIME type mapping
            const extensionToMimeType: Record<string, string> = {
                // Documents
                'pdf': 'application/pdf',
                'doc': 'application/msword',
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'xls': 'application/vnd.ms-excel',
                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'ppt': 'application/vnd.ms-powerpoint',
                'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'txt': 'text/plain',
                'md': 'text/markdown',
                'csv': 'text/csv',
                'rtf': 'application/rtf',
                // Images
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'gif': 'image/gif',
                'bmp': 'image/bmp',
                'webp': 'image/webp',
                'svg': 'image/svg+xml',
                // Audio
                'mp3': 'audio/mpeg',
                'ogg': 'audio/ogg',
                'wav': 'audio/wav',
                'm4a': 'audio/mp4',
                'aac': 'audio/aac',
                // Video
                'mp4': 'video/mp4',
                'avi': 'video/x-msvideo',
                'mov': 'video/quicktime',
                'wmv': 'video/x-ms-wmv',
                'flv': 'video/x-flv',
                'webm': 'video/webm',
                // Archives
                'zip': 'application/zip',
                'rar': 'application/x-rar-compressed',
                '7z': 'application/x-7z-compressed',
                'tar': 'application/x-tar',
                'gz': 'application/gzip'
            };

            extension = extractedExt;
            contentType = extensionToMimeType[extractedExt] || 'application/octet-stream';

            console.log(`[SHARED] Detected from filename: ext=${extension}, type=${contentType}`);
        } else {
            // FALLBACK: Use messageType as hint
            if (messageType === 'image') { extension = 'jpg'; contentType = 'image/jpeg'; }
            else if (messageType === 'audio') { extension = 'ogg'; contentType = 'audio/ogg'; }
            else if (messageType === 'video') { extension = 'mp4'; contentType = 'video/mp4'; }
            else if (messageType === 'document') { extension = 'pdf'; contentType = 'application/pdf'; }

            console.log(`[SHARED] Using fallback: ext=${extension}, type=${contentType}`);
        }

        // FILENAME LOGIC
        let finalName = `${Date.now()}_${messageId}.${extension}`;
        if (originalFileName) {
            const safeName = originalFileName.normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9.-]/g, '_');
            finalName = `${Date.now()}_${safeName}`;
        }

        const fileName = `media/${conversationId}/${finalName}`;

        const { error: uploadError } = await supabase.storage
            .from('media')
            .upload(fileName, fileBytes, {
                contentType: contentType,
                cacheControl: '3600',
                upsert: true
            });

        if (uploadError) {
            console.error('[SHARED] Error uploading media:', uploadError);
            return null;
        }

        console.log('[SHARED] ✅ Upload successful! File path:', fileName);

        const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(fileName);

        console.log('[SHARED] ✅ Public URL generated:', publicUrlData.publicUrl);
        console.log('[SHARED] ✅ Returning URL to webhook-handle-message');

        return publicUrlData.publicUrl;

    } catch (error) {
        console.error('[SHARED] Exception downloading media:', error);
        return null;
    }
}

/**
 * Busca detalhes de chat (foto de perfil) da API UZAPI
 */
export async function fetchChatDetails(apiKey: string, number: string): Promise<string | null> {
    try {
        const response = await fetch('https://clinvia.uazapi.com/chat/details', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'token': apiKey
            },
            body: JSON.stringify({ number: number.replace(/\D/g, ''), preview: false })
        });

        if (!response.ok) return null;

        const data = await response.json();
        return data.imagePreview || data[0]?.imagePreview || null;

    } catch (error) {
        console.error('[SHARED] Error fetching chat details:', error);
        return null;
    }
}
