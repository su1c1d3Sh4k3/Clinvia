import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptToken } from "../_shared/token-tracker.ts";
import { adminCan, adminCanAccessClient, adminForbidden, resolveAdminCaller } from "../_shared/admin-guard.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serveMonitored("admin-update-profile", async (req) => {
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

        // Roda com service role: sem este guard qualquer usuário autenticado
        // reescreveria o token OpenAI de qualquer tenant.
        const caller = await resolveAdminCaller(supabase, req);
        if (
            !caller ||
            !adminCan(caller, 'clientes', 'edit') ||
            !(await adminCanAccessClient(supabase, caller, profileId))
        ) {
            return adminForbidden(corsHeaders);
        }

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

        // Chave colada a mão = chave DO CLIENTE: markup 0 e `billable = false`.
        // Sem isto a conta ficaria 'platform' com uma chave que não é nossa e a
        // plataforma cobraria margem sobre a fatura do próprio cliente.
        if ('openai_token' in sanitizedUpdates) {
            const plain = sanitizedUpdates.openai_token;
            const hasToken = typeof plain === 'string' && plain.trim().length > 0;

            const { data: current } = await supabase
                .from('profiles')
                .select('openai_key_source, openai_project_id')
                .eq('id', profileId)
                .maybeSingle();

            // Remover a chave de uma conta provisionada deixaria projeto vivo na
            // OpenAI sem chave no banco. Isso é `archive_project`, no
            // admin-openai-account, que precisa de confirmação explícita.
            if (!hasToken && current?.openai_key_source === 'platform' && current?.openai_project_id) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: 'Esta conta tem projeto próprio na OpenAI. Para remover a chave, use "Arquivar projeto OpenAI" — remover só a chave deixaria o projeto ativo e sem chave.',
                        code: 'platform_key_needs_archive',
                    }),
                    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            sanitizedUpdates.openai_key_source = hasToken ? 'customer' : null;
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
