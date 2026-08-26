/**
 * Resolução padronizada de `conversation_id` para as APIs consumidas pelo n8n.
 *
 * A conversa é o dado completo: carrega contato + conexão (instância WhatsApp ou
 * conta Instagram). Desde o CRM por conexão, o card do funil é por
 * (contato, conexão) — sem a conexão não dá pra saber em qual funil mexer.
 */

import { describeDbError } from "./api-errors.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResolvedConversation {
    conversationId: string;
    contactId: string;
    userId: string;
    instanceId: string | null;
    instagramInstanceId: string | null;
    /** telefone/IGSID do contato, como está em contacts.number */
    number: string | null;
    contactName: string | null;
    status: string | null;
}

export class ConversationResolutionError extends Error {
    status: number;
    /** código estável para o n8n ramificar sem parsear texto */
    code: string;
    details?: string;
    constructor(message: string, status = 400, code = "conversation_invalid", details?: string) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

/**
 * Carrega a conversa e valida que pertence ao tenant.
 * Lança `ConversationResolutionError` (400/404) quando falta o id ou a conversa
 * não existe no tenant.
 */
export async function resolveConversation(
    supabase: any,
    conversationId: string | null | undefined,
    userId: string,
): Promise<ResolvedConversation> {
    if (!conversationId) {
        throw new ConversationResolutionError(
            "Campo obrigatório ausente: conversation_id. Envie o id da conversa (ele chega no prompt da IA como bd_data.conversation_id).",
            400,
            "conversation_id_missing",
        );
    }
    if (!UUID_RE.test(String(conversationId))) {
        throw new ConversationResolutionError(
            `conversation_id inválido: "${conversationId}" não é um UUID. Use o valor de bd_data.conversation_id sem alterações.`,
            400,
            "conversation_id_malformed",
        );
    }

    const { data, error } = await supabase
        .from("conversations")
        .select("id, contact_id, user_id, instance_id, instagram_instance_id, status, contacts(number, push_name)")
        .eq("id", conversationId)
        .maybeSingle();

    if (error) {
        throw new ConversationResolutionError(
            describeDbError("buscar a conversa informada em conversation_id", error),
            500,
            "conversation_lookup_failed",
            String((error as Record<string, unknown>)?.message ?? error ?? ""),
        );
    }
    if (!data) {
        throw new ConversationResolutionError(
            `Conversa não encontrada: nenhuma conversa com o id ${conversationId} existe neste banco. Confira se o conversation_id veio de bd_data.conversation_id e não de outro campo.`,
            404,
            "conversation_not_found",
        );
    }
    if (data.user_id !== userId) {
        throw new ConversationResolutionError(
            `A conversa ${conversationId} pertence a outra conta e não ao user_id ${userId} enviado na requisição. Envie o user_id do mesmo tenant da conversa.`,
            403,
            "conversation_wrong_tenant",
        );
    }
    if (!data.contact_id) {
        throw new ConversationResolutionError(
            `A conversa ${conversationId} não tem contato vinculado (é uma conversa de grupo). Esta ação só funciona em conversas individuais.`,
            400,
            "conversation_without_contact",
        );
    }

    return {
        conversationId: data.id,
        contactId: data.contact_id,
        userId: data.user_id,
        instanceId: data.instance_id ?? null,
        instagramInstanceId: data.instagram_instance_id ?? null,
        number: (data as any).contacts?.number ?? null,
        contactName: (data as any).contacts?.push_name ?? null,
        status: data.status ?? null,
    };
}

export interface ContactConversationRef {
    conversationId: string;
    instanceId: string | null;
    instagramInstanceId: string | null;
    status: string | null;
}

/**
 * Conversa "atual" de cada contato, para as APIs de LISTA (vendas/recorrências
 * vencidas) devolverem `conversation_id` e o n8n encadear nas demais APIs.
 * Prefere conversa aberta/pendente; senão a de atividade mais recente.
 */
export async function resolveConversationsForContacts(
    supabase: any,
    userId: string,
    contactIds: string[],
): Promise<Map<string, ContactConversationRef>> {
    const ids = [...new Set(contactIds.filter(Boolean))];
    const result = new Map<string, ContactConversationRef>();
    if (ids.length === 0) return result;

    for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const { data, error } = await supabase
            .from("conversations")
            .select("id, contact_id, status, instance_id, instagram_instance_id")
            .eq("user_id", userId)
            .in("contact_id", chunk)
            .order("last_message_at", { ascending: false, nullsFirst: false });

        if (error) {
            throw new ConversationResolutionError(
                describeDbError("buscar as conversas dos contatos da lista", error),
                500,
                "conversations_lookup_failed",
                String((error as Record<string, unknown>)?.message ?? error ?? ""),
            );
        }

        for (const row of (data || []) as any[]) {
            const current = result.get(row.contact_id);
            const isLive = row.status === "open" || row.status === "pending";
            // já ordenado por atividade desc: só troca se a nova for viva e a atual não
            if (current && !(isLive && current.status !== "open" && current.status !== "pending")) {
                continue;
            }
            result.set(row.contact_id, {
                conversationId: row.id,
                instanceId: row.instance_id ?? null,
                instagramInstanceId: row.instagram_instance_id ?? null,
                status: row.status ?? null,
            });
        }
    }

    return result;
}

/**
 * Card ativo do contato no funil daquela conexão. Card legado (sem conexão,
 * bucket sentinela) serve de fallback.
 */
export async function findActiveCardForChannel(
    supabase: any,
    conv: Pick<ResolvedConversation, "contactId" | "instanceId" | "instagramInstanceId">,
    extraColumns = "",
): Promise<any | null> {
    const cols = ["id", "stage", "instance_id", "instagram_instance_id"];
    if (extraColumns) {
        for (const c of extraColumns.split(",").map((s) => s.trim()).filter(Boolean)) {
            if (!cols.includes(c)) cols.push(c);
        }
    }

    const { data, error } = await supabase
        .from("crm_client")
        .select(cols.join(", "))
        .eq("contact_id", conv.contactId)
        .eq("is_active", true);

    if (error) {
        throw new ConversationResolutionError(
            describeDbError("buscar a negociação ativa do contato no funil desta conexão", error),
            500,
            "crm_card_lookup_failed",
            String((error as Record<string, unknown>)?.message ?? error ?? ""),
        );
    }
    const rows = (data || []) as any[];

    return (
        rows.find((c) =>
            c.instance_id === conv.instanceId &&
            c.instagram_instance_id === conv.instagramInstanceId
        ) ||
        rows.find((c) => !c.instance_id && !c.instagram_instance_id) ||
        null
    );
}
