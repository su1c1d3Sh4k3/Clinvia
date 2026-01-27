import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

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

        // Initialize Supabase client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Download file from storage
        const { data, error } = await supabase.storage
            .from('media')
            .download(filePath);

        if (error || !data) {
            console.error('Error downloading file:', error);
            return new Response(JSON.stringify({ error: 'File not found' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Extract filename from path
        const fileName = filePath.split('/').pop() || 'file';

        // Detect content type from filename
        let contentType = 'application/octet-stream';
        const ext = fileName.toLowerCase().split('.').pop();

        if (ext === 'pdf') contentType = 'application/pdf';
        else if (['jpg', 'jpeg'].includes(ext)) contentType = 'image/jpeg';
        else if (ext === 'png') contentType = 'image/png';
        else if (ext === 'gif') contentType = 'image/gif';
        else if (ext === 'webp') contentType = 'image/webp';
        else if (['doc', 'docx'].includes(ext)) contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        else if (['xls', 'xlsx'].includes(ext)) contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        else if (['ppt', 'pptx'].includes(ext)) contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

        // Return file with inline Content-Disposition
        return new Response(data, {
            headers: {
                ...corsHeaders,
                'Content-Type': contentType,
                'Content-Disposition': `inline; filename="${fileName}"`,
                'Cache-Control': 'public, max-age=3600',
            }
        });

    } catch (error) {
        console.error('Error in serve-media function:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
