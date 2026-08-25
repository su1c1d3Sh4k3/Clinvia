import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * ia-create-workflow
 *
 * Disparado quando o usuário LIGA ou DESLIGA a IA em /ia-config?tab=settings.
 * Envia server-side (token da instância nunca passa pelo browser) um payload
 * para o n8n criar/remover o workflow da conta:
 *   POST https://webhooks.clinvia.com.br/webhook/criar_workflow   (action create)
 *   POST https://webhooks.clinvia.com.br/webhook/deleta_workflow  (action delete)
 *   { user_id, instance_name: <nome da empresa>, phone, token }
 *
 * Regras (user, 2026-08-25): dispara SEMPRE que o switch muda (mesmo já havendo
 * workflow); fire-and-forget (resposta do n8n ignorada); instance_name leva o
 * NOME DA EMPRESA (ia_config.name) nos dois casos, phone/token vêm da instância
 * conectada (preferência: com apikey/UAZAPI, senão a primeira conectada).
 */

const WEBHOOK_URLS = {
    create: "https://webhooks.clinvia.com.br/webhook/criar_workflow",
    delete: "https://webhooks.clinvia.com.br/webhook/deleta_workflow",
} as const;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

const digits = (s: string | null | undefined) => (s || "").split("@")[0].replace(/\D/g, "");

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const body = await req.json().catch(() => ({}));
        const action: "create" | "delete" = body?.action === "delete" ? "delete" : "create";

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // ── Autenticação + resolução do owner (team-aware) ──
        const authHeader = req.headers.get("Authorization") || "";
        const { data: { user }, error: userError } = await supabase.auth.getUser(
            authHeader.replace("Bearer ", "")
        );
        if (userError || !user) return json({ error: "Não autorizado" }, 401);

        let ownerId = user.id;
        const { data: teamMember } = await supabase
            .from("team_members")
            .select("user_id")
            .eq("auth_user_id", user.id)
            .maybeSingle();
        if (teamMember?.user_id) ownerId = teamMember.user_id;

        // ── Nome da empresa (ia_config.name) ──
        const { data: cfg } = await supabase
            .from("ia_config")
            .select("name")
            .eq("user_id", ownerId)
            .maybeSingle();

        // ── Instância conectada: preferir a que tem apikey (UAZAPI) ──
        const { data: instances } = await supabase
            .from("instances")
            .select("id, apikey, client_number, created_at")
            .eq("user_id", ownerId)
            .eq("status", "connected")
            .order("created_at", { ascending: true });

        const list = instances || [];
        const inst = list.find((i: any) => i.apikey) || list[0] || null;

        const payload = {
            user_id: ownerId,
            instance_name: cfg?.name || "",
            phone: digits(inst?.client_number),
            token: inst?.apikey || "",
        };

        // Fire-and-forget: resposta do n8n é ignorada (regra do user); falha de
        // rede não bloqueia o toggle da IA, mas fica logada.
        try {
            const resp = await fetch(WEBHOOK_URLS[action], {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            console.log(`[ia-create-workflow] ${action} sent for ${ownerId}: status=${resp.status}`);
        } catch (err) {
            console.error(`[ia-create-workflow] ${action} webhook send failed for ${ownerId}:`, err);
        }

        return json({ success: true });
    } catch (err) {
        console.error("[ia-create-workflow] error:", err);
        return json({ error: String((err as any)?.message || err) }, 500);
    }
});
