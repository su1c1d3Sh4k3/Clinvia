// Leitura da chave OpenAI da conta pelo Super Admin.
//
// Existe porque `profiles.openai_token` sai do alcance do role `authenticated`
// (migration 20260922133000 revoga o privilegio de COLUNA): a policy de linha de
// profiles e SELECT USING (true), ou seja, qualquer usuario logado de qualquer
// tenant lia a chave `sk-proj-...` de todos os outros. Dai pra frente a chave so
// sai por aqui, com service role + guard de admin, e MASCARADA por padrao.
//
// Acoes:
//   get             -> estado da conta com a chave mascarada (clientes/view)
//   reveal          -> chave em claro, descriptografada (clientes/edit)
//   provision       -> cria projeto + chave na OpenAI para esta conta (clientes/edit)
//   set_spend_limit -> muda o limite mensal do projeto (clientes/edit)
//   archive_project -> arquiva o projeto e solta a conta (clientes/edit + confirm)
//   sync            -> puxa consumo/custo do projeto agora (clientes/view)

import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptToken } from "../_shared/token-tracker.ts";
import { adminCan, adminCanAccessClient, adminForbidden, resolveAdminCaller } from "../_shared/admin-guard.ts";
import { archiveProject, clearProjectSpendLimit, resolveAdminKey, setProjectSpendLimit } from "../_shared/openai-admin.ts";

const READ_ONLY_ACTIONS = new Set(['get', 'sync']);
const VALID_ACTIONS = ['get', 'reveal', 'provision', 'set_spend_limit', 'archive_project', 'sync'];

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-origin',
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

serveMonitored("admin-openai-account", async (req) => {
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

        if (!VALID_ACTIONS.includes(action)) {
            return json({
                success: false,
                error: `Ação inválida: ${action}. Válidas: ${VALID_ACTIONS.join(', ')}.`,
                code: 'unknown_action',
            });
        }

        const caller = await resolveAdminCaller(supabase, req);
        const level = READ_ONLY_ACTIONS.has(action) ? 'view' : 'edit';
        if (
            !caller ||
            !adminCan(caller, 'clientes', level) ||
            !(await adminCanAccessClient(supabase, caller, profileId))
        ) {
            return adminForbidden(corsHeaders);
        }

        const { data: profile, error } = await supabase
            .from('profiles')
            .select('company_name, full_name, openai_token, openai_token_invalid, openai_key_source, openai_project_id, openai_spend_limit_usd, openai_provisioned_at, openai_provision_error')
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

        if (action === 'provision') {
            // Delegado: a criacao na OpenAI vive numa funcao so, usada tambem pelo
            // worker da fila. Aqui e o botao "Provisionar projeto OpenAI".
            const res = await fetch(`${supabaseUrl}/functions/v1/provision-openai-project`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${serviceKey}`,
                    'x-service-key': serviceKey,
                },
                body: JSON.stringify({ profileId }),
            });
            const out = await res.json().catch(() => ({}));
            console.log('[admin-openai-account] provision by', caller.authUserId, 'target', profileId, out?.status || out?.code);
            return json(out);
        }

        if (action === 'set_spend_limit') {
            // `limitUsd: null` REMOVE o teto (padrão desde 22/09/2026: conta sem
            // teto, alerta em vez de corte). Um número > 0 continua aplicando teto.
            const clearing = body?.limitUsd === null;
            const limitUsd = clearing ? null : Number(body?.limitUsd);
            if (!clearing && (!Number.isFinite(limitUsd as number) || (limitUsd as number) <= 0)) {
                return json({ success: false, error: 'limitUsd inválido (use um número > 0, ou null para remover o teto)', code: 'invalid_limit' });
            }
            if (!profile.openai_project_id) {
                return json({
                    success: false,
                    error: 'A conta não tem projeto na OpenAI. Provisione primeiro.',
                    code: 'no_project',
                });
            }

            const admin = resolveAdminKey();
            if (!admin) {
                return json({
                    success: false,
                    error: 'Nenhuma chave de admin da OpenAI configurada',
                    code: 'openai_admin_key_missing',
                });
            }

            const applied = clearing
                ? await clearProjectSpendLimit(admin, profile.openai_project_id)
                    .then((r) => ({ applied: r.cleared, warning: r.cleared ? undefined : 'A OpenAI não confirmou a remoção do teto. Conferir no painel do projeto.', attempts: r.attempts }))
                : await setProjectSpendLimit(admin, profile.openai_project_id, limitUsd as number);

            // O limite guardado no banco vale como alvo do alerta de 80% mesmo
            // quando a API nao aplicou o teto no projeto.
            const { error: upErr } = await supabase
                .from('profiles')
                .update({
                    openai_spend_limit_usd: limitUsd,
                    openai_spend_alert_level: null,
                    openai_spend_alert_sent_at: null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', profileId);
            if (upErr) return json({ success: false, error: upErr.message, code: 'db_error' });

            return json({
                success: true,
                spend_limit_usd: limitUsd,
                applied_on_openai: applied.applied,
                warning: applied.warning ?? null,
                admin_key_source: admin.source,
                ...(clearing ? { attempts: (applied as any).attempts } : {}),
            });
        }

        if (action === 'archive_project') {
            if (body?.confirm !== true) {
                return json({
                    success: false,
                    error: 'Arquivar o projeto derruba a chave da conta na OpenAI. Reenvie com confirm: true.',
                    code: 'confirmation_required',
                });
            }
            if (!profile.openai_project_id) {
                return json({ success: false, error: 'A conta não tem projeto na OpenAI.', code: 'no_project' });
            }

            const admin = resolveAdminKey();
            if (!admin) {
                return json({
                    success: false,
                    error: 'Nenhuma chave de admin da OpenAI configurada',
                    code: 'openai_admin_key_missing',
                });
            }

            const projectId = profile.openai_project_id;
            try {
                await archiveProject(admin, projectId);
            } catch (err: any) {
                return json({
                    success: false,
                    error: `A OpenAI não arquivou o projeto: ${err?.message || err}`,
                    code: err?.code || 'openai_error',
                });
            }

            // Solta a conta: ela volta para a chave compartilhada e o painel
            // mostra "estimado" de novo. Os dias ja coletados ficam no historico.
            const { error: upErr } = await supabase
                .from('profiles')
                .update({
                    openai_token: null,
                    openai_token_invalid: false,
                    openai_key_source: null,
                    openai_project_id: null,
                    openai_service_account_id: null,
                    openai_api_key_id: null,
                    openai_provisioned_at: null,
                    openai_provision_error: null,
                    openai_spend_alert_level: null,
                    openai_spend_alert_sent_at: null,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', profileId);
            if (upErr) return json({ success: false, error: upErr.message, code: 'db_error' });

            console.warn('[admin-openai-account] archive by', caller.authUserId, 'target', profileId, 'project', projectId);
            return json({
                success: true,
                archived_project_id: projectId,
                message: 'Projeto arquivado na OpenAI. A conta voltou para a chave compartilhada.',
            });
        }

        if (action === 'sync') {
            if (!profile.openai_project_id) {
                return json({ success: false, error: 'A conta não tem projeto na OpenAI.', code: 'no_project' });
            }
            const res = await fetch(`${supabaseUrl}/functions/v1/sync-openai-usage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${serviceKey}`,
                },
                body: JSON.stringify({ profileId }),
            });
            const out = await res.json().catch(() => ({}));
            return json(out);
        }

        return json(base);
    } catch (err: any) {
        console.error('[admin-openai-account] Error:', err);
        return json({ success: false, error: err?.message || 'Erro inesperado', code: 'unexpected_error' }, 500);
    }
});
