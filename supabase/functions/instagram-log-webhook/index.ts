import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// =============================================
// Instagram Log Webhook (proxy + tenant guard + per-message enrichment)
// =============================================
// Para CADA evento de mensagem que chega do Meta:
//   1. Loga payload bruto completo
//   2. VALIDA que entry.id é uma instance cadastrada no banco — se NÃO for,
//      NÃO encaminha (previne vazamento cruzado entre tenants do app antigo
//      que tem fallback destrutivo "Method 3b")
//   3. Se válido, encaminha para instagram-webhook
//   4. Dispara enrichment per-sender (fire-and-forget): User Profile API
//      + Conversations API + persiste foto no Storage
// =============================================

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature, x-hub-signature-256",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TARGET_URL = `${SUPABASE_URL}/functions/v1/instagram-webhook`;
const GRAPH_VERSION = "v25.0";

const enrichedRecently = new Map<string, number>();
const ENRICH_DEDUP_MS = 60_000;

// Cache de IGSIDs válidos (instances no banco) — evita query a cada webhook
let validIgsidsCache: Set<string> | null = null;
let validIgsidsCacheAt = 0;
const IGSID_CACHE_TTL_MS = 60_000;

async function getValidIgsids(supabase: SupabaseClient): Promise<Set<string>> {
    if (validIgsidsCache && Date.now() - validIgsidsCacheAt < IGSID_CACHE_TTL_MS) {
        return validIgsidsCache;
    }
    const { data } = await supabase
        .from("instagram_instances")
        .select("instagram_account_id")
        .eq("status", "connected");
    validIgsidsCache = new Set((data || []).map((r: any) => String(r.instagram_account_id)));
    validIgsidsCacheAt = Date.now();
    return validIgsidsCache;
}

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
    const headersObj: Record<string, string> = {};
    for (const [k, v] of req.headers.entries()) headersObj[k.toLowerCase()] = v;

    let payload: any = null;
    try { payload = JSON.parse(rawBody); } catch (_e) { /* keep going */ }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // ─── 1) LOG completo de cada evento + identifica entry IDs ──────────
    const senderIds: string[] = [];
    const entryIds = new Set<string>();
    if (payload) {
        try {
            const inserts: any[] = [];
            for (const e of payload.entry || []) {
                const eid = e.id ? String(e.id) : null;
                if (eid) entryIds.add(eid);
                const messaging = e.messaging || [];
                if (messaging.length === 0) {
                    inserts.push({
                        sender_id: null,
                        recipient_id: null,
                        event_type: "no_messaging",
                        has_text: false,
                        has_attachment: false,
                        referral_source: null,
                        raw_body: rawBody,
                        http_headers: headersObj,
                        full_payload: payload,
                        payload: e,
                    });
                    continue;
                }
                for (const evt of messaging) {
                    const evtType = evt.message?.is_echo ? "echo"
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
                    if (sId && !isEcho) senderIds.push(sId);
                    if (isEcho && evt.recipient?.id) senderIds.push(String(evt.recipient.id));
                    inserts.push({
                        sender_id: sId,
                        recipient_id: evt.recipient?.id ? String(evt.recipient.id) : null,
                        event_type: evtType,
                        has_text: !!evt.message?.text,
                        has_attachment: (evt.message?.attachments?.length ?? 0) > 0,
                        referral_source: referralSource,
                        raw_body: rawBody,
                        http_headers: headersObj,
                        full_payload: payload,
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
    } else {
        try {
            await supabase.from("instagram_webhook_logs").insert({
                event_type: "non_json_body",
                raw_body: rawBody,
                http_headers: headersObj,
                payload: { _non_json: true },
            });
        } catch (_e) {}
    }

    // ─── 2) TENANT GUARD ─────────────────────────────────────────────────
    // Só encaminhamos se PELO MENOS UM entry.id corresponde a uma instance
    // cadastrada. Isso bloqueia o vazamento cruzado do fallback antigo.
    const validIgsids = await getValidIgsids(supabase);
    const hasKnownEntry = Array.from(entryIds).some((id) => validIgsids.has(id));

    if (!hasKnownEntry) {
        console.warn("[IG-LOG] BLOCKED — entry.id desconhecido:", Array.from(entryIds));
        // Responde 200 pra Meta não retransmitir, mas NÃO encaminha
        return new Response(JSON.stringify({ success: true, ignored: "unknown_tenant" }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // ─── 3) FORWARD pro webhook real ────────────────────────────────────
    const fwdHeaders: Record<string, string> = { "Content-Type": "application/json" };
    const sig1 = req.headers.get("x-hub-signature");
    const sig256 = req.headers.get("x-hub-signature-256");
    if (sig1) fwdHeaders["x-hub-signature"] = sig1;
    if (sig256) fwdHeaders["x-hub-signature-256"] = sig256;

    const fwd = await fetch(TARGET_URL, { method: "POST", headers: fwdHeaders, body: rawBody });
    const respBody = await fwd.text();

    // ─── 4) ENRICHMENT (fire-and-forget) ────────────────────────────────
    const uniqueSenders = Array.from(new Set(senderIds.filter(Boolean)));
    if (uniqueSenders.length > 0) {
        const enrichPromise = (async () => {
            await new Promise((r) => setTimeout(r, 1500));
            for (const sid of uniqueSenders) {
                const last = enrichedRecently.get(sid);
                if (last && Date.now() - last < ENRICH_DEDUP_MS) continue;
                enrichedRecently.set(sid, Date.now());
                try { await enrichSender(supabase, sid); }
                catch (e) { console.warn("[IG-LOG] enrich failed for", sid, e); }
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

async function enrichSender(supabase: SupabaseClient, igsid: string) {
    const { data: contact } = await supabase
        .from("contacts")
        .select("id, user_id, push_name, profile_pic_url, instagram_instance_id")
        .eq("instagram_id", igsid)
        .eq("channel", "instagram")
        .maybeSingle();

    if (!contact) return;

    const hasRealName = contact.push_name && contact.push_name !== "Instagram User";

    let token: string | null = null;
    if (contact.instagram_instance_id) {
        const { data: inst } = await supabase
            .from("instagram_instances")
            .select("access_token")
            .eq("id", contact.instagram_instance_id)
            .maybeSingle();
        token = inst?.access_token ?? null;
    }
    if (!token) {
        const { data: anyInst } = await supabase
            .from("instagram_instances")
            .select("access_token")
            .eq("user_id", contact.user_id)
            .eq("status", "connected")
            .limit(1)
            .maybeSingle();
        token = anyInst?.access_token ?? null;
    }
    if (!token) return;

    let resolvedName: string | null = null;
    let resolvedPic: string | null = null;
    let resolvedUsername: string | null = null;

    try {
        const u = `https://graph.instagram.com/${GRAPH_VERSION}/${igsid}?fields=name,username,profile_pic&access_token=${token}`;
        const r = await fetch(u);
        const d = await r.json();
        if (r.ok && !d.error) {
            resolvedName = d.name || null;
            resolvedPic = d.profile_pic || null;
            resolvedUsername = d.username || null;
        }
    } catch (_e) {}

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
        } catch (_e) {}
    }

    const updates: Record<string, any> = {};
    const newName = resolvedName || (resolvedUsername ? `@${resolvedUsername}` : null);
    if (newName && (!hasRealName || contact.push_name === "Instagram User")) {
        updates.push_name = newName;
    }
    if (resolvedPic) {
        const permanentUrl = await persistContactPhoto(supabase, contact.id, resolvedPic);
        updates.profile_pic_url = permanentUrl || resolvedPic;
    }
    if (Object.keys(updates).length > 0) {
        await supabase.from("contacts").update(updates).eq("id", contact.id);
        console.log("[IG-LOG] enriched contact", contact.id, Object.keys(updates));
    }
}

async function persistContactPhoto(
    supabase: SupabaseClient,
    contactId: string,
    photoUrl: string
): Promise<string | null> {
    try {
        if (SUPABASE_URL && photoUrl.includes(SUPABASE_URL)) {
            const cleanUrl = photoUrl.split("?")[0];
            return `${cleanUrl}?t=${Date.now()}`;
        }

        const imageResponse = await fetch(photoUrl, {
            headers: { "User-Agent": "Mozilla/5.0 (Clinvia Webhook)" },
        });
        if (!imageResponse.ok) {
            console.warn(
                `[IG-LOG persistContactPhoto] Failed download (${imageResponse.status})`,
                photoUrl.substring(0, 80)
            );
            return null;
        }

        const imageBlob = await imageResponse.blob();
        if (imageBlob.size < 100) {
            console.warn("[IG-LOG persistContactPhoto] Image too small, likely invalid");
            return null;
        }

        const fileName = `contact_${contactId}.jpg`;
        const { error: uploadError } = await supabase.storage
            .from("avatars")
            .upload(fileName, imageBlob, {
                contentType: "image/jpeg",
                upsert: true,
            });

        if (uploadError) {
            console.error("[IG-LOG persistContactPhoto] Upload error:", uploadError);
            return null;
        }

        const { data: publicUrlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
        const permanentUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
        console.log(`[IG-LOG persistContactPhoto] Persisted photo for contact ${contactId}`);
        return permanentUrl;
    } catch (err) {
        console.error("[IG-LOG persistContactPhoto] Exception:", err);
        return null;
    }
}
