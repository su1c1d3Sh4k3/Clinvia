import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// =============================================
// Instagram FB Manual Connect (BETA)
// =============================================
// Conexão manual via Page Access Token gerado pelo dashboard Meta
// (atalho enquanto o produto "Facebook Login for Business" não está
// instalado no app). Recebe Page Token, valida, descobre Page ID e
// IG Business Account, salva e subscreve webhook.
// =============================================

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

interface ManualConnectRequest {
    user_id: string;
    page_access_token: string;
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

        const { user_id, page_access_token }: ManualConnectRequest = await req.json();

        if (!user_id || !page_access_token) {
            return jsonResp({ success: false, error: "user_id e page_access_token são obrigatórios" }, 400);
        }

        // Step 1: descobrir o Page ID + Page name a partir do token
        const meUrl = new URL(`${GRAPH}/me`);
        meUrl.searchParams.set("fields", "id,name");
        meUrl.searchParams.set("access_token", page_access_token);

        const meResp = await fetch(meUrl.toString());
        const meData = await meResp.json();

        if (!meResp.ok || meData.error) {
            return jsonResp({
                success: false,
                error: "Token inválido ou expirado: " + (meData.error?.message || "desconhecido"),
                details: meData,
            }, 400);
        }

        const pageId: string = meData.id;
        const pageName: string = meData.name || "Página";

        // Step 2: descobrir Instagram Business Account vinculada
        const igUrl = new URL(`${GRAPH}/${pageId}`);
        igUrl.searchParams.set("fields", "instagram_business_account{id,username}");
        igUrl.searchParams.set("access_token", page_access_token);

        const igResp = await fetch(igUrl.toString());
        const igData = await igResp.json();

        if (!igResp.ok || igData.error) {
            return jsonResp({
                success: false,
                error: "Falha ao descobrir conta Instagram vinculada à Página: " + (igData.error?.message || "desconhecido"),
                details: igData,
            }, 400);
        }

        const iba = igData.instagram_business_account;
        if (!iba?.id) {
            return jsonResp({
                success: false,
                error: "Esta Página não tem conta Instagram Business vinculada. Vincule no app do Instagram → Configurações → Conta → Compartilhar a outros apps → Facebook.",
            }, 400);
        }

        // Step 3: salvar/atualizar instance
        const upsert = {
            user_id,
            facebook_page_id: pageId,
            facebook_page_name: pageName,
            page_access_token,
            user_token_expires_at: null,
            instagram_business_account_id: iba.id,
            instagram_username: iba.username || "",
            status: "connected",
            last_error: null,
            updated_at: new Date().toISOString(),
        };

        const { data: existing } = await supabase
            .from("instagram_fb_instances")
            .select("id")
            .eq("user_id", user_id)
            .eq("instagram_business_account_id", iba.id)
            .maybeSingle();

        let instanceId: string;
        if (existing) {
            const { data: upd, error: updErr } = await supabase
                .from("instagram_fb_instances")
                .update(upsert)
                .eq("id", existing.id)
                .select("id")
                .single();
            if (updErr) throw updErr;
            instanceId = upd.id;
        } else {
            const { data: ins, error: insErr } = await supabase
                .from("instagram_fb_instances")
                .insert(upsert)
                .select("id")
                .single();
            if (insErr) throw insErr;
            instanceId = ins.id;
        }

        // Step 4: subscrever webhook na Page
        const subFields =
            "messages,messaging_postbacks,messaging_reactions,messaging_seen,messaging_referrals";
        const subUrl = new URL(`${GRAPH}/${pageId}/subscribed_apps`);
        subUrl.searchParams.set("subscribed_fields", subFields);
        subUrl.searchParams.set("access_token", page_access_token);

        const subResp = await fetch(subUrl.toString(), { method: "POST" });
        const subData = await subResp.json();
        const webhookOk = subResp.ok && subData?.success === true;

        await supabase
            .from("instagram_fb_instances")
            .update({
                webhook_subscribed: webhookOk,
                last_error: webhookOk ? null : `subscribed_apps: ${JSON.stringify(subData)}`,
            })
            .eq("id", instanceId);

        // Step 5: TESTE INSTANTÂNEO — chama User Profile API contra a própria
        // IGSID da business pra validar se o token consegue retornar nome+foto
        // (Se não conseguir nem pra si mesmo, há algo errado.)
        const testProfileUrl = new URL(`${GRAPH}/${iba.id}`);
        testProfileUrl.searchParams.set("fields", "name,profile_pic");
        testProfileUrl.searchParams.set("access_token", page_access_token);
        const testProfileResp = await fetch(testProfileUrl.toString());
        const testProfileData = await testProfileResp.json();

        return jsonResp({
            success: true,
            message: "Conexão BETA salva.",
            page_id: pageId,
            page_name: pageName,
            instagram_business_account_id: iba.id,
            instagram_username: iba.username,
            webhook_subscribed: webhookOk,
            webhook_response: subData,
            self_profile_test: {
                status_code: testProfileResp.status,
                response: testProfileData,
            },
        });
    } catch (err: any) {
        console.error("[IG-FB-MANUAL] Erro:", err);
        return jsonResp({ success: false, error: err.message }, 500);
    }
});

function jsonResp(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
