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

        // Detect content type from filename
        let contentType = fileResponse.headers.get('Content-Type') || 'application/octet-stream';
        const ext = fileName.toLowerCase().split('.').pop();

        // Override content type if we can detect it better
        if (ext === 'pdf') contentType = 'application/pdf';
        else if (['jpg', 'jpeg'].includes(ext)) contentType = 'image/jpeg';
        else if (ext === 'png') contentType = 'image/png';
        else if (ext === 'gif') contentType = 'image/gif';
        else if (ext === 'webp') contentType = 'image/webp';
        else if (['doc', 'docx'].includes(ext)) contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (['xls', 'xlsx'].includes(ext)) contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        else if (['ppt', 'pptx'].includes(ext)) contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

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
