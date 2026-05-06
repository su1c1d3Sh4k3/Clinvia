import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// =============================================
// Instagram Enrich Profiles
// =============================================
// Roda a cada 30 min via pg_cron. Para cada instagram_instances conectada,
// chama a Conversations API e, para cada participant que aparecer,
// atualiza o contato local com `push_name = '@username'` quando o contato
// estiver atualmente como "Instagram User".
//
// Por que: o User Profile API direto retorna 100/33 para a maioria dos
// senders novos (política de privacidade do Meta sem "user consent").
// Mas a Conversations API retorna o `username` desses senders desde que
// haja um histórico mínimo de troca de mensagens — é a forma oficial
// documentada pelo Meta de obter username quando a User Profile API falha.
// =============================================

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = "v25.0";

interface Participant {
    username?: string;
    id?: string;
}

interface Conversation {
    id: string;
    participants?: { data: Participant[] };
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const stats = {
        instances_processed: 0,
        instances_failed: 0,
        conversations_seen: 0,
        contacts_updated: 0,
        contacts_skipped: 0,
        errors: [] as Array<{ instance_id: string; error: string }>,
    };

    try {
        const { data: instances } = await supabase
            .from("instagram_instances")
            .select("id, user_id, access_token, instagram_account_id, account_name")
            .eq("status", "connected");

        for (const inst of instances || []) {
            try {
                stats.instances_processed++;

                // Conversations API — limit alto para pegar tudo
                const url =
                    `https://graph.instagram.com/${GRAPH_VERSION}/me/conversations` +
                    `?fields=participants&platform=instagram&limit=500` +
                    `&access_token=${inst.access_token}`;

                const resp = await fetch(url);
                const data = await resp.json();

                if (!resp.ok || data.error) {
                    stats.instances_failed++;
                    stats.errors.push({
                        instance_id: inst.id,
                        error: data.error?.message || `HTTP ${resp.status}`,
                    });
                    continue;
                }

                const conversations: Conversation[] = data.data || [];
                stats.conversations_seen += conversations.length;

                for (const conv of conversations) {
                    const participants = conv.participants?.data || [];
                    for (const p of participants) {
                        // Pula a própria business account
                        if (!p.id || !p.username) continue;
                        if (p.id === inst.instagram_account_id) continue;

                        // Procura contato local com esse instagram_id e dono
                        const { data: contact } = await supabase
                            .from("contacts")
                            .select("id, push_name, profile_pic_url")
                            .eq("instagram_id", p.id)
                            .eq("user_id", inst.user_id)
                            .maybeSingle();

                        if (!contact) {
                            stats.contacts_skipped++;
                            continue;
                        }

                        // Atualiza só se o nome atual for genérico
                        const isGeneric =
                            !contact.push_name ||
                            contact.push_name === "Instagram User" ||
                            contact.push_name.startsWith("@") === false === false; // already-named contacts pulam

                        const shouldUpdateName =
                            !contact.push_name ||
                            contact.push_name === "Instagram User";

                        if (!shouldUpdateName) {
                            stats.contacts_skipped++;
                            continue;
                        }

                        const { error: updErr } = await supabase
                            .from("contacts")
                            .update({ push_name: `@${p.username}` })
                            .eq("id", contact.id);

                        if (updErr) {
                            stats.errors.push({
                                instance_id: inst.id,
                                error: `update contact ${contact.id}: ${updErr.message}`,
                            });
                            continue;
                        }
                        stats.contacts_updated++;
                    }
                }
            } catch (err: any) {
                stats.instances_failed++;
                stats.errors.push({ instance_id: inst.id, error: err.message });
            }
        }

        return new Response(JSON.stringify({ success: true, stats }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (err: any) {
        console.error("[IG-ENRICH] fatal:", err);
        return new Response(JSON.stringify({ success: false, error: err.message, stats }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
