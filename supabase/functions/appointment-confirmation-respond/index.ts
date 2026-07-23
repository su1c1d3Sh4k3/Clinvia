// supabase/functions/appointment-confirmation-respond/index.ts
// -----------------------------------------------------------------------------
// Inbound handler for Appointment Confirmation sessions. Invoked by DB trigger
// on messages INSERT when an active session exists for the incoming contact.
// Advances the state machine based on button taps or free-text responses.
//
// State machine:
//   awaiting_confirmation → (confirm|reschedule|cancel|human|retry)
//   awaiting_cancel_reason → completed (after receiving reason text)
//   awaiting_feedback_rating → (positive→completed | negative→awaiting_feedback_detail)
//   awaiting_feedback_detail → completed (after receiving detail text)
// -----------------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { sendText } from "../_shared/uazapi-menu.ts";
import { isMetaInstance } from "../_shared/automation-instance.ts";
import { sendMetaText } from "../_shared/system-templates.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RespondInput {
    conversationId: string;
    contactId: string;
    userId: string;
    rawMessage: string | null;
    buttonId: string | null;
    buttonText: string | null;
}

const TERMINAL = new Set(["completed", "transferred", "failed"]);

// ---------------------------------------------------------------------------
// Button ID inference from free text
// ---------------------------------------------------------------------------

function inferButtonId(raw: string | null): string {
    if (!raw) return "";
    const s = raw.trim().toLowerCase();
    if (!s) return "";

    // Flow 1: confirmation buttons
    if ((s.includes("sim") && s.includes("confirmar")) || s === "sim") return "ac_confirm";
    if (s.includes("reagendar")) return "ac_reschedule";
    if (s.includes("não vou") || s.includes("nao vou")) return "ac_cancel";
    if (s.includes("secretaria") || s.includes("secretária")) return "ac_human";

    // Numeric options (from retry message)
    if (/^(opção |opcao )?1$/.test(s)) return "ac_confirm";
    if (/^(opção |opcao )?2$/.test(s)) return "ac_reschedule";
    if (/^(opção |opcao )?3$/.test(s)) return "ac_cancel";
    if (/^(opção |opcao )?4$/.test(s)) return "ac_human";

    // Flow 3: feedback buttons
    if (s.includes("excelente")) return "ac_fb_5";
    if (s.includes("muito bom")) return "ac_fb_4";
    if (s === "regular") return "ac_fb_3";
    if (s.includes("precisa melhorar")) return "ac_fb_2";
    if (s.includes("insatisfeito")) return "ac_fb_1";

    return "";
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    try {
        const body: RespondInput = await req.json();
        if (!body?.contactId) return json({ error: "contactId required" }, 400);

        // Load most recent active session
        const { data: sessions, error: sErr } = await supabase
            .from("appointment_confirmation_sessions")
            .select("*")
            .eq("contact_id", body.contactId)
            .not("state", "in", `(${Array.from(TERMINAL).join(",")})`)
            .order("created_at", { ascending: false })
            .limit(1);
        if (sErr) throw sErr;

        const session = Array.isArray(sessions) && sessions.length > 0 ? sessions[0] : null;
        if (!session) {
            return json({ success: true, skipped: true, reason: "no active session" });
        }

        // Load instance
        const { data: instance } = await supabase
            .from("instances")
            .select("id, apikey, provider, instance_name")
            .eq("id", session.instance_id)
            .maybeSingle();
        const instIsMeta = instance ? isMetaInstance(instance) : false;
        if (!instance || (!instIsMeta && !instance.apikey)) {
            return json({ success: false, error: "instance not found or no apikey" }, 400);
        }

        // Load contact
        const { data: contact } = await supabase
            .from("contacts")
            .select("id, push_name, number")
            .eq("id", session.contact_id)
            .single();
        if (!contact) {
            return json({ success: false, error: "contact not found" }, 400);
        }

        // Resolve buttonId
        let buttonId = (body.buttonId || "").trim();
        if (!buttonId) {
            buttonId = inferButtonId(body.buttonText) || inferButtonId(body.rawMessage);
        }

        console.log(`[ac-respond] session=${session.id} state=${session.state} buttonId='${buttonId}' raw='${(body.rawMessage || "").slice(0, 60)}'`);

        const ctx: SessionContext = {
            supabase,
            session,
            instance,
            isMeta: instIsMeta,
            contact,
            userId: session.user_id,
            conversationId: session.conversation_id,
            firstName: (contact.push_name || "").split(" ")[0] || "cliente",
        };

        let result: { newState: string; action: string };

        switch (session.state) {
            case "awaiting_confirmation":
                result = await handleAwaitingConfirmation(ctx, buttonId, body.rawMessage);
                break;
            case "awaiting_cancel_reason":
                result = await handleAwaitingCancelReason(ctx, body.rawMessage);
                break;
            case "awaiting_feedback_rating":
                result = await handleAwaitingFeedbackRating(ctx, buttonId, body.rawMessage);
                break;
            case "awaiting_feedback_detail":
                result = await handleAwaitingFeedbackDetail(ctx, body.rawMessage);
                break;
            default:
                result = { newState: session.state, action: "ignored" };
        }

        return json({ success: true, ...result });
    } catch (error) {
        console.error("[ac-respond] error:", error);
        return json({ success: false, error: String(error?.message || error) }, 500);
    }
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionContext {
    supabase: any;
    session: any;
    instance: { id: string; apikey: string | null; provider: string | null; instance_name: string | null };
    isMeta: boolean;
    contact: { id: string; push_name: string | null; number: string };
    userId: string;
    conversationId: string;
    firstName: string;
}

// ---------------------------------------------------------------------------
// State: awaiting_confirmation (Flow 1 — 24h before)
// ---------------------------------------------------------------------------

async function handleAwaitingConfirmation(
    ctx: SessionContext,
    buttonId: string,
    rawMessage: string | null,
): Promise<{ newState: string; action: string }> {
    const { supabase, session, firstName } = ctx;

    // Option 1: Confirm
    if (buttonId === "ac_confirm") {
        for (const aptId of session.appointment_ids) {
            await supabase.from("appointments")
                .update({ status: "confirmed" })
                .eq("id", aptId);
        }

        // Keep CRM at Pós-Venda (api-scheduling or frontend may reset to Agendado)
        await forceQueuePosVenda(ctx);

        await send(ctx, `Perfeito ${firstName}, amanhã uma hora antes eu entro em contato para te lembrar do atendimento. Muito obrigado estamos te aguardando!`);
        await markSession(supabase, session.id, {
            state: "completed",
            ended_at: new Date().toISOString(),
        });
        return { newState: "completed", action: "confirmed" };
    }

    // Option 2: Reschedule
    if (buttonId === "ac_reschedule") {
        const token = btoa(JSON.stringify({
            user_id: session.user_id,
            contact_id: session.contact_id,
            contact_name: firstName,
        }));
        const link = `https://app.clinbia.ai/agendar?d=${token}`;

        await send(ctx, `Te entendo ${firstName}, imprevistos acontecem, pra reagendar pro dia que fica melhor pra você, acesse esse link e escolha um novo dia e horario, é bem simples e não precisa confirmar nenhum dado: ${link}`);
        await markSession(supabase, session.id, {
            state: "completed",
            ended_at: new Date().toISOString(),
        });
        return { newState: "completed", action: "reschedule_link_sent" };
    }

    // Option 3: Cancel
    if (buttonId === "ac_cancel") {
        await send(ctx, "Qual o motivo da desistencia para podermos realizar o cancelamento?");
        await markSession(supabase, session.id, {
            state: "awaiting_cancel_reason",
            invalid_response_count: 0,
        });
        return { newState: "awaiting_cancel_reason", action: "asked_cancel_reason" };
    }

    // Option 4: Talk to secretary (only from retry)
    if (buttonId === "ac_human") {
        await moveCrmToStage(ctx, "Em Atendimento Humano");
        await moveConversationToQueue(ctx, "Atendimento Humano");
        await markSession(supabase, session.id, {
            state: "transferred",
            ended_at: new Date().toISOString(),
        });
        return { newState: "transferred", action: "transferred_to_human" };
    }

    // Free text — send retry with 4 options
    await send(ctx,
        "Essa é uma mensagem automatica de confirmação, utilize uma das opções para dar continuidade:\n" +
        "- Opção 1: Sim, pode confirmar\n" +
        "- Opção 2: Vou precisar reagendar\n" +
        "- Opção 3: Não vou poder ir\n" +
        "- Opção 4: Preciso falar com a secretaria"
    );
    await markSession(supabase, session.id, {
        invalid_response_count: (session.invalid_response_count || 0) + 1,
    });
    return { newState: "awaiting_confirmation", action: "retry_sent" };
}

// ---------------------------------------------------------------------------
// State: awaiting_cancel_reason (Flow 1 — after choosing cancel)
// ---------------------------------------------------------------------------

async function handleAwaitingCancelReason(
    ctx: SessionContext,
    rawMessage: string | null,
): Promise<{ newState: string; action: string }> {
    const { supabase, session } = ctx;
    const reason = (rawMessage || "").trim();

    if (!reason) {
        await send(ctx, "Por favor, nos conte o motivo do cancelamento.");
        return { newState: "awaiting_cancel_reason", action: "asked_again" };
    }

    // Cancel all appointments in the group
    for (const aptId of session.appointment_ids) {
        await supabase.from("appointments")
            .update({ status: "canceled" })
            .eq("id", aptId);
    }

    // Move CRM to Perdido with loss_reason
    await moveCrmToStage(ctx, "Perdido", reason);

    await send(ctx, "Entendi, seu agendamento foi cancelado. Caso mude de ideia, estamos à disposição.");
    await markSession(supabase, session.id, {
        state: "completed",
        cancel_reason: reason,
        ended_at: new Date().toISOString(),
    });
    return { newState: "completed", action: "canceled_with_reason" };
}

// ---------------------------------------------------------------------------
// State: awaiting_feedback_rating (Flow 3 — 24h after)
// ---------------------------------------------------------------------------

const RATING_MAP: Record<string, { nota: number; label: string; needsDetail: boolean }> = {
    ac_fb_5: { nota: 5, label: "Excelente", needsDetail: false },
    ac_fb_4: { nota: 4, label: "Muito bom", needsDetail: false },
    ac_fb_3: { nota: 3, label: "Regular", needsDetail: true },
    ac_fb_2: { nota: 2, label: "Precisa melhorar", needsDetail: true },
    ac_fb_1: { nota: 1, label: "Insatisfeito", needsDetail: true },
};

async function handleAwaitingFeedbackRating(
    ctx: SessionContext,
    buttonId: string,
    rawMessage: string | null,
): Promise<{ newState: string; action: string }> {
    const { supabase, session, firstName } = ctx;
    const rating = RATING_MAP[buttonId];

    if (!rating) {
        // Free text — retry
        await send(ctx, "Essa é uma mensagem automatica, por favor utilize uma das opções acima para dar seu feedback.");
        await markSession(supabase, session.id, {
            invalid_response_count: (session.invalid_response_count || 0) + 1,
        });
        return { newState: "awaiting_feedback_rating", action: "retry_sent" };
    }

    // Save NPS
    await supabase.rpc("add_nps_entry", {
        p_contact_id: session.contact_id,
        p_nota: rating.nota,
        p_feedback: "",
    });

    if (!rating.needsDetail) {
        // Excelente or Muito bom — done
        await send(ctx, "Muito obrigado, sua opinião é muito importante para que nós possamos melhorar a cada dia, esperamos ver você novamente até breve");
        await moveCrmGanhoOrFinalizado(ctx);
        await markSession(supabase, session.id, {
            state: "completed",
            selected_rating: buttonId,
            ended_at: new Date().toISOString(),
        });
        return { newState: "completed", action: `feedback_${rating.label}` };
    }

    // Needs detail — ask for it
    if (rating.nota === 3) {
        await send(ctx, "Peço desculpas que não teve a melhor experiencia em nossa clínica, poderia dizer o que poderiamos melhorar?");
    } else {
        await send(ctx, "Peço perdão se deixamos a desejar, estamos buscando melhorar a cada dia, se puder por gentileza dizer o que te desagradou para que não cometamos o mesmo erro novamente.");
    }

    await markSession(supabase, session.id, {
        state: "awaiting_feedback_detail",
        selected_rating: buttonId,
    });
    return { newState: "awaiting_feedback_detail", action: "asked_feedback_detail" };
}

// ---------------------------------------------------------------------------
// State: awaiting_feedback_detail (Flow 3 — after negative rating)
// ---------------------------------------------------------------------------

async function handleAwaitingFeedbackDetail(
    ctx: SessionContext,
    rawMessage: string | null,
): Promise<{ newState: string; action: string }> {
    const { supabase, session } = ctx;
    const feedbackText = (rawMessage || "").trim();

    if (!feedbackText) {
        await send(ctx, "Por favor, nos conte sobre sua experiência.");
        return { newState: "awaiting_feedback_detail", action: "asked_again" };
    }

    // Append feedback to conversation summary in bold
    const { data: conv } = await supabase
        .from("conversations")
        .select("summary")
        .eq("id", session.conversation_id)
        .maybeSingle();

    const existingSummary = conv?.summary || "";
    const newSummary = existingSummary
        ? `${existingSummary}\n\n**Feedback NPS:** ${feedbackText}`
        : `**Feedback NPS:** ${feedbackText}`;

    await supabase.from("conversations")
        .update({ summary: newSummary })
        .eq("id", session.conversation_id);

    // CRM actions
    await moveCrmGanhoOrFinalizado(ctx);

    await markSession(supabase, session.id, {
        state: "completed",
        feedback_text: feedbackText,
        ended_at: new Date().toISOString(),
    });
    return { newState: "completed", action: "feedback_detail_saved" };
}

// ---------------------------------------------------------------------------
// CRM Helpers
// ---------------------------------------------------------------------------

async function moveCrmToStage(ctx: SessionContext, stage: string, lossReason?: string) {
    const patch: Record<string, unknown> = {
        stage,
        stage_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    if (lossReason) patch.loss_reason = lossReason;

    await ctx.supabase
        .from("crm_client")
        .update(patch)
        .eq("contact_id", ctx.session.contact_id)
        .eq("user_id", ctx.session.user_id)
        .eq("is_active", true);

    // Re-force queue to Pós-Venda after CRM change (trigger may reset it)
    await forceQueuePosVenda(ctx);
}

async function moveCrmGanhoOrFinalizado(ctx: SessionContext) {
    const { data: crmCard } = await ctx.supabase
        .from("crm_client")
        .select("id, stage")
        .eq("contact_id", ctx.session.contact_id)
        .eq("user_id", ctx.session.user_id)
        .eq("is_active", true)
        .maybeSingle();

    if (!crmCard) return;

    // Resolve conversation BEFORE moving CRM to terminal stage
    // (trigger only affects status IN pending/open, so resolved is safe)
    await ctx.supabase
        .from("conversations")
        .update({ status: "resolved", updated_at: new Date().toISOString() })
        .eq("id", ctx.session.conversation_id);

    const newStage = crmCard.stage === "Ganho" ? "Finalizado" : "Ganho";
    await ctx.supabase
        .from("crm_client")
        .update({
            stage: newStage,
            stage_changed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("id", crmCard.id);
}

async function moveConversationToQueue(ctx: SessionContext, queueName: string) {
    const { data: queue } = await ctx.supabase
        .from("queues")
        .select("id")
        .eq("user_id", ctx.session.user_id)
        .eq("name", queueName)
        .maybeSingle();

    if (queue?.id) {
        await ctx.supabase
            .from("conversations")
            .update({
                queue_id: queue.id,
                updated_at: new Date().toISOString(),
            })
            .eq("id", ctx.session.conversation_id);
    }
}

/** Force conversation queue to Pós-Venda — used after CRM changes that trigger sync */
async function forceQueuePosVenda(ctx: SessionContext) {
    const { data: pvQueue } = await ctx.supabase
        .from("queues")
        .select("id")
        .eq("user_id", ctx.session.user_id)
        .eq("name", "Pós-Venda")
        .maybeSingle();
    if (pvQueue?.id) {
        await ctx.supabase
            .from("conversations")
            .update({ queue_id: pvQueue.id, updated_at: new Date().toISOString() })
            .eq("id", ctx.session.conversation_id);
    }
}

// ---------------------------------------------------------------------------
// Messaging helpers
// ---------------------------------------------------------------------------

async function send(ctx: SessionContext, text: string) {
    if (ctx.isMeta) {
        // Cliente acabou de responder → janela de 24h aberta → texto livre permitido
        await sendMetaText({ conversationId: ctx.conversationId, text });
        return;
    }
    await sendText({
        supabase: ctx.supabase,
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        instanceApikey: ctx.instance.apikey!,
        number: ctx.contact.number,
        text,
    });
}

async function markSession(supabase: any, id: string, patch: Record<string, unknown>) {
    const { error } = await supabase
        .from("appointment_confirmation_sessions")
        .update(patch)
        .eq("id", id);
    if (error) throw error;
}

function json(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}
