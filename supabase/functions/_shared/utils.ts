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

        let extension = 'bin';
        let contentType = 'application/octet-stream';

        if (messageType === 'image') { extension = 'jpg'; contentType = 'image/jpeg'; }
        else if (messageType === 'audio') { extension = 'ogg'; contentType = 'audio/ogg'; }
        else if (messageType === 'video') { extension = 'mp4'; contentType = 'video/mp4'; }
        else if (messageType === 'document') { extension = 'pdf'; contentType = 'application/pdf'; }

        // FILENAME LOGIC
        let finalName = `${Date.now()}_${messageId}.${extension}`;
        if (originalFileName) {
            const safeName = originalFileName.normalize('NFD').replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9.-]/g, '_');
            finalName = `${Date.now()}_${safeName}`;
            // Append extension if missing (heuristic)
            if (!finalName.toLowerCase().endsWith('.' + extension) && !originalFileName.includes('.')) {
                finalName += `.${extension}`;
            }
        }

        const fileName = `media/${conversationId}/${finalName}`;

        const { error: uploadError } = await supabase.storage
            .from('media')
            .upload(fileName, fileBytes, { contentType: contentType, upsert: true });

        if (uploadError) {
            console.error('[SHARED] Error uploading media:', uploadError);
            return null;
        }

        const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(fileName);
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
