/**
 * Shared Utilities for Webhook Functions
 *
 * Este módulo contém funções e constantes compartilhadas entre
 * webhook-handle-message e webhook-handle-status.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";
import { encode as hexEncode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

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
        'stickermessage': 'sticker',
        'sticker': 'sticker',
        'reactionmessage': 'reaction',
        'reaction': 'reaction',
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
        .select('id, apikey, user_id, webhook_url, default_queue_id, ia_on_wpp, auto_create_deal_funnel_id')
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
            else if (messageType === 'sticker') { extension = 'webp'; contentType = 'image/webp'; }

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

// ============================================
// 🔒 SEGURANÇA — HMAC Validation
// ============================================

/**
 * Valida assinatura HMAC-SHA256 de webhooks (UZAPI/Evolution API)
 * Compara o header de assinatura com o HMAC calculado do body.
 *
 * @param rawBody - Body bruto da requisição (string)
 * @param signatureHeader - Valor do header de assinatura (ex: sha256=abc123...)
 * @param secret - Secret compartilhado para validação
 * @returns true se válido, false se inválido
 */
export async function validateWebhookHMAC(
    rawBody: string,
    signatureHeader: string | null,
    secret: string
): Promise<boolean> {
    if (!signatureHeader || !secret) {
        return false;
    }

    try {
        // Remove prefixo "sha256=" se presente
        const providedSignature = signatureHeader.replace(/^sha256=/, '');

        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        const signature = await crypto.subtle.sign(
            'HMAC',
            key,
            new TextEncoder().encode(rawBody)
        );

        const computedHex = new TextDecoder().decode(hexEncode(new Uint8Array(signature)));

        // Comparação constante (timing-safe)
        if (computedHex.length !== providedSignature.length) return false;
        let result = 0;
        for (let i = 0; i < computedHex.length; i++) {
            result |= computedHex.charCodeAt(i) ^ providedSignature.charCodeAt(i);
        }
        return result === 0;
    } catch (error) {
        console.error('[SHARED] HMAC validation error:', error);
        return false;
    }
}

/**
 * Valida assinatura HMAC-SHA1 do Meta (Facebook/Instagram webhooks)
 * Meta envia header X-Hub-Signature com formato sha1=<hex>
 *
 * @param rawBody - Body bruto da requisição
 * @param signatureHeader - Valor do X-Hub-Signature header
 * @param appSecret - App Secret do Facebook App
 * @returns true se válido
 */
export async function validateMetaWebhookSignature(
    rawBody: string,
    signatureHeader: string | null,
    appSecret: string
): Promise<boolean> {
    if (!signatureHeader || !appSecret) {
        return false;
    }

    try {
        const providedSignature = signatureHeader.replace(/^sha1=/, '');

        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(appSecret),
            { name: 'HMAC', hash: 'SHA-1' },
            false,
            ['sign']
        );

        const signature = await crypto.subtle.sign(
            'HMAC',
            key,
            new TextEncoder().encode(rawBody)
        );

        const computedHex = new TextDecoder().decode(hexEncode(new Uint8Array(signature)));

        // Timing-safe comparison
        if (computedHex.length !== providedSignature.length) return false;
        let result = 0;
        for (let i = 0; i < computedHex.length; i++) {
            result |= computedHex.charCodeAt(i) ^ providedSignature.charCodeAt(i);
        }
        return result === 0;
    } catch (error) {
        console.error('[SHARED] Meta HMAC-SHA1 validation error:', error);
        return false;
    }
}

// ============================================
// 🛡️ RATE LIMITING — In-memory por IP/instanceName
// ============================================

interface RateLimitEntry {
    count: number;
    resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Rate limiter simples em memória.
 * Limita requisições por chave (IP, instanceName, etc).
 *
 * @param key - Identificador único (IP, instance name, etc)
 * @param maxRequests - Máximo de requests no período (default: 120)
 * @param windowMs - Janela em milissegundos (default: 60000 = 1 minuto)
 * @returns true se permitido, false se bloqueado
 */
export function checkRateLimit(
    key: string,
    maxRequests: number = 120,
    windowMs: number = 60000
): boolean {
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    // Limpa entries expirados periodicamente (a cada 100 checks)
    if (rateLimitStore.size > 1000) {
        for (const [k, v] of rateLimitStore) {
            if (v.resetAt < now) rateLimitStore.delete(k);
        }
    }

    if (!entry || entry.resetAt < now) {
        // Nova janela
        rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }

    entry.count++;
    if (entry.count > maxRequests) {
        console.warn(`[RATE-LIMIT] Blocked: ${key} (${entry.count}/${maxRequests} in window)`);
        return false;
    }

    return true;
}

// ============================================
// ✅ INPUT VALIDATION — Webhook Payload
// ============================================

/**
 * Valida payload básico de webhook da UZAPI/Evolution.
 * Retorna null se válido, ou string com erro se inválido.
 */
export function validateWebhookPayload(payload: any): string | null {
    if (!payload || typeof payload !== 'object') {
        return 'Payload must be a valid JSON object';
    }

    // instanceName é obrigatório e deve ser string curta
    const instanceName = payload.instanceName;
    if (instanceName !== undefined) {
        if (typeof instanceName !== 'string') {
            return 'instanceName must be a string';
        }
        if (instanceName.length > 100) {
            return 'instanceName too long (max 100 chars)';
        }
        // Previne caracteres perigosos
        if (/[<>"';&|`$]/.test(instanceName)) {
            return 'instanceName contains invalid characters';
        }
    }

    // message.text não pode exceder 50KB
    const messageText = payload.message?.text || payload.message?.content?.text;
    if (messageText && typeof messageText === 'string' && messageText.length > 50000) {
        return 'message.text exceeds maximum length (50KB)';
    }

    return null; // Válido
}

/**
 * Valida payload do Instagram/Meta webhook.
 * Retorna null se válido, ou string com erro se inválido.
 */
export function validateInstagramPayload(payload: any): string | null {
    if (!payload || typeof payload !== 'object') {
        return 'Payload must be a valid JSON object';
    }

    if (payload.object !== 'instagram' && payload.object !== 'page') {
        return `Invalid object type: ${payload.object}`;
    }

    if (!Array.isArray(payload.entry)) {
        return 'Missing or invalid entry array';
    }

    if (payload.entry.length > 50) {
        return 'Too many entries in payload (max 50)';
    }

    return null; // Válido
}
