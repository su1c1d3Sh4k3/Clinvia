import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// =============================================
// Instagram FB OAuth Callback (BETA)
// =============================================
// Fluxo: Facebook Login for Business → Page Access Token
//
// Diferenças vs `instagram-oauth-callback` (produção):
//   - Endpoint OAuth é graph.facebook.com (não graph.instagram.com)
//   - Token usado é Page Access Token (não Instagram User Token)
//   - Suporta o User Profile API com permissões de Page (resolve o
//     problema de novos contatos sem nome/foto)
//
// Documentação 2026:
//   https://developers.facebook.com/docs/messenger-platform/instagram/get-started
//   https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started/
//
// Permissions necessárias (configuradas no Meta App Dashboard):
//   - instagram_basic
//   - instagram_manage_messages
//   - pages_manage_metadata
//   - pages_show_list (recomendado para listar /me/accounts)
// =============================================

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// IMPORTANTE: usa o MESMO App ID/Secret do app Meta (App é único; o que
// muda é o produto OAuth consumido — Facebook Login vs Instagram Login)
const FB_APP_ID = Deno.env.get("INSTAGRAM_APP_ID") || Deno.env.get("FB_APP_ID") || "";
const FB_APP_SECRET = Deno.env.get("INSTAGRAM_APP_SECRET") || Deno.env.get("FB_APP_SECRET") || "";

const GRAPH_VERSION = "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

interface OAuthRequest {
    code: string;
    redirect_uri: string;
    user_id: string; // auth.uid do usuário Clinvia
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        const { code, redirect_uri, user_id }: OAuthRequest = await req.json();

        if (!code || !redirect_uri || !user_id) {
            return jsonResp({ success: false, error: "Missing required fields: code, redirect_uri, user_id" }, 400);
        }

        if (!FB_APP_ID || !FB_APP_SECRET) {
            return jsonResp({ success: false, error: "FB_APP_ID/FB_APP_SECRET not configured in Supabase secrets" }, 500);
        }

        console.log("[IG-FB-OAUTH] Processing callback for user:", user_id);

        // ---------------------------------------------------------
        // Step 1: Exchange code → short-lived User Access Token
        // ---------------------------------------------------------
        const tokenUrl = new URL(`${GRAPH}/oauth/access_token`);
        tokenUrl.searchParams.set("client_id", FB_APP_ID);
        tokenUrl.searchParams.set("client_secret", FB_APP_SECRET);
        tokenUrl.searchParams.set("redirect_uri", redirect_uri);
        tokenUrl.searchParams.set("code", code);

        const tokenResp = await fetch(tokenUrl.toString());
        const tokenData = await tokenResp.json();

        if (!tokenResp.ok || tokenData.error) {
            console.error("[IG-FB-OAUTH] Token exchange failed:", tokenData);
            return jsonResp({
                success: false,
                error: tokenData.error?.message || "Failed to exchange code for token",
                details: tokenData
            }, 400);
        }

        const shortLivedUserToken: string = tokenData.access_token;

        // ---------------------------------------------------------
        // Step 2: Short-lived → long-lived User Token (60 dias)
        // ---------------------------------------------------------
        const longUrl = new URL(`${GRAPH}/oauth/access_token`);
        longUrl.searchParams.set("grant_type", "fb_exchange_token");
        longUrl.searchParams.set("client_id", FB_APP_ID);
        longUrl.searchParams.set("client_secret", FB_APP_SECRET);
        longUrl.searchParams.set("fb_exchange_token", shortLivedUserToken);

        const longResp = await fetch(longUrl.toString());
        const longData = await longResp.json();

        let userAccessToken = shortLivedUserToken;
        let userTokenExpiresAt: string | null = null;

        if (longResp.ok && longData.access_token) {
            userAccessToken = longData.access_token;
            const expiresIn = longData.expires_in || 5184000; // 60 dias default
            userTokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
            console.log("[IG-FB-OAUTH] Long-lived user token obtido, expires_in:", expiresIn);
        } else {
            console.warn("[IG-FB-OAUTH] Falha ao trocar para long-lived; usando short-lived:", longData);
        }

        // ---------------------------------------------------------
        // Step 3: Listar Pages do usuário com Instagram vinculado
        // ---------------------------------------------------------
        const pagesUrl = new URL(`${GRAPH}/me/accounts`);
        pagesUrl.searchParams.set(
            "fields",
            "id,name,access_token,instagram_business_account{id,username,profile_picture_url,name}"
        );
        pagesUrl.searchParams.set("access_token", userAccessToken);

        const pagesResp = await fetch(pagesUrl.toString());
        const pagesData = await pagesResp.json();

        if (!pagesResp.ok || pagesData.error) {
            console.error("[IG-FB-OAUTH] /me/accounts falhou:", pagesData);
            return jsonResp({
                success: false,
                error: "Falha ao listar Pages do Facebook",
                details: pagesData
            }, 400);
        }

        const allPages: any[] = pagesData.data || [];
        const pagesWithIG = allPages.filter((p) => p.instagram_business_account?.id);

        if (pagesWithIG.length === 0) {
            return jsonResp({
                success: false,
                error: "Nenhuma Página do Facebook vinculada a uma conta Instagram Business foi encontrada. Vincule a conta no Instagram → Configurações → Conta → Compartilhar a outros apps → Facebook.",
                pages_found: allPages.length
            }, 400);
        }

        // ---------------------------------------------------------
        // Step 4: Salvar cada Page-IG conectada
        // ---------------------------------------------------------
        const saved: any[] = [];
        for (const page of pagesWithIG) {
            const iba = page.instagram_business_account;

            // Page Access Token (este é o que usaremos pra tudo daqui pra frente)
            const pageAccessToken: string = page.access_token;
            const pageId: string = page.id;
            const pageName: string = page.name;
            const ibaId: string = iba.id;
            const ibaUsername: string = iba.username || "";

            const upsert = {
                user_id,
                facebook_page_id: pageId,
                facebook_page_name: pageName,
                page_access_token: pageAccessToken,
                user_token_expires_at: userTokenExpiresAt,
                instagram_business_account_id: ibaId,
                instagram_username: ibaUsername,
                status: "connected",
                last_error: null,
                updated_at: new Date().toISOString(),
            };

            const { data: existing } = await supabase
                .from("instagram_fb_instances")
                .select("id")
                .eq("user_id", user_id)
                .eq("instagram_business_account_id", ibaId)
                .maybeSingle();

            let instanceId: string | null = null;

            if (existing) {
                const { data: upd, error: updErr } = await supabase
                    .from("instagram_fb_instances")
                    .update(upsert)
                    .eq("id", existing.id)
                    .select("id")
                    .single();
                if (updErr) {
                    console.error("[IG-FB-OAUTH] Update falhou:", updErr);
                    continue;
                }
                instanceId = upd.id;
            } else {
                const { data: ins, error: insErr } = await supabase
                    .from("instagram_fb_instances")
                    .insert(upsert)
                    .select("id")
                    .single();
                if (insErr) {
                    console.error("[IG-FB-OAUTH] Insert falhou:", insErr);
                    continue;
                }
                instanceId = ins.id;
            }

            // ---------------------------------------------------------
            // Step 5: Subscrever webhook na Page
            // ---------------------------------------------------------
            // O webhook do Messenger Platform é por Page (não por IG)
            const subFields =
                "messages,messaging_postbacks,messaging_reactions,messaging_seen,messaging_referrals";
            const subUrl = new URL(`${GRAPH}/${pageId}/subscribed_apps`);
            subUrl.searchParams.set("subscribed_fields", subFields);
            subUrl.searchParams.set("access_token", pageAccessToken);

            const subResp = await fetch(subUrl.toString(), { method: "POST" });
            const subData = await subResp.json();

            const webhookOk = subResp.ok && subData?.success === true;

            if (instanceId) {
                await supabase
                    .from("instagram_fb_instances")
                    .update({
                        webhook_subscribed: webhookOk,
                        last_error: webhookOk ? null : `subscribed_apps: ${JSON.stringify(subData)}`,
                    })
                    .eq("id", instanceId);
            }

            saved.push({
                page_id: pageId,
                page_name: pageName,
                instagram_business_account_id: ibaId,
                instagram_username: ibaUsername,
                webhook_subscribed: webhookOk,
                webhook_response: subData,
            });
        }

        return jsonResp({
            success: true,
            message: `Conexão BETA criada. ${saved.length} conta(s) vinculada(s).`,
            instances: saved,
        });
    } catch (err: any) {
        console.error("[IG-FB-OAUTH] Erro inesperado:", err);
        return jsonResp({ success: false, error: err.message }, 500);
    }
});

function jsonResp(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
