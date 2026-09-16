// Verificacao em duas etapas do painel administrativo.
//
// Fluxo: /admin-oath valida e-mail + senha -> chama `request` -> recebemos o
// JWT ja valido, geramos um codigo de 6 caracteres e mandamos por e-mail ->
// a tela pede o codigo -> `verify` confere e grava a linha em
// admin_2fa_verifications que o guard do /admin le.
//
// SEGURANCA:
// - o codigo NUNCA volta na resposta; so o SHA-256 vai para o banco;
// - `request` so emite para super-admin ou admin_users ativo — quem tem login
//   na plataforma mas nao e da equipe do painel nao consegue nem disparar
//   e-mail;
// - cada pedido invalida o codigo anterior E a verificacao anterior daquela
//   sessao, entao todo login passa pela tela de codigo;
// - 5 tentativas erradas queimam o codigo.
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
import { emailCodigoAdmin, sendEmail } from "../_shared/emails.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_ACTIONS = ["request", "verify"];

/** Destino do codigo quando o usuario nao tem two_factor_email cadastrado
 *  (inclui o super-admin, que nem tem linha em admin_users). */
const FALLBACK_EMAILS = (Deno.env.get("ADMIN_2FA_FALLBACK_EMAILS") ??
    "suicideshake@gmail.com,bruhdias09@gmail.com")
    .split(",").map((e) => e.trim()).filter(Boolean);

/** Sem 0/O/1/I/L: o codigo e digitado a mao a partir do e-mail. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const CODE_TTL_MINUTES = 5;
const MAX_ATTEMPTS = 5;

function generateCode(): string {
    const bytes = new Uint8Array(CODE_LENGTH);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

async function sha256(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** joao.silva@gmail.com -> jo****va@gmail.com (a tela mostra para onde foi). */
function maskEmail(email: string): string {
    const [user, domain] = email.split("@");
    if (!domain) return "***";
    const visible = user.length <= 4 ? user.slice(0, 1) : user.slice(0, 2);
    const tail = user.length <= 4 ? "" : user.slice(-2);
    return `${visible}${"*".repeat(Math.max(2, user.length - visible.length - tail.length))}${tail}@${domain}`;
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabaseAdmin = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const authHeader = req.headers.get("Authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (!token) {
            return apiError(corsHeaders, {
                status: 401,
                code: "auth_missing",
                message: "Header Authorization ausente. Faça login novamente no painel administrativo.",
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
        const userId = caller.user.id;

        const { body, response } = await readJsonBody(req, corsHeaders);
        if (response) return response;

        const action = String(body!.action ?? "");
        if (!VALID_ACTIONS.includes(action)) {
            return unknownAction(corsHeaders, body!.action, VALID_ACTIONS);
        }

        const missingSession = missingFields(corsHeaders, body!, ["session_id"]);
        if (missingSession) return missingSession;
        const sessionId = String(body!.session_id);

        /* ------------------------------------------------------- request */

        if (action === "request") {
            // Quem pode receber codigo: super-admin ou membro ativo da equipe.
            const { data: profile, error: profileError } = await supabaseAdmin
                .from("profiles")
                .select("role, full_name")
                .eq("id", userId)
                .maybeSingle();
            if (profileError) {
                return dbErrorResponse(corsHeaders, "profile_lookup_failed", "verificar o cargo de quem pediu o código", profileError);
            }

            const { data: adminUser, error: adminError } = await supabaseAdmin
                .from("admin_users")
                .select("id, name, two_factor_email, is_active")
                .eq("auth_user_id", userId)
                .maybeSingle();
            if (adminError) {
                return dbErrorResponse(corsHeaders, "admin_user_lookup_failed", "localizar o usuário na equipe do painel", adminError);
            }

            const isSuperAdmin = profile?.role === "super-admin";
            if (!isSuperAdmin && !(adminUser && adminUser.is_active)) {
                return apiError(corsHeaders, {
                    status: 403,
                    code: "forbidden",
                    message: "Esta conta não faz parte da equipe do painel administrativo.",
                });
            }

            const configured = String(adminUser?.two_factor_email ?? "").trim();
            const recipients = configured ? [configured] : FALLBACK_EMAILS;
            if (recipients.length === 0) {
                return apiError(corsHeaders, {
                    status: 500,
                    code: "no_2fa_recipient",
                    message: "Nenhum e-mail cadastrado para receber o código de acesso. Avise o super-admin.",
                });
            }

            // Queima o codigo anterior e derruba a verificacao da sessao: cada
            // login tem de passar pela tela do codigo.
            const { error: burnError } = await supabaseAdmin
                .from("admin_login_codes")
                .update({ consumed_at: new Date().toISOString() })
                .eq("auth_user_id", userId)
                .is("consumed_at", null);
            if (burnError) {
                return dbErrorResponse(corsHeaders, "code_invalidate_failed", "invalidar os códigos anteriores", burnError);
            }

            const { error: clearError } = await supabaseAdmin
                .from("admin_2fa_verifications")
                .delete()
                .eq("auth_user_id", userId)
                .eq("session_id", sessionId);
            if (clearError) {
                return dbErrorResponse(corsHeaders, "verification_clear_failed", "limpar a verificação anterior", clearError);
            }

            const code = generateCode();
            const { error: insertError } = await supabaseAdmin
                .from("admin_login_codes")
                .insert({
                    auth_user_id: userId,
                    session_id: sessionId,
                    code_hash: await sha256(code),
                    sent_to: recipients,
                    expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
                });
            if (insertError) {
                return dbErrorResponse(corsHeaders, "code_insert_failed", "gravar o código de acesso", insertError);
            }

            // Aqui o envio NAO pode ser fire-and-forget: sem e-mail o admin fica
            // preso na tela do codigo, entao a falha tem de virar erro na tela.
            try {
                await sendEmail({
                    to: recipients,
                    ...emailCodigoAdmin({
                        full_name: adminUser?.name ?? profile?.full_name ?? undefined,
                        login_email: caller.user.email ?? "",
                        code,
                        validade: `${CODE_TTL_MINUTES} minutos`,
                    }),
                });
            } catch (e) {
                console.error("[admin-2fa] envio do código falhou:", (e as Error).message);
                return apiError(corsHeaders, {
                    status: 502,
                    code: "email_send_failed",
                    message: "Não foi possível enviar o código de acesso por e-mail. Tente novamente em instantes.",
                    details: (e as Error).message,
                });
            }

            return new Response(
                JSON.stringify({ success: true, sent_to: recipients.map(maskEmail), expires_in_minutes: CODE_TTL_MINUTES }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
        }

        /* -------------------------------------------------------- verify */

        const missingCode = missingFields(corsHeaders, body!, ["code"]);
        if (missingCode) return missingCode;
        const typed = String(body!.code).trim().toUpperCase();

        const { data: pending, error: pendingError } = await supabaseAdmin
            .from("admin_login_codes")
            .select("id, code_hash, attempts, expires_at")
            .eq("auth_user_id", userId)
            .eq("session_id", sessionId)
            .is("consumed_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (pendingError) {
            return dbErrorResponse(corsHeaders, "code_lookup_failed", "localizar o código de acesso", pendingError);
        }

        if (!pending || new Date(pending.expires_at).getTime() < Date.now()) {
            return apiError(corsHeaders, {
                status: 400,
                code: "code_expired",
                message: "O código expirou ou já foi usado. Faça login de novo para receber um código novo.",
            });
        }

        if (await sha256(typed) !== pending.code_hash) {
            const attempts = (pending.attempts ?? 0) + 1;
            const burned = attempts >= MAX_ATTEMPTS;
            await supabaseAdmin
                .from("admin_login_codes")
                .update({ attempts, ...(burned ? { consumed_at: new Date().toISOString() } : {}) })
                .eq("id", pending.id);

            return apiError(corsHeaders, {
                status: 400,
                code: burned ? "code_burned" : "code_invalid",
                message: burned
                    ? "Código incorreto pela última vez. Este código foi bloqueado — faça login de novo."
                    : `Código incorreto. Você ainda tem ${MAX_ATTEMPTS - attempts} tentativa(s).`,
            });
        }

        const { error: consumeError } = await supabaseAdmin
            .from("admin_login_codes")
            .update({ consumed_at: new Date().toISOString(), attempts: (pending.attempts ?? 0) + 1 })
            .eq("id", pending.id);
        if (consumeError) {
            return dbErrorResponse(corsHeaders, "code_consume_failed", "encerrar o código usado", consumeError);
        }

        const { error: verifyError } = await supabaseAdmin
            .from("admin_2fa_verifications")
            .upsert(
                { auth_user_id: userId, session_id: sessionId, verified_at: new Date().toISOString() },
                { onConflict: "auth_user_id,session_id" },
            );
        if (verifyError) {
            return dbErrorResponse(corsHeaders, "verification_write_failed", "liberar o acesso ao painel", verifyError);
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error) {
        return unexpectedErrorResponse(corsHeaders, "Falha na verificação em duas etapas do painel", error);
    }
});
