import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * meta-quality-status
 *
 * Retorna, para cada instância Meta conectada do owner autenticado:
 * - quality_rating (GREEN/YELLOW/RED/NA), messaging_limit_tier, throughput.level,
 *   verified_name e display_phone_number (Graph API, tempo real)
 * - uso da janela de 24h (contatos únicos com mensagem outbound) e quando a janela renova
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API = "https://graph.facebook.com/v22.0";

const TIER_LIMITS: Record<string, number | null> = {
    TIER_50: 50,
    TIER_250: 250,
    TIER_1K: 1000,
    TIER_10K: 10000,
    TIER_100K: 100000,
    TIER_UNLIMITED: null,
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
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

        // ── Instâncias Meta conectadas do owner ──
        const { data: instances } = await supabase
            .from("instances")
            .select("id, instance_name, name, meta_access_token, meta_phone_number_id")
            .eq("user_id", ownerId)
            .eq("provider", "meta")
            .eq("status", "connected");

        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const results = [];

        for (const inst of instances || []) {
            const item: Record<string, unknown> = {
                instance_id: inst.id,
                instance_name: inst.name || inst.instance_name,
            };

            // Graph API: qualidade + tier + throughput
            try {
                const resp = await fetch(
                    `${GRAPH_API}/${inst.meta_phone_number_id}?fields=quality_rating,messaging_limit_tier,display_phone_number,verified_name,throughput`,
                    { headers: { Authorization: `Bearer ${inst.meta_access_token}` } }
                );
                if (resp.ok) {
                    const d = await resp.json();
                    item.quality_rating = d.quality_rating || "NA";
                    item.messaging_limit_tier = d.messaging_limit_tier || null;
                    item.tier_limit = d.messaging_limit_tier != null
                        ? (TIER_LIMITS[d.messaging_limit_tier] ?? null)
                        : null;
                    item.display_phone_number = d.display_phone_number || null;
                    item.verified_name = d.verified_name || null;
                    item.throughput_level = d.throughput?.level || null;
                } else {
                    const err = await resp.json().catch(() => ({}));
                    item.error = err?.error?.message || `Graph API ${resp.status}`;
                }
            } catch (e) {
                item.error = (e as Error).message;
            }

            // Uso da janela de 24h: contatos únicos com outbound nesta instância
            try {
                const { data: convs } = await supabase
                    .from("conversations")
                    .select("id, contact_id")
                    .eq("instance_id", inst.id);
                const convIds = (convs || []).map((c) => c.id);
                const contactByConv = new Map((convs || []).map((c) => [c.id, c.contact_id]));

                // Primeiro outbound de cada contato dentro da janela (ordem de "consumo" do limite)
                const firstOutboundByContact = new Map<string, string>();

                // Pagina em blocos de conversation_ids para não estourar a URL
                for (let i = 0; i < convIds.length; i += 200) {
                    const chunk = convIds.slice(i, i + 200);
                    const { data: msgs } = await supabase
                        .from("messages")
                        .select("conversation_id, created_at")
                        .in("conversation_id", chunk)
                        .eq("direction", "outbound")
                        .gte("created_at", since);
                    for (const m of msgs || []) {
                        const contactId = contactByConv.get(m.conversation_id);
                        if (!contactId) continue;
                        const prev = firstOutboundByContact.get(contactId);
                        if (!prev || m.created_at < prev) firstOutboundByContact.set(contactId, m.created_at);
                    }
                }

                const used = firstOutboundByContact.size;
                item.used_24h = used;

                // Timer só roda após EXCEDER o limite do tier; reinicia a cada +50% do
                // limite excedido (1,5x, 2x, 2,5x...). Âncora = envio que cruzou o
                // último threshold; janela renova 24h depois dele.
                const limitVal = typeof item.tier_limit === "number" ? item.tier_limit : null;
                let resetsAt: string | null = null;
                if (limitVal != null && limitVal > 0 && used >= limitVal) {
                    const steps = Math.floor((used / limitVal - 1) / 0.5); // quantos +50% já cruzou
                    const thresholdCount = Math.min(used, Math.ceil(limitVal * (1 + 0.5 * steps)));
                    const times = [...firstOutboundByContact.values()].sort();
                    const crossTs = times[thresholdCount - 1];
                    resetsAt = new Date(new Date(crossTs).getTime() + 24 * 60 * 60 * 1000).toISOString();
                }
                item.window_resets_at = resetsAt;
            } catch (e) {
                console.warn("[meta-quality-status] usage calc failed:", (e as Error).message);
                item.used_24h = null;
                item.window_resets_at = null;
            }

            results.push(item);
        }

        return json({ instances: results });
    } catch (err) {
        console.error("[meta-quality-status] Error:", err);
        return json({ error: (err as Error).message }, 400);
    }
});
