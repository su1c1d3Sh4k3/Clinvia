import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        console.log('[1] Starting cleanup of Evolution API data...');

        // Delete in order due to foreign key constraints
        const { error: messagesError } = await supabaseClient
            .from('messages')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

        if (messagesError) {
            console.error('[2] Error deleting messages:', messagesError);
        } else {
            console.log('[2] Messages deleted');
        }

        const { error: aiError } = await supabaseClient
            .from('ai_analysis')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');

        if (aiError) {
            console.error('[3] Error deleting AI analysis:', aiError);
        } else {
            console.log('[3] AI analysis deleted');
        }

        const { error: conversationsError } = await supabaseClient
            .from('conversations')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');

        if (conversationsError) {
            console.error('[4] Error deleting conversations:', conversationsError);
        } else {
            console.log('[4] Conversations deleted');
        }

        const { error: contactTagsError } = await supabaseClient
            .from('contact_tags')
            .delete()
            .neq('contact_id', '00000000-0000-0000-0000-000000000000');

        if (contactTagsError) {
            console.error('[5] Error deleting contact tags:', contactTagsError);
        } else {
            console.log('[5] Contact tags deleted');
        }

        const { error: contactsError } = await supabaseClient
            .from('contacts')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');

        if (contactsError) {
            console.error('[6] Error deleting contacts:', contactsError);
        } else {
            console.log('[6] Contacts deleted');
        }

        console.log('[7] Cleanup complete!');

        return new Response(
            JSON.stringify({
                success: true,
                message: 'All Evolution API data cleaned up successfully'
            }),
            {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );

    } catch (error: any) {
        console.error('[ERROR] Cleanup failed:', error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error.message
            }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
});
