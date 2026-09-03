import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);
        const filePath = url.searchParams.get('path');

        if (!filePath) {
            return new Response(JSON.stringify({ error: 'Missing path parameter' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Build public URL to the file
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/media/${filePath}`;

        // Fetch the file from public storage
        const fileResponse = await fetch(publicUrl);

        if (!fileResponse.ok) {
            console.error('Error fetching file:', fileResponse.status, fileResponse.statusText);
            return new Response(JSON.stringify({ error: 'File not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Get the blob
        const blob = await fileResponse.blob();

        // Extract filename from path
        const fileName = filePath.split('/').pop() || 'file';

        // Content-Type pela extensão real do arquivo. O que veio do storage é
        // o rótulo que o navegador do remetente mandou no upload, e ele erra
        // (no Windows um .xml chega como application/vnd.ms-excel) — aí quem
        // baixa recebe o arquivo com a extensão errada.
        const ext = (fileName.toLowerCase().split('.').pop() || '').replace(/[^a-z0-9]/g, '');
        const EXT_TO_MIME: Record<string, string> = {
            pdf: 'application/pdf',
            doc: 'application/msword',
            docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            xls: 'application/vnd.ms-excel',
            xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ppt: 'application/vnd.ms-powerpoint',
            pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            rtf: 'application/rtf',
            odt: 'application/vnd.oasis.opendocument.text',
            ods: 'application/vnd.oasis.opendocument.spreadsheet',
            txt: 'text/plain',
            md: 'text/markdown',
            csv: 'text/csv',
            html: 'text/html',
            xml: 'text/xml',
            json: 'application/json',
            zip: 'application/zip',
            rar: 'application/vnd.rar',
            '7z': 'application/x-7z-compressed',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            gif: 'image/gif',
            webp: 'image/webp',
            svg: 'image/svg+xml',
            heic: 'image/heic',
            mp3: 'audio/mpeg',
            m4a: 'audio/mp4',
            ogg: 'audio/ogg',
            wav: 'audio/wav',
            mp4: 'video/mp4',
            mov: 'video/quicktime',
            webm: 'video/webm',
            '3gp': 'video/3gpp',
        };
        const contentType = EXT_TO_MIME[ext]
            || fileResponse.headers.get('Content-Type')
            || 'application/octet-stream';

        // Return file with inline Content-Disposition
        return new Response(blob, {
            headers: {
                ...corsHeaders,
                'Content-Type': contentType,
                'Content-Disposition': `inline; filename="${fileName}"`,
                'Cache-Control': 'public, max-age=3600',
            }
        });

    } catch (error) {
        console.error('Error in serve-media function:', error);
        return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
