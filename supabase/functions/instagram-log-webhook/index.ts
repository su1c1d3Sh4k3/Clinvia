import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// =============================================
// Instagram Log Webhook (proxy/tee + per-message enrichment)
// =============================================
// Recebe o webhook do Meta, faz três coisas:
//   1. Loga o payload bruto em instagram_webhook_logs
//   2. Encaminha para instagram-webhook (intacta) — processa a mensagem
//   3. Dispara enrichment de perfil para CADA sender (fire-and-forget):
//      - Tenta User Profile API direto (graph.instagram.com/{igsid}?fields=name,profile_pic)
//      - Se falhar, busca o username via Conversations API
//      - Atualiza o contato com nome real + foto (ou @username se só esse vier)
// =============================================

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature, x-hub-signature-256",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TARGET_URL = `${SUPABASE_URL}/functions/v1/instagram-webhook`;
const GRAPH_VERSION = "v25.0";

// Cache em memória pra evitar refazer enrichment desnecessário do mesmo sender
// na mesma execução (uma DM em rajada gera vários eventos).
const enrichedRecently = new Map<string, number>();
const ENRICH_DEDUP_MS = 60_000; // não tenta o mesmo sender novamente em <1min

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    if (req.method === "GET") {
        const targetUrl = new URL(TARGET_URL);
        const incoming = new URL(req.url);
        for (const [k, v] of incoming.searchParams) targetUrl.searchParams.set(k, v);
        const fwd = await fetch(targetUrl.toString(), { method: "GET" });
        return new Response(await fwd.text(), {
            status: fwd.status,
            headers: { "Content-Type": fwd.headers.get("Content-Type") || "text/plain" },
        });
    }

    if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const rawBody = await req.text();
    let payload: any = null;
    try {
        payload = JSON.parse(rawBody);
    } catch (_e) { /* keep going */ }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // 1) LOG do payload bruto
    const senderIds: string[] = [];
    if (payload) {
        try {
            const inserts: any[] = [];
            for (const e of payload.entry || []) {
                for (const evt of e.messaging || []) {
                    const evtType = evt.message?.is_echo
                        ? "echo"
                        : evt.message ? "message"
                        : evt.postback ? "postback"
                        : evt.reaction ? "reaction"
                        : evt.referral ? "referral"
                        : evt.read ? "seen"
                        : "unknown";
                    const referralSource =
                        evt.referral?.source ||
                        evt.referral?.type ||
                        evt.message?.referral?.source ||
                        evt.postback?.referral?.source ||
                        null;
                    const sId = evt.sender?.id ? String(evt.sender.id) : null;
                    const isEcho = evt.message?.is_echo === true;
                    // Pra inbound coletamos o sender; pra echo o "cliente" é o recipient
                    if (sId && !isEcho) senderIds.push(sId);
                    if (isEcho && evt.recipient?.id) senderIds.push(String(evt.recipient.id));
                    inserts.push({
                        sender_id: sId,
                        recipient_id: evt.recipient?.id ? String(evt.recipient.id) : null,
                        event_type: evtType,
                        has_text: !!evt.message?.text,
                        has_attachment: (evt.message?.attachments?.length ?? 0) > 0,
                        referral_source: referralSource,
                        payload: evt,
                    });
                }
            }
            if (inserts.length > 0) {
                supabase.from("instagram_webhook_logs").insert(inserts).then(({ error }: any) => {
                    if (error) console.warn("[IG-LOG] insert error:", error);
                });
            }
        } catch (logErr) {
            console.warn("[IG-LOG] log block failed:", logErr);
        }
    }

    // 2) FORWARD para a função real
    const fwdHeaders: Record<string, string> = { "Content-Type": "application/json" };
    const sig1 = req.headers.get("x-hub-signature");
    const sig256 = req.headers.get("x-hub-signature-256");
    if (sig1) fwdHeaders["x-hub-signature"] = sig1;
    if (sig256) fwdHeaders["x-hub-signature-256"] = sig256;

    const fwd = await fetch(TARGET_URL, {
        method: "POST",
        headers: fwdHeaders,
        body: rawBody,
    });
    const respBody = await fwd.text();

    // 3) ENRICHMENT per-sender (fire-and-forget — não bloqueia a resposta)
    // Damos uns 1.5s pra função instagram-webhook criar/atualizar o contato
    // antes de tentarmos enriquecer (assim contact existe).
    const uniqueSenders = Array.from(new Set(senderIds.filter(Boolean)));
    if (uniqueSenders.length > 0) {
        const enrichPromise = (async () => {
            await new Promise((r) => setTimeout(r, 1500));
            for (const sid of uniqueSenders) {
                const last = enrichedRecently.get(sid);
                if (last && Date.now() - last < ENRICH_DEDUP_MS) continue;
                enrichedRecently.set(sid, Date.now());
                try {
                    await enrichSender(supabase, sid);
                } catch (e) {
                    console.warn("[IG-LOG] enrich failed for", sid, e);
                }
            }
        })();
        // deno-lint-ignore no-explicit-any
        (globalThis as any).EdgeRuntime?.waitUntil?.(enrichPromise);
    }

    return new Response(respBody, {
        status: fwd.status,
        headers: { "Content-Type": fwd.headers.get("Content-Type") || "application/json" },
    });
});

// =============================================
// Enrichment helper
// =============================================
// Estratégia em cascata:
//   1) Lookup do contato local + instance dele (precisamos do access_token)
//   2) Tenta User Profile API direta (graph.instagram.com/{igsid}?fields=name,username,profile_pic)
//      → dá nome+foto pra senders com "user consent" (DM limpa)
//   3) Se name/foto ainda faltarem, varre /me/conversations?fields=participants
//      e pega o username quando o sender aparecer como participante
//   4) Atualiza contact: nome real > @username > "Instagram User"
async function enrichSender(supabase: SupabaseClient, igsid: string) {
    // Acha o contato + instance dele
    const { data: contact } = await supabase
        .from("contacts")
        .select("id, user_id, push_name, profile_pic_url, instagram_instance_id")
        .eq("instagram_id", igsid)
        .eq("channel", "instagram")
        .maybeSingle();

    if (!contact) return; // ainda não criado pela função principal — próxima rodada pega

    const hasRealName = contact.push_name && contact.push_name !== "Instagram User";
    const hasPhoto = !!contact.profile_pic_url;
    if (hasRealName && hasPhoto) return; // tudo certo

    // Pega o token da instance dele
    let token: string | null = null;
    let igAccountId: string | null = null;

    if (contact.instagram_instance_id) {
        const { data: inst } = await supabase
            .from("instagram_instances")
            .select("access_token, instagram_account_id")
            .eq("id", contact.instagram_instance_id)
            .maybeSingle();
        token = inst?.access_token ?? null;
        igAccountId = inst?.instagram_account_id ?? null;
    }
    if (!token) {
        // fallback: pega qualquer instance ativa do mesmo dono
        const { data: anyInst } = await supabase
            .from("instagram_instances")
            .select("access_token, instagram_account_id")
            .eq("user_id", contact.user_id)
            .eq("status", "connected")
            .limit(1)
            .maybeSingle();
        token = anyInst?.access_token ?? null;
        igAccountId = anyInst?.instagram_account_id ?? null;
    }
    if (!token) return;

    let resolvedName: string | null = null;
    let resolvedPic: string | null = null;
    let resolvedUsername: string | null = null;

    // ── Tentativa 1: User Profile API direta ──────────────────────────
    try {
        const u = `https://graph.instagram.com/${GRAPH_VERSION}/${igsid}?fields=name,username,profile_pic&access_token=${token}`;
        const r = await fetch(u);
        const d = await r.json();
        if (r.ok && !d.error) {
            resolvedName = d.name || null;
            resolvedPic = d.profile_pic || null;
            resolvedUsername = d.username || null;
        }
    } catch (_e) { /* ignore */ }

    // ── Tentativa 2: Conversations API (busca participants) ────────────
    if (!resolvedName && !resolvedUsername) {
        try {
            const u = `https://graph.instagram.com/${GRAPH_VERSION}/me/conversations?fields=participants&platform=instagram&limit=200&access_token=${token}`;
            const r = await fetch(u);
            const d = await r.json();
            if (r.ok && !d.error) {
                outer: for (const conv of d.data || []) {
                    for (const p of conv.participants?.data || []) {
                        if (String(p.id) === igsid && p.username) {
                            resolvedUsername = p.username;
                            break outer;
                        }
                    }
                }
            }
        } catch (_e) { /* ignore */ }
    }

    // ── Decisão de update ──────────────────────────────────────────────
    const updates: Record<string, any> = {};
    const newName = resolvedName || (resolvedUsername ? `@${resolvedUsername}` : null);
    if (newName && (!hasRealName || contact.push_name === "Instagram User")) {
        updates.push_name = newName;
    }
    if (resolvedPic && !hasPhoto) {
        updates.profile_pic_url = resolvedPic;
    }

    if (Object.keys(updates).length > 0) {
        await supabase.from("contacts").update(updates).eq("id", contact.id);
        console.log("[IG-LOG] enriched contact", contact.id, updates);
    }
}
