// supabase/functions/_shared/uazapi-menu.ts
// -----------------------------------------------------------------------------
// Lightweight wrappers around the UazAPI /send/menu and /send/text endpoints
// that also log the outbound message into public.messages — matching the
// pattern used in supabase/functions/evolution-send-message/index.ts.
//
// Used by the Delivery Automation flow (dispatcher/worker/respond).
//
// NOTE: The message_type enum has: text,image,audio,video,document,sticker,
// reaction,contact — there is NO 'button'. We always use 'text' as the
// message_type; the body field holds the prompt text (same behavior as
// the rest of the app treats outbound messages).
// -----------------------------------------------------------------------------

export interface MenuButton {
    /** Stable id that comes back in webhook as selectedID/buttonOrListid. */
    id: string;
    /** Visible label on the button. */
    text: string;
}

export interface SendMenuParams {
    supabase: any;          // service_role client
    userId: string;
    conversationId: string;
    instanceApikey: string; // instances.apikey
    number: string;         // recipient phone (digits only or @s.whatsapp.net)
    text: string;           // prompt body
    footerText?: string;
    buttons: MenuButton[];
    trackSource?: string;
    trackId?: string;
}

export interface SendResult {
    messageId: string;        // messages.id (DB row)
    providerId: string | null; // uazapi messageid/id when available
}

const UAZAPI_BASE = "https://clinvia.uazapi.com";

/** Strip '@s.whatsapp.net' / '@lid' / '@g.us' and non-digits. */
function normalizeNumber(n: string): string {
    if (!n) return "";
    const at = n.indexOf("@");
    const base = at >= 0 ? n.slice(0, at) : n;
    return base.replace(/\D/g, "");
}

async function logOutbound(
    supabase: any,
    conversationId: string,
    userId: string,
    body: string,
    providerId: string | null,
): Promise<string> {
    const { data, error } = await supabase
        .from("messages")
        .insert({
            conversation_id: conversationId,
            body,
            direction: "outbound",
            message_type: "text",
            evolution_id: providerId,
            user_id: userId,
            status: "sent",
        })
        .select("id")
        .single();

    if (error) throw new Error(`Failed to log outbound message: ${error.message}`);
    return data.id;
}

/**
 * Send an interactive button menu via UazAPI /send/menu and log it as an
 * outbound message in the conversation.
 */
export async function sendMenu(params: SendMenuParams): Promise<SendResult> {
    const {
        supabase, userId, conversationId, instanceApikey,
        number, text, footerText, buttons, trackSource, trackId,
    } = params;

    if (!buttons || buttons.length === 0) {
        throw new Error("sendMenu: at least one button is required");
    }

    const choices = buttons.map((b) => `${b.text}|${b.id}`);

    const body: Record<string, unknown> = {
        number: normalizeNumber(number),
        type: "button",
        text,
        choices,
    };
    if (footerText) body.footerText = footerText;
    if (trackSource) body.track_source = trackSource;
    if (trackId) body.track_id = trackId;

    // Honor a test flag so Python integration tests can assert DB state
    // without actually calling UazAPI.
    const mock = Deno.env.get("UAZAPI_MOCK") === "1";
    let providerId: string | null = null;

    if (!mock) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
            const res = await fetch(`${UAZAPI_BASE}/send/menu`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "token": instanceApikey,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`UazAPI /send/menu failed (${res.status}): ${err}`);
            }
            const data = await res.json().catch(() => ({}));
            providerId = data?.messageid || data?.id || null;
        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
        }
    } else {
        console.log("[uazapi-menu] UAZAPI_MOCK=1 — skipping HTTP, logging only. payload:", body);
        providerId = `mock_${crypto.randomUUID()}`;
    }

    const messageId = await logOutbound(supabase, conversationId, userId, text, providerId);
    return { messageId, providerId };
}

export interface SendTextParams {
    supabase: any;
    userId: string;
    conversationId: string;
    instanceApikey: string;
    number: string;
    text: string;
}

/** Send a plain text message via UazAPI /send/text + log to DB. */
export async function sendText(params: SendTextParams): Promise<SendResult> {
    const { supabase, userId, conversationId, instanceApikey, number, text } = params;

    const payload = { number: normalizeNumber(number), text };
    const mock = Deno.env.get("UAZAPI_MOCK") === "1";
    let providerId: string | null = null;

    if (!mock) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        try {
            const res = await fetch(`${UAZAPI_BASE}/send/text`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "token": instanceApikey,
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`UazAPI /send/text failed (${res.status}): ${err}`);
            }
            const data = await res.json().catch(() => ({}));
            providerId = data?.messageid || data?.id || null;
        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
        }
    } else {
        console.log("[uazapi-menu] UAZAPI_MOCK=1 — skipping HTTP text. payload:", payload);
        providerId = `mock_${crypto.randomUUID()}`;
    }

    const messageId = await logOutbound(supabase, conversationId, userId, text, providerId);
    return { messageId, providerId };
}
