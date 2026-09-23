import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serveMonitored("admin-delete-client", async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Verify the caller is a super-admin via their JWT token
        const authHeader = req.headers.get("authorization");
        if (!authHeader) {
            throw new Error("Não autorizado");
        }

        const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(
            authHeader.replace("Bearer ", "")
        );

        if (callerError || !caller) {
            throw new Error("Token inválido");
        }

        const { data: callerProfile } = await supabaseAdmin
            .from("profiles")
            .select("role")
            .eq("id", caller.id)
            .single();

        if (callerProfile?.role !== "super-admin") {
            throw new Error("Apenas super-admins podem excluir contas");
        }

        const { profileId } = await req.json();

        if (!profileId) {
            throw new Error("profileId é obrigatório");
        }

        // O erro do lookup NAO pode ser engolido: qualquer falha de banco virava
        // "Conta nao encontrada" e o super admin ficava sem saber o motivo.
        const { data: targetProfile, error: targetError } = await supabaseAdmin
            .from("profiles")
            .select("role, full_name, email")
            .eq("id", profileId)
            .maybeSingle();

        if (targetError) {
            throw new Error(
                `Falha ao ler a conta ${profileId}: ${targetError.message} (${targetError.code})`
            );
        }

        // Prevent deletion of super-admins
        if (targetProfile?.role === "super-admin") {
            throw new Error("Não é possível excluir uma conta super-admin");
        }

        // A limpeza e longa e o perfil so cai na ultima etapa (junto com o auth
        // user), entao um clique repetido enquanto ela roda chegava aqui sem
        // perfil e devolvia 400. Sem perfil, olha o auth user antes de desistir:
        // com ele vivo ainda ha o que limpar; sem ele a conta ja foi excluida e
        // repetir o clique tem que ser inofensivo.
        if (!targetProfile) {
            const { data: orphan } = await supabaseAdmin.auth.admin.getUserById(profileId);
            if (!orphan?.user) {
                console.log(`[admin-delete-client] Nada a fazer: ${profileId} já estava excluída`);
                return new Response(
                    JSON.stringify({
                        success: true,
                        message: "Esta conta já estava excluída",
                        already_deleted: true,
                    }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
            console.log(
                `[admin-delete-client] Perfil ausente, mas o auth user ${profileId} existe — retomando a limpeza`
            );
        }

        console.log(
            `[admin-delete-client] Deleting account: ${targetProfile?.email ?? "(perfil ausente)"} (${profileId})`
        );

        // Os colaboradores precisam ser lidos ANTES da varredura, que apaga
        // team_members junto com o resto.
        const { data: teamAuthIds, error: teamError } = await supabaseAdmin
            .from("team_members")
            .select("auth_user_id")
            .eq("user_id", profileId);

        if (teamError) {
            throw new Error(
                `Falha ao listar os colaboradores de ${profileId}: ${teamError.message} (${teamError.code})`
            );
        }

        // Os arquivos tambem: a varredura apaga as linhas que guardam as URLs.
        // Apagar linha de storage.objects NAO apaga os bytes -- a remocao real
        // tem que passar pela API de Storage, aqui embaixo.
        const { data: arquivos, error: arquivosError } = await supabaseAdmin.rpc(
            "admin_tenant_storage_paths",
            { p_user_id: profileId }
        );

        if (arquivosError) {
            throw new Error(
                `Falha ao listar os arquivos de ${profileId}: ${arquivosError.message} (${arquivosError.code})`
            );
        }

        // Varredura pelo catalogo: descobre em tempo de execucao TODA tabela com
        // coluna de dono e apaga em passadas ate convergir. A lista escrita a mao
        // que existia aqui conhecia 25 tabelas; o schema tem 100 colunas de dono,
        // e como quase toda FK e SET NULL/NO ACTION (nao CASCADE), o que ficava
        // fora da lista sobrava como dado orfao.
        const { error: sweepError } = await supabaseAdmin.rpc("admin_delete_tenant_data", {
            p_user_id: profileId,
            p_dry_run: false,
        });

        if (sweepError) {
            throw new Error(
                `Falha ao excluir os dados de ${profileId}: ${sweepError.message} (${sweepError.code})`
            );
        }

        // Remocao dos bytes, em lotes por bucket.
        const porBucket = new Map<string, string[]>();
        for (const f of (arquivos ?? []) as Array<{ bucket: string; path: string }>) {
            if (!f?.bucket || !f?.path) continue;
            const atual = porBucket.get(f.bucket);
            if (atual) atual.push(f.path);
            else porBucket.set(f.bucket, [f.path]);
        }

        for (const [bucket, paths] of porBucket) {
            for (let i = 0; i < paths.length; i += 100) {
                const lote = paths.slice(i, i + 100);
                const { error: removeError } = await supabaseAdmin.storage
                    .from(bucket)
                    .remove(lote);
                // Arquivo que nao existe mais nao pode derrubar a exclusao da conta.
                if (removeError) {
                    console.error(
                        `[admin-delete-client] Falha ao remover ${lote.length} arquivo(s) de ${bucket}: ${removeError.message}`
                    );
                }
            }
        }

        // Auth users dos colaboradores deste tenant.
        for (const member of teamAuthIds ?? []) {
            if (member.auth_user_id && member.auth_user_id !== profileId) {
                await supabaseAdmin.auth.admin.deleteUser(member.auth_user_id).catch(() => {});
            }
        }

        // Por ultimo o auth user do dono, que cascateia em profiles.
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(profileId);

        if (authError) {
            throw authError;
        }

        console.log(`[admin-delete-client] Account deleted successfully: ${profileId}`);

        return new Response(
            JSON.stringify({ success: true, message: "Conta excluída com sucesso" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error: any) {
        console.error("[admin-delete-client] Error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
