// Equipe do painel admin: cria/edita/desativa usuários com login próprio.
//
// SEGURANÇA: valida o JWT do chamador server-side e exige profiles.role =
// 'super-admin'. Sem isso a função seria escalada de privilégio (qualquer
// usuário autenticado criaria um admin) — o create-team-member NÃO valida o
// cargo do chamador e esse vício não se repete aqui.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import {
    apiError,
    dbErrorResponse,
    missingFields,
    readJsonBody,
    unexpectedErrorResponse,
    unknownAction,
} from "../_shared/api-errors.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_ACTIONS = ["create", "update", "deactivate", "reset_password"];

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        // 1. Identidade do chamador
        const authHeader = req.headers.get("Authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (!token) {
            return apiError(corsHeaders, {
                status: 401,
                code: "auth_missing",
                message: "Header Authorization ausente. Faça login no painel administrativo e tente novamente.",
            });
        }

        const { data: caller, error: callerError } = await supabaseAdmin.auth.getUser(token);
        if (callerError || !caller?.user) {
            return apiError(corsHeaders, {
                status: 401,
                code: "auth_invalid",
                message: "Sessão inválida ou expirada. Faça login novamente no painel administrativo.",
                details: callerError?.message,
            });
        }

        // 2. Só o super-admin gerencia a equipe do painel
        const { data: callerProfile, error: profileError } = await supabaseAdmin
            .from("profiles")
            .select("role")
            .eq("id", caller.user.id)
            .maybeSingle();

        if (profileError) {
            return dbErrorResponse(corsHeaders, "caller_profile_error", "verificar o cargo de quem chamou", profileError);
        }
        if (callerProfile?.role !== "super-admin") {
            return apiError(corsHeaders, {
                status: 403,
                code: "forbidden",
                message: "Apenas o super-admin pode gerenciar a equipe do painel administrativo.",
            });
        }

        const { body, response } = await readJsonBody(req, corsHeaders);
        if (response) return response;

        const action = String(body!.action ?? "");
        if (!VALID_ACTIONS.includes(action)) {
            return unknownAction(corsHeaders, body!.action, VALID_ACTIONS);
        }

        if (action === "create") {
            const missing = missingFields(corsHeaders, body!, ["name", "email", "password"]);
            if (missing) return missing;

            const email = String(body!.email).trim().toLowerCase();
            const password = String(body!.password);
            if (password.length < 6) {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "password_too_short",
                    message: "A senha precisa ter pelo menos 6 caracteres.",
                });
            }

            const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: { name: body!.name, is_admin_staff: true },
            });

            if (authError || !authData?.user) {
                const msg = authError?.message?.toLowerCase() ?? "";
                const duplicated = msg.includes("already") || msg.includes("exists") || msg.includes("duplicate");
                return apiError(corsHeaders, {
                    status: duplicated ? 409 : 500,
                    code: duplicated ? "email_already_registered" : "auth_create_failed",
                    message: duplicated
                        ? "Este e-mail já está cadastrado no sistema. Use um e-mail diferente."
                        : "Não foi possível criar o login deste usuário.",
                    details: authError?.message,
                });
            }

            const { data: inserted, error: insertError } = await supabaseAdmin
                .from("admin_users")
                .insert({
                    auth_user_id: authData.user.id,
                    name: body!.name,
                    email,
                    is_active: body!.is_active !== false,
                    permissions: body!.permissions ?? {},
                    created_by: caller.user.id,
                })
                .select("*")
                .single();

            if (insertError) {
                await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
                return dbErrorResponse(corsHeaders, "admin_user_insert_failed", "gravar o usuário da equipe do painel", insertError);
            }

            return new Response(JSON.stringify({ success: true, admin_user: inserted }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const missingId = missingFields(corsHeaders, body!, ["id"]);
        if (missingId) return missingId;

        const { data: target, error: targetError } = await supabaseAdmin
            .from("admin_users")
            .select("id, auth_user_id, email")
            .eq("id", body!.id)
            .maybeSingle();

        if (targetError) {
            return dbErrorResponse(corsHeaders, "admin_user_lookup_failed", "localizar o usuário da equipe", targetError);
        }
        if (!target) {
            return apiError(corsHeaders, {
                status: 404,
                code: "admin_user_not_found",
                message: "Usuário da equipe não encontrado. Ele pode ter sido excluído por outra sessão.",
            });
        }

        if (action === "reset_password") {
            const missingPwd = missingFields(corsHeaders, body!, ["password"]);
            if (missingPwd) return missingPwd;
            if (String(body!.password).length < 6) {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "password_too_short",
                    message: "A senha precisa ter pelo menos 6 caracteres.",
                });
            }

            const { error } = await supabaseAdmin.auth.admin.updateUserById(target.auth_user_id, {
                password: String(body!.password),
            });
            if (error) {
                return apiError(corsHeaders, {
                    status: 500,
                    code: "password_update_failed",
                    message: "Não foi possível redefinir a senha deste usuário.",
                    details: error.message,
                });
            }
            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (action === "deactivate") {
            updates.is_active = false;
        } else {
            if (body!.name !== undefined) updates.name = body!.name;
            if (body!.permissions !== undefined) updates.permissions = body!.permissions;
            if (body!.is_active !== undefined) updates.is_active = body!.is_active;
        }

        const { data: updated, error: updateError } = await supabaseAdmin
            .from("admin_users")
            .update(updates)
            .eq("id", target.id)
            .select("*")
            .single();

        if (updateError) {
            return dbErrorResponse(corsHeaders, "admin_user_update_failed", "atualizar o usuário da equipe", updateError);
        }

        return new Response(JSON.stringify({ success: true, admin_user: updated }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error) {
        return unexpectedErrorResponse(corsHeaders, "Falha ao gerenciar a equipe do painel administrativo", error);
    }
});
