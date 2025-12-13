import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        const BUCKET_NAME = 'media';
        const DAYS_TO_KEEP = 30;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - DAYS_TO_KEEP);

        console.log(`Starting cleanup for bucket '${BUCKET_NAME}' older than ${cutoffDate.toISOString()}`);

        let filesToDelete: string[] = [];
        let hasMore = true;
        let page = 0;
        const pageSize = 100;

        // Iterate through all files in the bucket
        while (hasMore) {
            const { data: files, error } = await supabaseClient
                .storage
                .from(BUCKET_NAME)
                .list(undefined, { limit: pageSize, offset: page * pageSize });

            if (error) throw error;

            if (!files || files.length === 0) {
                hasMore = false;
                break;
            }

            for (const file of files) {
                // Check if file is older than cutoff date
                // Note: 'created_at' in storage.list might be 'created_at' or 'updated_at' depending on metadata,
                // but usually it returns 'created_at' or 'last_modified'.
                // Supabase storage list returns 'created_at'.
                const fileDate = new Date(file.created_at);

                if (fileDate < cutoffDate) {
                    filesToDelete.push(file.name);
                }
            }

            if (files.length < pageSize) {
                hasMore = false;
            } else {
                page++;
            }
        }

        console.log(`Found ${filesToDelete.length} files to delete.`);

        // Delete files in batches of 50 to avoid limits
        const deleteBatchSize = 50;
        let deletedCount = 0;

        for (let i = 0; i < filesToDelete.length; i += deleteBatchSize) {
            const batch = filesToDelete.slice(i, i + deleteBatchSize);
            const { error: deleteError } = await supabaseClient
                .storage
                .from(BUCKET_NAME)
                .remove(batch);

            if (deleteError) {
                console.error('Error deleting batch:', deleteError);
            } else {
                deletedCount += batch.length;
            }
        }

        return new Response(
            JSON.stringify({
                message: `Cleanup complete.`,
                deleted_count: deletedCount,
                cutoff_date: cutoffDate.toISOString()
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
