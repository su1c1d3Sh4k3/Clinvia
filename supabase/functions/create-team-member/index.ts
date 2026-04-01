import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const { name, email, password, role, phone, owner_id, commission } = await req.json();

        // Validate owner_id
        if (!owner_id) {
            throw new Error("owner_id is required");
        }

        // 0a. Verificar se email já existe em qualquer conta do sistema (auth.users)
        //     Isso impede que um email de dono de empresa seja cadastrado como membro de outra empresa
        const { data: authEmailExists } = await supabaseAdmin
            .rpc('check_auth_email_exists', { p_email: email });

        if (authEmailExists) {
            return new Response(
                JSON.stringify({ error: 'Este email já está cadastrado no sistema. Não é possível criar um membro com este email.' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 0b. Verificar se email já existe na tabela team_members (qualquer empresa)
        const { data: emailCheck } = await supabaseAdmin
            .from('team_members')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (emailCheck) {
            return new Response(
                JSON.stringify({ error: 'Este email já está cadastrado na equipe. Use um email diferente.' }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 1. Create Auth User
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                name,
                is_team_member: true
            },
        });

        if (authError) {
            // Traduzir erro de email duplicado do Supabase para português
            const msg = authError.message?.toLowerCase() ?? '';
            if (
                msg.includes('already registered') ||
                msg.includes('already been registered') ||
                msg.includes('email exists') ||
                msg.includes('user already exists') ||
                msg.includes('duplicate')
            ) {
                throw new Error('Este email já está cadastrado em outra conta. Use um email diferente.');
            }
            throw authError;
        }

        // 2. Create Team Member Record
        // user_id = owner_id (ID do admin/owner da conta)
        // auth_user_id = ID do NOVO usuário (para login/identificação)
        const { error: dbError } = await supabaseAdmin
            .from("team_members")
            .insert({
                user_id: owner_id,           // ID do ADMIN (owner)
                auth_user_id: authData.user.id, // ID do NOVO membro
                name,
                email,
                phone,
                role,
                commission: commission || 0, // Commission percentage (0-100)
            });

        if (dbError) {
            // Rollback auth user creation if DB insert fails
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
            throw dbError;
        }

        return new Response(
            JSON.stringify({ message: "Member created successfully", user: authData.user }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
