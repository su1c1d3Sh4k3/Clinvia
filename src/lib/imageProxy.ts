/**
 * Helper para fazer proxy de imagens do WhatsApp
 * URLs do WhatsApp têm CORS restritivo, então usamos uma Edge Function como proxy
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export const getProxiedImageUrl = (originalUrl: string | null | undefined): string | undefined => {
    if (!originalUrl) return undefined;

    // Se não for URL do WhatsApp, retornar como está
    if (!originalUrl.includes("pps.whatsapp.net")) {
        return originalUrl;
    }

    // Gerar URL do proxy
    const encodedUrl = encodeURIComponent(originalUrl);
    return `${SUPABASE_URL}/functions/v1/proxy-whatsapp-image?url=${encodedUrl}`;
};
