/**
 * Ambiente Sandbox da IA — resolução de contexto e log.
 *
 * Toda função `api-*-sandbox` resolve a sessão por aqui e registra a chamada em
 * `sandbox_api_logs` (é o container "o que a IA fez" da tela). Nada nesse módulo
 * toca tabela de produção: o catálogo real (profissionais, serviços, convênios)
 * é lido, nunca escrito.
 */

import { ApiError } from "./api-errors.ts";

/** Fluxo dedicado do sandbox no n8n (mesmas tools, sufixo -sandbox). */
export const SANDBOX_N8N_URL =
    "https://webhooks.clinvia.com.br/webhook/12517318-97c6-4c83-8481-1d8c73d73594";

export interface SandboxContext {
    userId: string;
    session: Record<string, any>;
    contact: Record<string, any>;
    conversation: Record<string, any>;
}

/**
 * Converte timestamp UTC para o fuso de São Paulo (-03:00).
 * Mesma regra do webhook de produção: nada sai daqui em UTC cru.
 */
export function toSaoPaulo(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).replace(" ", "T") + "-03:00";
}

/**
 * Cria (ou devolve) a sessão da conta com paciente fictício e conversa.
 * Versão em TS da RPC `sandbox_ensure_session`, para quem roda com service role
 * (onde `auth.uid()` é nulo e o `get_owner_id()` não resolve).
 */
export async function ensureSandboxSession(supabase: any, ownerId: string): Promise<SandboxContext> {
    let { data: session } = await supabase
        .from("sandbox_sessions").select("*").eq("user_id", ownerId).maybeSingle();
    if (!session) {
        const { data, error } = await supabase
            .from("sandbox_sessions").insert({ user_id: ownerId }).select("*").single();
        if (error) {
            throw new ApiError({
                status: 500,
                code: "sandbox_session_create_failed",
                message: `Falha ao criar o ambiente de teste desta conta: ${error.message}`,
                details: error.message,
            });
        }
        session = data;
    }

    let { data: contact } = await supabase
        .from("sandbox_contacts").select("*").eq("session_id", session.id).limit(1).maybeSingle();
    if (!contact) {
        // DDD 00 não existe no Brasil: o número jamais colide com um contato real
        const numero = "5500" + String(Math.floor(Math.random() * 1e10)).padStart(10, "0");
        const { data } = await supabase
            .from("sandbox_contacts")
            .insert({ session_id: session.id, user_id: ownerId, number: numero })
            .select("*").single();
        contact = data;
    }

    let { data: conversation } = await supabase
        .from("sandbox_conversations").select("*").eq("session_id", session.id).limit(1).maybeSingle();
    if (!conversation) {
        const { data } = await supabase
            .from("sandbox_conversations")
            .insert({ session_id: session.id, user_id: ownerId, contact_id: contact.id })
            .select("*").single();
        conversation = data;
    }

    return { userId: ownerId, session, contact, conversation };
}

/**
 * Resolve sessão + paciente fictício + conversa.
 * Aceita `conversation_id` (o que o n8n devolve nas tools) ou `user_id`.
 */
export async function loadSandboxContext(
    supabase: any,
    opts: { userId?: string | null; conversationId?: string | null },
): Promise<SandboxContext> {
    let session: any = null;

    if (opts.conversationId) {
        const { data: conv, error } = await supabase
            .from("sandbox_conversations")
            .select("*")
            .eq("id", opts.conversationId)
            .maybeSingle();
        if (error) {
            throw new ApiError({
                status: 500,
                code: "sandbox_conversation_lookup_failed",
                message: `Falha ao buscar a conversa ${opts.conversationId} no ambiente de teste: ${error.message}`,
                details: error.message,
            });
        }
        if (!conv) {
            throw new ApiError({
                status: 404,
                code: "sandbox_conversation_not_found",
                message:
                    `Conversa ${opts.conversationId} não existe no ambiente de teste. ` +
                    "O conversation_id do sandbox vem de bd_data.conversation_id do fluxo -sandbox; " +
                    "conversas reais não são aceitas aqui.",
            });
        }
        const { data: sess } = await supabase
            .from("sandbox_sessions").select("*").eq("id", conv.session_id).maybeSingle();
        session = sess;
    } else if (opts.userId) {
        const { data: sess } = await supabase
            .from("sandbox_sessions").select("*").eq("user_id", opts.userId).maybeSingle();
        session = sess;
    } else {
        throw new ApiError({
            status: 400,
            code: "sandbox_context_missing",
            message: "Informe conversation_id (bd_data.conversation_id) ou user_id para localizar o ambiente de teste.",
        });
    }

    if (!session) {
        throw new ApiError({
            status: 404,
            code: "sandbox_session_not_found",
            message:
                "Ambiente de teste não encontrado para esta conta. Abra a página Sandbox da IA no sistema " +
                "para criar o ambiente antes de chamar as APIs -sandbox.",
        });
    }

    const [{ data: contact }, { data: conversation }] = await Promise.all([
        supabase.from("sandbox_contacts").select("*").eq("session_id", session.id).limit(1).maybeSingle(),
        supabase.from("sandbox_conversations").select("*").eq("session_id", session.id).limit(1).maybeSingle(),
    ]);

    if (!contact || !conversation) {
        throw new ApiError({
            status: 409,
            code: "sandbox_session_incomplete",
            message:
                "O ambiente de teste existe mas está sem paciente fictício ou sem conversa. " +
                "Clique em Resetar na página Sandbox da IA para recriá-lo.",
        });
    }

    return { userId: session.user_id, session, contact, conversation };
}

/**
 * Registra a chamada no painel do sandbox.
 * Nunca lança: log quebrado não pode derrubar a tool da IA.
 */
export async function logSandboxCall(
    supabase: any,
    ctx: SandboxContext,
    entry: {
        function_name: string;
        /** frase pronta em português para a tela ("Consultou horários do dia 20/09") */
        label: string;
        ok?: boolean;
        status_code?: number;
        request?: unknown;
        response?: unknown;
    },
): Promise<void> {
    try {
        await supabase.from("sandbox_api_logs").insert({
            session_id: ctx.session.id,
            user_id: ctx.userId,
            function_name: entry.function_name,
            label: entry.label,
            ok: entry.ok !== false,
            status_code: entry.status_code ?? null,
            request: entry.request ?? null,
            response: entry.response ?? null,
        });
    } catch (err) {
        console.warn("[sandbox] falha ao gravar log:", err);
    }
}

/** Link público de agendamento apontando para o ambiente de teste. */
export function buildSandboxBookingLink(data: {
    user_id: string;
    contact_id: string;
    contact_name: string;
}): string {
    const bytes = new TextEncoder().encode(JSON.stringify({ ...data, instance_id: null, sandbox: true }));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `https://app.clinbia.ai/agendar?sb=1&d=${btoa(binary)}`;
}
