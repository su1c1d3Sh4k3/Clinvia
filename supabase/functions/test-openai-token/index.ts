import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { profileId, token } = await req.json();

        if (!token) {
            return new Response(
                JSON.stringify({ success: false, error: "Token não fornecido" }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        console.log('[test-openai-token] Testing token for profile:', profileId);

        // Test the token with a minimal request to OpenAI
        const testResponse = await fetch("https://api.openai.com/v1/models", {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
            },
        });

        console.log('[test-openai-token] OpenAI response status:', testResponse.status);

        if (testResponse.ok) {
            // Token is valid - try to clear invalid flag if profileId provided
            if (profileId) {
                try {
                    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
                    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
                    const supabase = createClient(supabaseUrl, supabaseKey);

                    await supabase
                        .from('profiles')
                        .update({ openai_token_invalid: false })
                        .eq('id', profileId);
                } catch (e) {
                    console.log('[test-openai-token] Could not clear invalid flag (column may not exist yet)');
                }
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    message: "Token válido e funcionando!"
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        } else {
            const errorData = await testResponse.json().catch(() => ({}));
            let errorMessage = "Token inválido";

            if (testResponse.status === 401) {
                errorMessage = "Token inválido ou expirado";
            } else if (testResponse.status === 429) {
                errorMessage = "Limite de requisições excedido (quota)";
            } else if (testResponse.status === 403) {
                errorMessage = "Acesso negado - verifique as permissões do token";
            }

            console.log('[test-openai-token] Token test failed:', errorMessage);

            return new Response(
                JSON.stringify({
                    success: false,
                    error: errorMessage,
                    details: errorData
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

    } catch (error: any) {
        console.error('[test-openai-token] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
