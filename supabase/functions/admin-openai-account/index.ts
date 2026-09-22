// Leitura da chave OpenAI da conta pelo Super Admin.
//
// Existe porque `profiles.openai_token` sai do alcance do role `authenticated`
// (migration 20260922133000 revoga o privilegio de COLUNA): a policy de linha de
// profiles e SELECT USING (true), ou seja, qualquer usuario logado de qualquer
// tenant lia a chave `sk-proj-...` de todos os outros. Dai pra frente a chave so
// sai por aqui, com service role + guard de admin, e MASCARADA por padrao.
//
// Acoes:
//   get     -> estado da conta com a chave mascarada (clientes/view)
//   reveal  -> chave em claro, descriptografada (clientes/edit)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptToken } from "../_shared/token-tracker.ts";
import { adminCan, adminCanAccessClient, adminForbidden, resolveAdminCaller } from "../_shared/admin-guard.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

/** `sk-proj-abc...WXYZ` -> nunca devolve o miolo da chave. */
function maskToken(plain: string): string {
    const clean = plain.trim();
    if (clean.length <= 12) return '****';
    return `${clean.slice(0, 7)}…${clean.slice(-4)}`;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const action: string = body?.action || 'get';
        const profileId: string | undefined = body?.profileId;

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, serviceKey);

        if (!profileId) {
            return json({ success: false, error: 'profileId não fornecido', code: 'missing_profile_id' });
        }

        const caller = await resolveAdminCaller(supabase, req);
        const level = action === 'reveal' ? 'edit' : 'view';
        if (
            !caller ||
            !adminCan(caller, 'clientes', level) ||
            !(await adminCanAccessClient(supabase, caller, profileId))
        ) {
            return adminForbidden(corsHeaders);
        }

        const { data: profile, error } = await supabase
            .from('profiles')
            .select('openai_token, openai_token_invalid, openai_key_source, openai_project_id, openai_spend_limit_usd, openai_provisioned_at, openai_provision_error')
            .eq('id', profileId)
            .maybeSingle();

        if (error) return json({ success: false, error: error.message, code: 'db_error' });
        if (!profile) return json({ success: false, error: 'Conta não encontrada', code: 'profile_not_found' });

        const stored = typeof profile.openai_token === 'string' ? profile.openai_token : '';
        const hasToken = stored.trim().length > 0;
        const plain = hasToken ? await decryptToken(stored) : '';

        const base = {
            success: true,
            has_token: hasToken,
            token_encrypted: stored.startsWith('enc:'),
            masked_token: hasToken && plain ? maskToken(plain) : (hasToken ? '****' : null),
            token_invalid: profile.openai_token_invalid === true,
            key_source: profile.openai_key_source ?? null,
            project_id: profile.openai_project_id ?? null,
            spend_limit_usd: profile.openai_spend_limit_usd ?? null,
            provisioned_at: profile.openai_provisioned_at ?? null,
            provision_error: profile.openai_provision_error ?? null,
        };

        if (action === 'reveal') {
            if (!hasToken) return json({ ...base, token: null });
            if (!plain) {
                // Token `enc:` sem a chave de criptografia no ambiente.
                return json({ ...base, token: null, error: 'Não foi possível descriptografar o token', code: 'decrypt_failed' });
            }
            console.log('[admin-openai-account] reveal by', caller.authUserId, 'target', profileId);
            return json({ ...base, token: plain });
        }

        if (action !== 'get') {
            return json({ success: false, error: `Ação inválida: ${action}`, code: 'unknown_action' });
        }

        return json(base);
    } catch (err: any) {
        console.error('[admin-openai-account] Error:', err);
        return json({ success: false, error: err?.message || 'Erro inesperado', code: 'unexpected_error' }, 500);
    }
});
