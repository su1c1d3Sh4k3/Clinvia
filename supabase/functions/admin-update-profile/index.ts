import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptToken } from "../_shared/token-tracker.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { profileId, updates } = await req.json();

        if (!profileId) {
            return new Response(
                JSON.stringify({ success: false, error: "profileId não fornecido" }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[admin-update-profile] Updating profile:', profileId);

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Only allow specific fields to be updated
        const allowedFields = ['openai_token', 'openai_token_invalid'];
        const sanitizedUpdates: Record<string, any> = {};

        for (const field of allowedFields) {
            if (field in updates) {
                sanitizedUpdates[field] = updates[field];
            }
        }

        // 🔐 Criptografar token OpenAI antes de salvar
        if (sanitizedUpdates.openai_token && typeof sanitizedUpdates.openai_token === 'string') {
            const encrypted = await encryptToken(sanitizedUpdates.openai_token);
            if (encrypted) {
                sanitizedUpdates.openai_token = encrypted;
                console.log('[admin-update-profile] Token encrypted before storage');
            }
        }

        if (Object.keys(sanitizedUpdates).length === 0) {
            return new Response(
                JSON.stringify({ success: false, error: "Nenhum campo válido para atualizar" }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { data, error } = await supabase
            .from('profiles')
            .update(sanitizedUpdates)
            .eq('id', profileId)
            .select();

        if (error) {
            console.error('[admin-update-profile] Error:', error);
            return new Response(
                JSON.stringify({ success: false, error: error.message }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[admin-update-profile] Update successful:', data);

        return new Response(
            JSON.stringify({ success: true, data }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[admin-update-profile] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
