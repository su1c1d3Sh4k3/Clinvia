// Cria projeto + chave na OpenAI para UMA conta e grava o resultado em profiles.
//
// Chamada pelo worker da fila (openai-provision-worker) e pelo botao
// "Provisionar projeto OpenAI" do Super Admin (via admin-openai-account).
// Nunca e chamada pelo navegador direto: exige o service role key no header
// `x-service-key` ou um JWT de service role.
//
// Idempotencia (a conta pode ser reprocessada ate 5 vezes pela fila):
//   - `openai_project_id` ja preenchido            -> already_provisioned, nao cria nada
//   - `openai_key_source = 'customer'`             -> skipped_customer_key
//   - projeto com o mesmo nome ja existe na OpenAI -> reaproveita o projeto e cria
//     apenas a service account (caso da falha parcial: projeto criado, banco nao gravado)
//
// A chave em claro so existe dentro desta funcao e nunca vai para o log.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptToken } from "../_shared/token-tracker.ts";
import {
    archiveProject,
    buildProjectName,
    clearProjectSpendLimit,
    createProject,
    createServiceAccount,
    findProjectByName,
    getProjectSpendLimit,
    resolveAdminKey,
    setProjectSpendLimit,
} from "../_shared/openai-admin.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-service-key',
};

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

    let profileId = '';
    try {
        const presented = req.headers.get('x-service-key')
            || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
        if (presented !== serviceKey) {
            return json({ success: false, error: 'Não autorizado', code: 'unauthorized' }, 401);
        }

        const body = await req.json().catch(() => ({}));

        // Manutencao do teto de gasto: le ou remove o limite de UM projeto na
        // OpenAI. Mora aqui porque esta e a unica porta do ciclo de vida do
        // projeto chamavel com o service key (o admin-openai-account exige JWT
        // de admin e nao serve para o lote).
        const action = typeof body?.action === 'string' ? body.action : '';
        if (action === 'get_spend_limit' || action === 'clear_spend_limit') {
            const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
            if (!projectId) {
                return json({ success: false, error: 'projectId não fornecido', code: 'missing_project_id' }, 400);
            }
            const adminKey = resolveAdminKey();
            if (!adminKey) {
                return json({ success: false, error: 'Nenhuma chave de admin da OpenAI configurada', code: 'openai_admin_key_missing' }, 500);
            }
            if (action === 'get_spend_limit') {
                const read = await getProjectSpendLimit(adminKey, projectId);
                return json({ success: true, project_id: projectId, ...read });
            }
            const out = await clearProjectSpendLimit(adminKey, projectId);
            console.warn('[provision-openai-project] spend limit removido', projectId, out.cleared);
            return json({ success: true, project_id: projectId, ...out });
        }

        profileId = typeof body?.profileId === 'string' ? body.profileId : '';
        if (!profileId) {
            return json({ success: false, error: 'profileId não fornecido', code: 'missing_profile_id' }, 400);
        }

        const { data: profile, error: profErr } = await supabase
            .from('profiles')
            .select('id, full_name, company_name, email, role, status, openai_token, openai_key_source, openai_project_id, openai_spend_limit_usd')
            .eq('id', profileId)
            .maybeSingle();
        if (profErr) {
            return json({ success: false, error: profErr.message, code: 'db_error' }, 500);
        }
        if (!profile) {
            return json({ success: false, error: 'Conta não encontrada', code: 'profile_not_found' }, 404);
        }

        if (profile.openai_project_id) {
            return json({
                success: true,
                status: 'already_provisioned',
                profile_id: profile.id,
                project_id: profile.openai_project_id,
                message: 'A conta já tem projeto na OpenAI. Nada foi criado.',
            });
        }
        if (profile.openai_key_source === 'customer') {
            return json({
                success: true,
                status: 'skipped_customer_key',
                profile_id: profile.id,
                message: 'A conta usa a chave do próprio cliente. Fora do provisionamento da plataforma.',
            });
        }

        const admin = resolveAdminKey();
        if (!admin) {
            return json({
                success: false,
                error: 'Nenhuma chave de admin da OpenAI configurada (OPENAI_ADMIN_KEY_WRITE ou OPENAI_ADMIN_KEY)',
                code: 'openai_admin_key_missing',
            }, 500);
        }

        // Teto de gasto: por decisao do user em 22/09/2026 a conta nasce SEM teto
        // (o gasto do cliente nao e previsivel e o atendimento nao pode parar) —
        // o controle virou alerta, nao corte. So aplica limite se alguem definir
        // um valor explicito na conta ou no default da plataforma.
        const { data: settings } = await supabase
            .from('llm_platform_settings')
            .select('default_spend_limit_usd')
            .eq('id', true)
            .maybeSingle();
        const rawLimit = profile.openai_spend_limit_usd ?? settings?.default_spend_limit_usd ?? null;
        const limitUsd = rawLimit === null || !Number.isFinite(Number(rawLimit)) || Number(rawLimit) <= 0
            ? null
            : Number(rawLimit);

        const name = buildProjectName(profile);

        // 1. projeto — reaproveita se uma tentativa anterior já criou
        let project = await findProjectByName(admin, name);
        const reused = !!project;
        if (!project) project = await createProject(admin, name);
        console.log('[provision-openai-project]', profile.id, reused ? 'projeto reaproveitado' : 'projeto criado', project.id);

        // 2. service account — a chave em claro vem só aqui
        let account;
        try {
            account = await createServiceAccount(admin, project.id, name);
        } catch (err: any) {
            // Projeto criado agora e chave falhou: arquiva para não deixar projeto órfão
            // na organização. Projeto reaproveitado NÃO é arquivado (pode estar em uso).
            if (!reused) {
                try {
                    await archiveProject(admin, project.id);
                    console.warn('[provision-openai-project]', profile.id, 'projeto arquivado após falha da chave', project.id);
                } catch (archiveErr: any) {
                    console.error('[provision-openai-project] falha ao arquivar', project.id, archiveErr?.message);
                }
            }
            throw err;
        }

        // 3. limite de gasto — não fatal, e só quando houver limite configurado
        const limit = limitUsd === null
            ? { applied: false, warning: undefined as string | undefined }
            : await setProjectSpendLimit(admin, project.id, limitUsd);

        // 4. grava criptografado
        const encrypted = await encryptToken(account.apiKey);
        if (!encrypted) {
            // Sem OPENAI_TOKEN_ENCRYPTION_KEY a chave só poderia ser gravada em claro
            // numa coluna que já teve vazamento. Não grava e falha explícito.
            throw Object.assign(
                new Error('OPENAI_TOKEN_ENCRYPTION_KEY ausente: a chave não foi gravada, para não ficar em claro no banco'),
                { code: 'encryption_key_missing' },
            );
        }

        const { error: upErr } = await supabase
            .from('profiles')
            .update({
                openai_token: encrypted,
                openai_token_invalid: false,
                openai_key_source: 'platform',
                openai_project_id: project.id,
                openai_service_account_id: account.id || null,
                openai_api_key_id: account.apiKeyId,
                openai_spend_limit_usd: limitUsd,
                openai_provisioned_at: new Date().toISOString(),
                openai_provision_error: limit.warning ?? null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', profile.id);
        if (upErr) {
            // Chave existe na OpenAI mas não no banco: a próxima tentativa reaproveita
            // o projeto por nome e cria outra service account. Sem chave perdida no ar.
            console.error('[provision-openai-project] falha ao gravar', profile.id, upErr.message);
            return json({
                success: false,
                error: `Projeto criado na OpenAI mas a gravação no banco falhou: ${upErr.message}`,
                code: 'db_write_failed',
                project_id: project.id,
            }, 500);
        }

        return json({
            success: true,
            status: reused ? 'provisioned_reused_project' : 'provisioned',
            profile_id: profile.id,
            company: profile.company_name ?? profile.full_name ?? null,
            project_id: project.id,
            project_name: name,
            credential_name: name,
            service_account_id: account.id || null,
            api_key_id: account.apiKeyId,
            spend_limit_usd: limitUsd,
            spend_limit_applied: limit.applied,
            admin_key_source: admin.source,
            warnings: [
                ...(limit.warning ? [limit.warning] : []),
                ...(admin.source === 'fallback_shared'
                    ? ['Usou OPENAI_ADMIN_KEY (chave única de leitura/escrita) porque OPENAI_ADMIN_KEY_WRITE não existe.']
                    : []),
            ],
        });
    } catch (err: any) {
        const code = err?.code || 'unexpected_error';
        const message = err?.message || 'Erro inesperado';
        console.error('[provision-openai-project] erro', profileId, code, message);

        if (profileId) {
            await supabase
                .from('profiles')
                .update({ openai_provision_error: `${code}: ${message}`.slice(0, 500) })
                .eq('id', profileId);
        }

        return json({ success: false, error: message, code, profile_id: profileId || null }, 500);
    }
});
