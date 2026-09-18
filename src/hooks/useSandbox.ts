import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "./useOwnerId";

/**
 * Ambiente Sandbox da IA — estado da página /ia-sandbox.
 *
 * Tudo pendura em `sandbox_sessions` (uma por conta): o paciente fictício, a
 * conversa, os agendamentos, o CRM e o consumo de tokens. Nada aqui toca em
 * tabela de produção e nenhuma mensagem sai por WhatsApp.
 *
 * A resposta da IA chega de forma assíncrona (o n8n chama
 * `api-send-message-sandbox`, que grava em `sandbox_messages`), por isso o chat
 * e os painéis fazem polling curto enquanto a página está aberta.
 */

export interface SandboxSession {
    id: string;
    user_id: string;
    agenda_mode: "real" | "livre";
    tone_settings: unknown;
    tone_inject: string | null;
    created_at: string;
    updated_at: string;
}

export interface SandboxContact {
    id: string;
    push_name: string;
    number: string;
    email: string | null;
    cpf: string | null;
    company: string | null;
    instagram: string | null;
    patient: boolean;
    client_stage: string;
    convenio_ids: string[];
    ia_context_reset_at: string | null;
}

export interface SandboxMessage {
    id: string;
    role: "user" | "assistant" | "system";
    content: string;
    message_type: string;
    media_url: string | null;
    created_at: string;
}

export interface SandboxApiLog {
    id: string;
    function_name: string;
    label: string;
    ok: boolean;
    status_code: number | null;
    created_at: string;
}

export interface SandboxCrmCard {
    id: string;
    stage: string;
    is_active: boolean;
    notes: string | null;
    updated_at: string;
}

export interface SandboxCrmHistory {
    id: string;
    from_stage: string | null;
    to_stage: string;
    created_at: string;
}

export interface SandboxAppointment {
    id: string;
    professional_id: string | null;
    service_id: string | null;
    title: string | null;
    start_time: string;
    end_time: string;
    status: string;
    notes: string | null;
}

export interface SandboxSale {
    id: string;
    service_client_id: string | null;
    appointment_id: string | null;
    service_name: string | null;
    value: number;
    sale_date: string;
    payment_type: string | null;
}

export interface SandboxCampaign {
    id: string;
    name: string;
    campaign_tag: string | null;
    objective: string | null;
    ai_prompt: string | null;
    initial_message: string | null;
    services: string[];
    professionals: string[];
    service_description: string | null;
    discount_pct: number | null;
    ia_enabled: boolean;
    ia_function: string | null;
    source_type: "manual" | "recurrence";
    recurrence_msg_number: number | null;
    valid_until: string | null;
    is_active: boolean;
    created_at: string;
}

export interface SandboxTokenTotals {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost_brl: number;
    calls: number;
}

/** Cria (ou devolve) a sessão da conta e carrega o paciente/conversa. */
export function useSandboxSession() {
    const { data: ownerId } = useOwnerId();

    return useQuery({
        queryKey: ["sandbox", "session", ownerId],
        enabled: !!ownerId,
        staleTime: 1000 * 30,
        queryFn: async () => {
            const { data: sessionId, error: rpcError } = await supabase.rpc(
                "sandbox_ensure_session" as any,
            );
            if (rpcError) throw rpcError;

            const { data: session, error: sessionError } = await supabase
                .from("sandbox_sessions" as any)
                .select("*")
                .eq("id", sessionId as string)
                .single();
            if (sessionError) throw sessionError;

            const { data: contact, error: contactError } = await supabase
                .from("sandbox_contacts" as any)
                .select("*")
                .eq("session_id", sessionId as string)
                .limit(1)
                .single();
            if (contactError) throw contactError;

            const { data: conversation, error: conversationError } = await supabase
                .from("sandbox_conversations" as any)
                .select("id, status, last_summary, last_message_at")
                .eq("session_id", sessionId as string)
                .limit(1)
                .single();
            if (conversationError) throw conversationError;

            return {
                session: session as unknown as SandboxSession,
                contact: contact as unknown as SandboxContact,
                conversationId: (conversation as any).id as string,
            };
        },
    });
}

/**
 * Chat do sandbox. `resetAt` corta o histórico visível: depois do LIMPAR a IA
 * não enxerga mais as mensagens antigas, então a tela também não mostra.
 */
export function useSandboxMessages(
    sessionId: string | undefined,
    resetAt: string | null | undefined,
    aguardando: boolean,
) {
    return useQuery({
        queryKey: ["sandbox", "messages", sessionId, resetAt],
        enabled: !!sessionId,
        refetchInterval: aguardando ? 2000 : 8000,
        queryFn: async () => {
            let q = supabase
                .from("sandbox_messages" as any)
                .select("id, role, content, message_type, media_url, created_at")
                .eq("session_id", sessionId!)
                .order("created_at", { ascending: true })
                .limit(500);
            if (resetAt) q = q.gte("created_at", resetAt);

            const { data, error } = await q;
            if (error) throw error;
            return (data || []) as unknown as SandboxMessage[];
        },
    });
}

/** Painéis laterais: chamadas de API, CRM, agenda, vendas e tokens. */
export function useSandboxPanels(sessionId: string | undefined, aguardando: boolean) {
    const refetchInterval = aguardando ? 2000 : 10000;

    const logs = useQuery({
        queryKey: ["sandbox", "logs", sessionId],
        enabled: !!sessionId,
        refetchInterval,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("sandbox_api_logs" as any)
                .select("id, function_name, label, ok, status_code, created_at")
                .eq("session_id", sessionId!)
                .order("created_at", { ascending: false })
                .limit(60);
            if (error) throw error;
            return (data || []) as unknown as SandboxApiLog[];
        },
    });

    const crm = useQuery({
        queryKey: ["sandbox", "crm", sessionId],
        enabled: !!sessionId,
        refetchInterval,
        queryFn: async () => {
            const { data: cards, error } = await supabase
                .from("sandbox_crm" as any)
                .select("id, stage, is_active, notes, updated_at")
                .eq("session_id", sessionId!)
                .order("updated_at", { ascending: false });
            if (error) throw error;

            const ids = (cards || []).map((c: any) => c.id);
            let historico: SandboxCrmHistory[] = [];
            if (ids.length) {
                const { data: hist, error: histError } = await supabase
                    .from("sandbox_crm_history" as any)
                    .select("id, from_stage, to_stage, created_at")
                    .in("crm_id", ids)
                    .order("created_at", { ascending: false })
                    .limit(40);
                if (histError) throw histError;
                historico = (hist || []) as unknown as SandboxCrmHistory[];
            }

            return {
                cards: (cards || []) as unknown as SandboxCrmCard[],
                historico,
            };
        },
    });

    const agenda = useQuery({
        queryKey: ["sandbox", "appointments", sessionId],
        enabled: !!sessionId,
        refetchInterval,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("sandbox_appointments" as any)
                .select("id, professional_id, service_id, title, start_time, end_time, status, notes")
                .eq("session_id", sessionId!)
                .order("start_time", { ascending: true });
            if (error) throw error;
            return (data || []) as unknown as SandboxAppointment[];
        },
    });

    const vendas = useQuery({
        queryKey: ["sandbox", "sales", sessionId],
        enabled: !!sessionId,
        refetchInterval,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("sandbox_sales" as any)
                .select("id, service_client_id, appointment_id, service_name, value, sale_date, payment_type")
                .eq("session_id", sessionId!)
                .order("sale_date", { ascending: false });
            if (error) throw error;
            return (data || []) as unknown as SandboxSale[];
        },
    });

    const tokens = useQuery({
        queryKey: ["sandbox", "tokens", sessionId],
        enabled: !!sessionId,
        refetchInterval,
        queryFn: async (): Promise<SandboxTokenTotals> => {
            const { data, error } = await supabase
                .from("sandbox_token_usage" as any)
                .select("prompt_tokens, completion_tokens, total_tokens, cost_brl")
                .eq("session_id", sessionId!)
                .limit(1000);
            if (error) throw error;

            return (data || []).reduce(
                (acc: SandboxTokenTotals, r: any) => ({
                    prompt_tokens: acc.prompt_tokens + (r.prompt_tokens || 0),
                    completion_tokens: acc.completion_tokens + (r.completion_tokens || 0),
                    total_tokens: acc.total_tokens + (r.total_tokens || 0),
                    cost_brl: acc.cost_brl + Number(r.cost_brl || 0),
                    calls: acc.calls + 1,
                }),
                { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_brl: 0, calls: 0 },
            );
        },
    });

    const campanhas = useQuery({
        queryKey: ["sandbox", "campaigns", sessionId],
        enabled: !!sessionId,
        refetchInterval: 15000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("sandbox_campaigns" as any)
                .select("*")
                .eq("session_id", sessionId!)
                .order("created_at", { ascending: false })
                .limit(20);
            if (error) throw error;
            return (data || []) as unknown as SandboxCampaign[];
        },
    });

    return { logs, crm, agenda, vendas, tokens, campanhas };
}

/** Ações da página: enviar mensagem, LIMPAR, alternar agenda e resetar tudo. */
export function useSandboxActions(sessionId: string | undefined) {
    const queryClient = useQueryClient();

    const invalidar = () =>
        queryClient.invalidateQueries({ queryKey: ["sandbox"], exact: false });

    const enviar = useMutation({
        mutationFn: async (input: { text: string; resetContext?: boolean }) => {
            const { data, error } = await supabase.functions.invoke("sandbox-inbound", {
                body: { text: input.text, reset_context: input.resetContext === true },
            });
            // O erro útil do edge function vem no corpo, não na mensagem do invoke
            if (error) {
                const detalhe = (data as any)?.message || (error as any)?.message;
                throw new Error(detalhe || "Não foi possível falar com o ambiente de teste.");
            }
            if ((data as any)?.success === false) {
                throw new Error((data as any).message || "O fluxo da IA não respondeu.");
            }
            return data;
        },
        onSettled: invalidar,
    });

    const alterarAgenda = useMutation({
        mutationFn: async (modo: "real" | "livre") => {
            const { error } = await supabase
                .from("sandbox_sessions" as any)
                .update({ agenda_mode: modo, updated_at: new Date().toISOString() })
                .eq("id", sessionId!);
            if (error) throw error;
        },
        onSettled: invalidar,
    });

    const salvarPaciente = useMutation({
        mutationFn: async (input: { contactId: string; patch: Record<string, unknown> }) => {
            const { error } = await supabase
                .from("sandbox_contacts" as any)
                .update({ ...input.patch, updated_at: new Date().toISOString() })
                .eq("id", input.contactId);
            if (error) throw error;
        },
        onSettled: invalidar,
    });

    const resetar = useMutation({
        mutationFn: async () => {
            const { error } = await supabase.rpc("sandbox_reset" as any);
            if (error) throw error;
        },
        onSettled: invalidar,
    });

    return { enviar, alterarAgenda, salvarPaciente, resetar, invalidar };
}
