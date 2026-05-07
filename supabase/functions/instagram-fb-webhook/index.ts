import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// =============================================
// Instagram FB Webhook (BETA)
// =============================================
// Recebe webhooks da Page do Facebook contendo eventos de Instagram
// Direct Messages. Diferente do `instagram-webhook` (produção):
//
//   - O `entry.id` é o PAGE ID (não o IGBA ID)
//   - O User Profile API é chamado em graph.facebook.com (não graph.instagram.com)
//   - O token é o Page Access Token
//   - TODO payload bruto é salvo em instagram_fb_webhook_logs para auditoria
//
// Documentação 2026:
//   https://developers.facebook.com/docs/messenger-platform/instagram/features/webhook/
//   https://developers.facebook.com/docs/messenger-platform/instagram/features/user-profile/
//
// IMPORTANTE: este edge function precisa rodar com verify_jwt=false
// porque a Meta NÃO envia Authorization header.
// =============================================

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_VERSION = "v25.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Token de verificação do webhook (precisa ser igual ao configurado no Meta App)
const VERIFY_TOKEN =
    Deno.env.get("INSTAGRAM_FB_VERIFY_TOKEN") ||
    Deno.env.get("INSTAGRAM_VERIFY_TOKEN") ||
    "clinvia_instagram_webhook_verify_2024";

serve(async (req) => {
    const url = new URL(req.url);
    const method = req.method;

    if (method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    // ---------------------------------------------------------
    // GET — handshake de verificação do webhook
    // ---------------------------------------------------------
    if (method === "GET") {
        const hubMode = url.searchParams.get("hub.mode");
        const hubChallenge = url.searchParams.get("hub.challenge");
        const hubVerifyToken = url.searchParams.get("hub.verify_token");

        if (hubMode === "subscribe" && hubVerifyToken === VERIFY_TOKEN) {
            console.log("[IG-FB-WEBHOOK] ✅ Verification successful");
            return new Response(hubChallenge || "", {
                status: 200,
                headers: { "Content-Type": "text/plain" },
            });
        }
        return new Response("Verification failed", { status: 403, headers: corsHeaders });
    }

    if (method !== "POST") {
        return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    // ---------------------------------------------------------
    // POST — eventos de mensagem
    // ---------------------------------------------------------
    const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let payload: any;
    try {
        payload = await req.json();
    } catch (_e) {
        return jsonResp({ error: "Invalid JSON" }, 400);
    }

    const objectType = payload.object; // 'page' OR 'instagram'
    const entries: any[] = payload.entry || [];

    console.log("[IG-FB-WEBHOOK] object:", objectType, "| entries:", entries.length);

    for (const entry of entries) {
        // Para o Messenger Platform com IG via FB Login, entry.id é o PAGE_ID.
        // Para o IG Login direto (legacy), entry.id é o IGBA_ID.
        // Suportamos os dois.
        const entryId = String(entry.id);

        // Tenta achar instance por facebook_page_id, depois por instagram_business_account_id
        const { data: instance } = await supabase
            .from("instagram_fb_instances")
            .select("*")
            .or(`facebook_page_id.eq.${entryId},instagram_business_account_id.eq.${entryId}`)
            .eq("status", "connected")
            .maybeSingle();

        if (!instance) {
            console.warn("[IG-FB-WEBHOOK] Nenhuma instance encontrada para entry.id =", entryId);
            // Salva o log mesmo assim para debug
            await supabase.from("instagram_fb_webhook_logs").insert({
                page_id: entryId,
                payload: entry,
                notes: "no_matching_instance",
            });
            continue;
        }

        const userId = instance.user_id;
        const pageAccessToken = instance.page_access_token;

        // Eventos de mensagem
        const messaging = entry.messaging || [];
        for (const event of messaging) {
            const senderId: string | undefined = event.sender?.id;
            const recipientId: string | undefined = event.recipient?.id;
            const isEcho: boolean = event.message?.is_echo === true;

            // O remetente para mensagens inbound é o cliente. Para echo (msg
            // que a Page enviou) o sender é a própria Page.
            const customerIgsid = isEcho ? recipientId : senderId;

            if (!customerIgsid) {
                console.warn("[IG-FB-WEBHOOK] Sem sender/recipient ID; pulando");
                continue;
            }

            // ---------------------------------------------------------
            // Buscar perfil do remetente via User Profile API
            // (graph.facebook.com com Page Access Token — esse é o ponto
            //  CHAVE que a integração antiga não tinha)
            // ---------------------------------------------------------
            let profileName: string | null = null;
            let profilePicUrl: string | null = null;
            let profileStatusCode = 0;
            let profileResponseRaw: any = null;

            try {
                const profileUrl = new URL(`${GRAPH}/${customerIgsid}`);
                profileUrl.searchParams.set("fields", "name,profile_pic");
                profileUrl.searchParams.set("access_token", pageAccessToken);

                const pResp = await fetch(profileUrl.toString());
                profileStatusCode = pResp.status;
                profileResponseRaw = await pResp.json();

                if (pResp.ok && !profileResponseRaw.error) {
                    profileName = profileResponseRaw.name || null;
                    profilePicUrl = profileResponseRaw.profile_pic || null;
                } else {
                    console.warn(
                        "[IG-FB-WEBHOOK] User Profile API erro para",
                        customerIgsid,
                        profileResponseRaw
                    );
                }
            } catch (err) {
                console.error("[IG-FB-WEBHOOK] Falha na User Profile API:", err);
            }

            // ---------------------------------------------------------
            // Log estruturado do payload bruto + resposta da Profile API
            // ---------------------------------------------------------
            await supabase.from("instagram_fb_webhook_logs").insert({
                page_id: entryId,
                sender_id: customerIgsid,
                payload: event,
                user_profile_response: profileResponseRaw,
                user_profile_status_code: profileStatusCode,
                instance_id: instance.id,
                notes: isEcho ? "echo" : "inbound",
            });

            // ---------------------------------------------------------
            // Upsert do contato — usa channel='instagram_fb' para isolar
            // dos contatos do fluxo de produção
            // ---------------------------------------------------------
            let contactId: string | null = null;
            const { data: existingContact } = await supabase
                .from("contacts")
                .select("id, push_name, profile_pic_url")
                .eq("instagram_id", customerIgsid)
                .eq("user_id", userId)
                .eq("channel", "instagram_fb")
                .maybeSingle();

            if (existingContact) {
                contactId = existingContact.id;
                // Atualiza se conseguimos dados novos
                const updates: any = {};
                if (profileName && (!existingContact.push_name || existingContact.push_name === "Instagram User")) {
                    updates.push_name = profileName;
                }
                if (profilePicUrl && !existingContact.profile_pic_url) {
                    updates.profile_pic_url = profilePicUrl;
                }
                if (Object.keys(updates).length > 0) {
                    await supabase.from("contacts").update(updates).eq("id", contactId);
                }
            } else {
                const { data: newContact, error: cErr } = await supabase
                    .from("contacts")
                    .insert({
                        instagram_id: customerIgsid,
                        number: `instagram_fb:${customerIgsid}`,
                        push_name: profileName || "Instagram User",
                        profile_pic_url: profilePicUrl,
                        channel: "instagram_fb",
                        user_id: userId,
                        is_group: false,
                    })
                    .select("id")
                    .single();
                if (cErr) {
                    console.error("[IG-FB-WEBHOOK] Erro criando contato:", cErr);
                    continue;
                }
                contactId = newContact.id;
            }

            // ---------------------------------------------------------
            // Conversa
            // ---------------------------------------------------------
            let conversationId: string | null = null;
            const { data: existingConv } = await supabase
                .from("conversations")
                .select("id, status")
                .eq("contact_id", contactId)
                .eq("user_id", userId)
                .in("status", ["open", "pending"])
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();

            if (existingConv) {
                conversationId = existingConv.id;
                if (existingConv.status === "pending") {
                    await supabase
                        .from("conversations")
                        .update({ status: "open" })
                        .eq("id", existingConv.id);
                }
            } else {
                const { data: newConv } = await supabase
                    .from("conversations")
                    .insert({
                        contact_id: contactId,
                        user_id: userId,
                        status: "open",
                        channel: "instagram_fb",
                        last_message_at: new Date().toISOString(),
                    })
                    .select("id")
                    .single();
                conversationId = newConv?.id ?? null;
            }

            if (!conversationId) {
                console.error("[IG-FB-WEBHOOK] Não foi possível obter/criar conversa");
                continue;
            }

            // ---------------------------------------------------------
            // Mensagem
            // ---------------------------------------------------------
            const message = event.message;
            if (!message) continue; // delivery / read / etc — pulamos por enquanto

            const messageId: string = message.mid;
            const messageText: string = message.text || "";
            const attachments: any[] = message.attachments || [];

            // Dedupe
            const { data: dup } = await supabase
                .from("messages")
                .select("id")
                .eq("evolution_id", messageId)
                .maybeSingle();
            if (dup) continue;

            let mediaUrl: string | null = null;
            let messageType = "text";
            if (attachments.length > 0) {
                messageType = attachments[0].type || "text";
                mediaUrl = attachments[0].payload?.url || null;
            }

            await supabase.from("messages").insert({
                conversation_id: conversationId,
                body: messageText || (mediaUrl ? "Mídia" : ""),
                direction: isEcho ? "outbound" : "inbound",
                message_type: messageType,
                evolution_id: messageId,
                user_id: userId,
                media_url: mediaUrl,
                status: "received",
                sender_name: isEcho ? null : profileName || "Instagram User",
                sender_profile_pic_url: isEcho ? null : profilePicUrl,
            });

            await supabase
                .from("conversations")
                .update({
                    last_message: messageText || "Mídia",
                    last_message_at: new Date().toISOString(),
                })
                .eq("id", conversationId);
        }
    }

    // Meta exige resposta 200 rápido (≤ 20s) ou retransmite
    return jsonResp({ success: true });
});

function jsonResp(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
