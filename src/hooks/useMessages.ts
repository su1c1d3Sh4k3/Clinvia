import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { resolveOutboundSenderName } from "@/lib/messageSender";

type Message = Tables<"messages">;

/**
 * Custom hook to fetch and subscribe to messages for a specific conversation.
 * 
 * @param conversationId - The ID of the conversation to fetch messages for.
 * @returns An object containing:
 * - `messages`: Array of Message objects (sorted by creation time).
 * - `isLoading`: Boolean indicating if the initial fetch is in progress.
 * 
 * @remarks
 * This hook handles both active conversations (fetching from `messages` table with realtime subscription)
 * and resolved conversations (parsing JSON `messages_history` from `conversations` table).
 */
export const useMessages = (conversationId?: string) => {
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: messages, isLoading } = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      // Maps a conversations.messages_history JSON array to Message[]
      const mapHistory = (history: any, sourceId: string): Message[] => {
        if (!history || !Array.isArray(history)) return [];
        return history.map((item, index) => {
          // Support both new (rich) and old (simple) formats
          const role = item.role || (item.user ? "user" : "assistant");
          const content = item.content || item.user || item.assistant;

          return {
            id: item.id || `history-${sourceId}-${index}`,
            conversation_id: conversationId,
            body: content,
            direction: role === "user" ? "inbound" : "outbound",
            message_type: item.type || "text",
            created_at: item.created_at || null,
            media_url: item.media_url || null,
            transcription: item.transcription || null,
            sender_name: item.sender_name || null,
            status: "read",
            evolution_id: null
          } as Message;
        });
      };

      // 1. Fetch conversation + messages EM PARALELO (antes eram 3 round-trips
      // seriais — a demora perceptível ao abrir o chat). Se a conversa estiver
      // resolvida, o resultado de messages é descartado (0 linhas, custo nulo).
      // PERF: limit 200 (p95 = 21 msgs/conversa; o histórico completo além
      // disso vem das conversas resolvidas arquivadas).
      const [convRes, msgsRes] = await Promise.all([
        supabase
          .from("conversations")
          .select("status, messages_history, contact_id, created_at, contact:contacts(push_name)")
          .eq("id", conversationId)
          .single(),
        supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      const { data: conversation, error: convError } = convRes;
      if (convError) throw convError;

      // Pill "Conversa iniciada dia ..." (user rule): pseudo-mensagem
      // client-side no início de cada conversa quando há histórico de
      // conversas resolvidas anteriores — marca a divisão entre tickets.
      // Nunca gravada em messages (mesmo padrão das Notas de Conversa _note).
      const contactName = (conversation as any).contact?.push_name || null;
      const makeConvStart = (sourceId: string, createdAt: string | null, firstMsg?: Message): Message => {
        const dateStr = createdAt
          ? new Date(createdAt).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
          : "";
        let by = "";
        if (firstMsg) {
          if (firstMsg.direction === "inbound") {
            by = contactName ? ` pelo cliente ${contactName}` : "";
          } else {
            const name = resolveOutboundSenderName(firstMsg);
            if (name === "IA") by = " pela IA";
            else if (name === "Enviada de fonte externa") by = " por fonte externa";
            else if (name) by = ` pelo atendente ${name}`;
          }
        }
        return {
          id: `conv-start-${sourceId}`,
          conversation_id: conversationId,
          body: `Conversa iniciada dia ${dateStr}${by}`,
          direction: "outbound",
          message_type: "text",
          created_at: createdAt || firstMsg?.created_at || null,
          status: "read",
          evolution_id: null,
          _conv_start: true,
        } as unknown as Message;
      };

      // 2. History from PREVIOUS resolved conversations of the same contact
      //    (archived in conversations.messages_history JSON) — shown before the
      //    current conversation so the inbox keeps full context per contact.
      let previousHistory: Message[] = [];
      let hasPrevHistory = false;
      if (conversation.contact_id) {
        const { data: prevConvs } = await supabase
          .from("conversations")
          .select("id, messages_history, created_at")
          .eq("contact_id", conversation.contact_id)
          .eq("status", "resolved")
          .neq("id", conversationId)
          .lt("created_at", conversation.created_at)
          .order("created_at", { ascending: false })
          .limit(10); // bound payload: last 10 resolved conversations

        const ordered = (prevConvs || []).reverse(); // chronological (oldest first)
        hasPrevHistory = ordered.length > 0;
        previousHistory = ordered.flatMap((c) => {
          const msgs = mapHistory(c.messages_history, c.id);
          // Divider "Conversa iniciada..." antes de cada conversa arquivada
          return [makeConvStart(c.id, c.created_at, msgs[0]), ...msgs];
        });
      }

      // 3. If resolved, parse this conversation's JSON history.
      //    Avisos gravados DEPOIS do arquivamento (a pill "finalizou essa
      //    conversa com a etapa X", inserida pelo trigger em statement
      //    separado) continuam vivos em `messages` — concatenados aqui.
      if (conversation.status === "resolved") {
        const live = ((msgsRes.data as Message[] | null) || []).slice().reverse();
        const own = [...mapHistory(conversation.messages_history, conversationId), ...live];
        return hasPrevHistory
          ? [...previousHistory, makeConvStart(conversationId, conversation.created_at, own[0]), ...own]
          : own;
      }

      // 4. If active, use the messages fetched in parallel above.
      // Fetched in descending order (newest first) so the limit never cuts off
      // the newest messages; reversed here so the array is chronological.
      const { data, error } = msgsRes;
      if (error) throw error;
      const own = (data as Message[]).reverse();
      return hasPrevHistory
        ? [...previousHistory, makeConvStart(conversationId, conversation.created_at, own[0]), ...own]
        : own;
    },
    enabled: !!conversationId,
    // PERF: reabrir a mesma conversa em <30s usa o cache direto (o realtime
    // invalida imediatamente quando chega mensagem nova — sem risco de stale)
    staleTime: 30_000,
  });

  // Set up realtime subscriptions for new messages.
  //
  // ⚠️ Histórico do bug:
  //   O filtro server-side `conversation_id=eq.${conversationId}` em Realtime
  //   estava silenciosamente falhando para conversas Instagram (mensagens chegavam
  //   no banco normalmente mas o invalidate nunca disparava no front).
  //   useConversations (sem filter, channel global) funcionava — confirmando que
  //   o problema era específico do filtro server-side em messages.
  //
  // Fix: usamos channel SEM filter e validamos o conversation_id no callback,
  //   que é estável em qualquer canal/instância. Trade-off: cada cliente recebe
  //   eventos de todas as suas conversas (volume baixo dado o RLS user-scoped).
  useEffect(() => {
    if (!conversationId) return;

    // PERF (fase B): em vez de invalidar (refetch completo ~200 linhas) a cada
    // evento, aplicamos o payload direto no cache (feedback <100ms) e agendamos
    // um invalidate DEBOUNCED como reconciliação (cobre payloads truncados,
    // eventos perdidos e o fallback de conversations.last_message_at).
    const scheduleReconcile = (delay = 10_000) => {
      if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
      reconcileTimerRef.current = setTimeout(() => {
        reconcileTimerRef.current = null;
        queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      }, delay);
    };

    const channel = supabase
      .channel(`messages-rt-${conversationId}`)
      // 1) Insert/update/delete em messages — filtro client-side por conversation_id
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        (payload: any) => {
          const row = payload.new ?? payload.old;
          if (row?.conversation_id !== conversationId) return;

          const key = ["messages", conversationId];

          if (payload.eventType === "INSERT" && payload.new) {
            queryClient.setQueryData<Message[]>(key, (old) => {
              if (!old) return old; // sem cache = fetch inicial em voo, não tocar
              if (old.some((m) => m.id === payload.new.id)) return old;
              // Race com envio otimista: substitui a entrada _optimistic de
              // mesmo body outbound (useSendMessage troca pelo row real no
              // onSuccess, mas o realtime pode chegar antes)
              const optIdx = old.findIndex(
                (m: any) =>
                  m._optimistic &&
                  m.direction === "outbound" &&
                  m.body === payload.new.body
              );
              if (optIdx >= 0) {
                const next = [...old];
                next[optIdx] = payload.new as Message;
                return next;
              }
              return [...old, payload.new as Message];
            });
          } else if (payload.eventType === "UPDATE" && payload.new) {
            queryClient.setQueryData<Message[]>(key, (old) =>
              old?.map((m) => (m.id === payload.new.id ? { ...m, ...payload.new } : m))
            );
          } else if (payload.eventType === "DELETE" && payload.old?.id) {
            queryClient.setQueryData<Message[]>(key, (old) =>
              old?.filter((m) => m.id !== payload.old.id)
            );
          }
          scheduleReconcile();
        }
      )
      // 2) Fallback redundante: update na conversa atual (webhook sempre toca
      //    last_message_at) — agora só agenda a reconciliação debounced, o
      //    feedback imediato vem do patch acima
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
        },
        (payload: any) => {
          if (payload.new?.id === conversationId) {
            scheduleReconcile();
          }
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[useMessages] Realtime ${status} for ${conversationId}`);
        }
      });

    channelRef.current = channel;

    return () => {
      if (reconcileTimerRef.current) {
        clearTimeout(reconcileTimerRef.current);
        reconcileTimerRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [conversationId, queryClient]);

  return {
    messages: messages || [],
    isLoading,
  };
};
