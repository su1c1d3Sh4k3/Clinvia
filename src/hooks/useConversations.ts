import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { useIsTyping } from "@/contexts/TypingContext";

type Conversation = Tables<"conversations"> & {
  contacts: Tables<"contacts"> & {
    contact_tags: {
      tags: Tables<"tags"> | null;
    }[];
  };
  groups: Tables<"groups"> | null;
  queues: { name: string } | null;
};

type TabFilter = "open" | "pending" | "resolved" | "all";

/** Tamanho da página do scroll da lista (botão "Carregar mais" soma outra). */
export const CONVERSATIONS_PAGE_SIZE = 100;
/** Teto de resultados da busca. Fica abaixo do cap de 1000 do PostgREST. */
const SEARCH_LIMIT = 500;
/** Teto de ids injetados no filtro `.or(...)` — a query vai na URL (GET). */
const SEARCH_ID_CAP = 300;

/** Termo seguro para o mini-DSL do PostgREST (vírgula/parênteses são sintaxe). */
const sanitizeForOr = (term: string) => term.replace(/[,()%*\\]/g, " ").trim();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * BUSCA GLOBAL (user rule): a busca do inbox procura em TODO o banco, nunca
 * apenas nas conversas já carregadas na tela. Resolve contatos e grupos que
 * casam com o termo e devolve as condições `.or(...)` para a query de
 * conversations. Lista vazia = nada casou (não renderiza nada).
 */
const buildSearchConditions = async (term: string): Promise<string[]> => {
  const safe = sanitizeForOr(term);
  const digits = term.replace(/\D/g, "");
  const conds: string[] = [];

  const contactOr: string[] = [];
  if (safe) contactOr.push(`push_name.ilike.%${safe}%`);
  // Telefone: sempre por trecho do número (últimos dígitos), padrão do projeto
  if (digits.length >= 4) {
    contactOr.push(`number.ilike.%${digits}%`, `phone.ilike.%${digits}%`);
  }

  const [contactRes, groupRes] = await Promise.all([
    contactOr.length > 0
      ? supabase.from("contacts").select("id").or(contactOr.join(",")).limit(SEARCH_ID_CAP)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
    safe
      ? supabase.from("groups" as any).select("id").ilike("group_name", `%${safe}%`).limit(SEARCH_ID_CAP)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
  ]);

  if (contactRes.error) console.error("[useConversations] busca em contacts:", contactRes.error);
  if (groupRes.error) console.error("[useConversations] busca em groups:", groupRes.error);

  const contactIds = (contactRes.data ?? []).map((c: any) => c.id);
  const groupIds = (groupRes.data ?? []).map((g: any) => g.id);

  if (contactIds.length > 0) conds.push(`contact_id.in.(${contactIds.join(",")})`);
  if (groupIds.length > 0) conds.push(`group_id.in.(${groupIds.join(",")})`);
  if (/^\d+$/.test(term) && term.length <= 9) conds.push(`ticket_id.eq.${term}`);
  if (UUID_RE.test(term)) conds.push(`id.eq.${term}`);

  return conds;
};

interface UseConversationsOptions {
  tab?: TabFilter;
  userId?: string;
  role?: string;
  teamMemberId?: string;
  channel?: 'whatsapp' | 'instagram';
  /** true = só conversas de grupo (filtro server-side — sem ele, tenants com
   * alto volume estouram o cap de 1000 linhas do PostgREST e os grupos, com
   * last_message_at mais antigo, ficam fora do corte). */
  onlyGroups?: boolean;
  /** Termo de busca. Com 2+ caracteres a query passa a ser uma BUSCA GLOBAL:
   * varre o banco inteiro ignorando aba de status e Pessoas/Grupos. */
  search?: string;
  /** Quantas conversas carregar no scroll (sem busca). Default = 1 página. */
  limit?: number;
}

export const useConversations = (options: UseConversationsOptions = {}) => {
  const {
    tab = "open",
    userId,
    role,
    teamMemberId,
    channel,
    onlyGroups,
    search,
    limit = CONVERSATIONS_PAGE_SIZE,
  } = options;
  const queryClient = useQueryClient();
  const isTyping = useIsTyping();
  const isTypingRef = useRef(isTyping);
  // Há mais conversas além das carregadas? (habilita o botão "Carregar mais")
  const [hasMore, setHasMore] = useState(false);

  // Keep ref updated so subscription callbacks have latest value
  useEffect(() => {
    isTypingRef.current = isTyping;
  }, [isTyping]);

  const term = (search ?? "").trim();
  const isSearch = term.length >= 2;

  const { data: conversations, isLoading, isFetching } = useQuery({
    // ATENÇÃO: rowMatchesKey/patchLists leem esta chave por POSIÇÃO — chaves
    // novas só podem ser acrescentadas NO FIM.
    queryKey: [
      "conversations", tab, userId, role, teamMemberId, channel, onlyGroups ?? false,
      isSearch ? term : "", isSearch ? 0 : limit,
    ],
    queryFn: async () => {
      // PERF: select explícito SEM messages_history (72% do payload do tenant
      // de maior volume — ~9MB de JSON arquivado baixado só pra montar a lista).
      // Para conversas resolvidas, só o ÚLTIMO item do histórico é necessário
      // (preview da lista) → alias last_hist:messages_history->-1 (operador
      // JSON do PostgREST extrai server-side).
      let query = supabase
        .from("conversations")
        .select(`
          id, contact_id, assigned_agent_id, status, unread_count, created_at,
          updated_at, last_message_at, ticket_id, queue_id, summary, instance_id,
          group_id, last_message, user_id, sentiment_score, has_follow_up,
          follow_up_notified_at, channel, instagram_instance_id, nps_sent_at,
          first_response_at, first_response_by_ai, first_response_duration_seconds,
          is_ai_handled, is_outside_business_hours, last_customer_message_at,
          instagram_window_expired, resolved_at,
          last_hist:messages_history->-1,
          contacts (
            *,
            contact_tags (
              tags (*)
            )
          ),
          groups (*),
          queues (
            name
          )
        `)
        // nullsFirst: false é obrigatório com paginação — no DESC o Postgres
        // põe NULL primeiro e as conversas sem mensagem ocupariam a 1ª página.
        .order("last_message_at", { ascending: false, nullsFirst: false });

      // PERF: filtro de canal server-side (antes baixava tudo e descartava
      // client-side). Conversas antigas têm channel NULL = whatsapp.
      // Na busca o `.or(...)` é usado pelas condições do termo — WhatsApp
      // (channel whatsapp OU null) volta a ser filtrado client-side ali, para
      // não empilhar dois `or=` na mesma query.
      if (channel === "instagram") {
        query = query.eq("channel", "instagram");
      } else if (channel === "whatsapp" && !isSearch) {
        query = query.or("channel.eq.whatsapp,channel.is.null");
      }

      // Aba Grupos: filtro server-side (grupos têm last_message_at antigo e
      // caíam fora do cap de 1000 linhas do PostgREST em tenants com volume)
      if (onlyGroups) {
        query = query.not("group_id", "is", null);
      }

      // Status da aba. USER RULE: vale TAMBÉM na busca — ela varre o banco
      // inteiro, mas dentro da aba selecionada (Abertos/Pendentes/Resolvidos).
      if (tab === "open") {
        query = query.eq("status", "open");
      } else if (tab === "pending") {
        query = query.eq("status", "pending");
      } else if (tab === "resolved") {
        query = query.eq("status", "resolved");
      }
      // if tab === "all", no status filter is applied

      if (isSearch) {
        // BUSCA GLOBAL (user rule): "a busca tem que retornar TODAS as
        // conversas". Filtrar client-side o que já foi carregado escondia
        // tickets reais — o PostgREST corta a lista em 1000 linhas e em tenants
        // grandes a conversa procurada simplesmente nunca chegava ao browser.
        const conds = await buildSearchConditions(term);
        if (conds.length === 0) {
          setHasMore(false);
          return [];
        }
        query = query.or(conds.join(",")).limit(SEARCH_LIMIT);
      } else {
        query = query.range(0, limit - 1);
      }

      const { data, error } = await query;

      if (error) throw error;

      setHasMore(!isSearch && (data?.length ?? 0) >= limit);

      let filteredData = data as Conversation[];

      // Canal na busca (ver comentário acima): WhatsApp = channel whatsapp/null
      if (isSearch && channel === "whatsapp") {
        filteredData = filteredData.filter((c) => (c.channel || "whatsapp") !== "instagram");
      }

      // Para agentes, filtrar apenas conversas atribuídas a eles (quando abertas)
      // Agentes podem ver: conversas atribuídas a eles OU conversas pendentes
      if (role === "agent" && teamMemberId) {
        filteredData = filteredData.filter((conv) => {
          // Grupos nunca têm atribuição — sempre visíveis a todos (user rule)
          if (conv.group_id) return true;
          // Agente pode ver conversas pendentes (para pegar novos tickets)
          if (conv.status === "pending") return true;
          // Agente pode ver conversas abertas atribuídas a ele
          if (conv.status === "open" && conv.assigned_agent_id === teamMemberId) return true;
          // Agente pode ver conversas resolvidas que foram atribuídas a ele
          if (conv.status === "resolved" && conv.assigned_agent_id === teamMemberId) return true;
          return false;
        });
      }

      // ----------------------------------------------------------------------
      // BATCH FETCH das últimas mensagens via RPC dedicada — substitui N+1
      // que consumia ~43% do CPU do banco (338 calls/min de SELECT em messages).
      //
      // A RPC `get_last_messages_for_conversations` usa LATERAL + LIMIT 1 com
      // índice (conversation_id, created_at DESC) → ~0.25ms para 5 conversations
      // (vs ~1100ms via N+1 com Promise.all).
      //
      // SECURITY INVOKER — respeita RLS da tabela messages. Conversations
      // resolvidas continuam usando messages_history (mensagens reais são
      // deletadas pelo trigger ao resolver).
      // ----------------------------------------------------------------------
      const idsNeedingLastMsg = filteredData
        .filter((c) => c.status !== 'resolved')
        .map((c) => c.id);

      const lastMsgByConvId = new Map<string, any>();

      if (idsNeedingLastMsg.length > 0) {
        try {
          const { data: lastMsgs, error: rpcErr } = await supabase.rpc(
            'get_last_messages_for_conversations' as any,
            { p_conversation_ids: idsNeedingLastMsg }
          );
          if (rpcErr) {
            console.error('[useConversations] RPC get_last_messages error:', rpcErr);
          } else {
            for (const m of (lastMsgs as any[]) ?? []) {
              lastMsgByConvId.set(m.conversation_id, m);
            }
          }
        } catch (e) {
          console.error('[useConversations] RPC get_last_messages exception:', e);
        }
      }

      const conversationsWithLastMessage = filteredData.map((conv) => {
        // Resolvidas: último item do histórico já vem extraído server-side
        // (last_hist = messages_history->-1; mensagens reais são deletadas no resolve)
        if (conv.status === 'resolved') {
          const lastHistMsg = (conv as any).last_hist;
          if (lastHistMsg && typeof lastHistMsg === 'object') {
            return {
              ...conv,
              last_message_obj: {
                direction: lastHistMsg.role === 'user' ? 'inbound' : 'outbound',
                body: lastHistMsg.content || '',
                created_at: lastHistMsg.created_at,
                status: 'read',
                message_type: lastHistMsg.type || 'text',
              },
            };
          }
          return { ...conv, last_message_obj: null };
        }
        // Open/pending: resultado do batch RPC
        return {
          ...conv,
          last_message_obj: lastMsgByConvId.get(conv.id) || null,
        };
      });

      return conversationsWithLastMessage as (Conversation & { last_message_obj: any })[];
    },
    enabled: !!userId,
    // "Carregar mais" e digitar na busca trocam a queryKey — sem isto a lista
    // pisca "Carregando..." a cada tecla/clique.
    placeholderData: (prev: any) => prev,
    refetchInterval: 300000, // Polling every 5 minutes for follow up badges
  });

  // ------------------------------------------------------------------------
  // Realtime: feedback IMEDIATO via patch cirúrgico do cache (0 round-trip)
  // + reconciliação debounced como rede de segurança.
  //
  // Antes: QUALQUER evento em conversations invalidava a lista inteira
  // (~5,5 refetches pesados/min por cliente no tenant de maior volume) e o
  // "feedback" dependia da latência do refetch (1-3s). Agora o payload do
  // próprio evento atualiza o cache na hora; um invalidate debounced (15s)
  // corrige qualquer evento perdido/truncado, além do polling de 5min.
  // ------------------------------------------------------------------------
  const reconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const scheduleReconcile = (delay = 15000) => {
      if (reconcileTimerRef.current) clearTimeout(reconcileTimerRef.current);
      reconcileTimerRef.current = setTimeout(() => {
        reconcileTimerRef.current = null;
        if (isTypingRef.current) {
          scheduleReconcile(3000); // digitar adia a reconciliação, nunca a perde
          return;
        }
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }, delay);
    };

    const sortByLastMessage = (list: any[]) =>
      [...list].sort(
        (a, b) =>
          new Date(b.last_message_at || 0).getTime() -
          new Date(a.last_message_at || 0).getTime()
      );

    // Aplica um updater em TODAS as listas cacheadas (uma por combinação de
    // tab/canal/grupos). Retornar null = sem mudança nessa lista.
    const patchLists = (
      updater: (list: any[], key: readonly unknown[]) => any[] | null
    ) => {
      const entries = queryClient.getQueriesData({ queryKey: ["conversations"] });
      for (const [key, old] of entries) {
        if (!Array.isArray(old)) continue;
        const next = updater(old as any[], key);
        if (next) queryClient.setQueryData(key, next);
      }
    };

    // Lista de resultados de busca: não recebe linhas novas por realtime (o
    // critério vive no servidor). Só atualiza o que já está nela.
    const isSearchKey = (key: readonly unknown[]) => !!(key as any[])[7];

    // Espelha os filtros da queryFn: a linha pertence à lista dessa queryKey?
    const rowMatchesKey = (row: any, key: readonly unknown[]) => {
      const [, kTab, , kRole, kTeamMemberId, kChannel, kOnlyGroups] = key as any[];
      if (kOnlyGroups && !row.group_id) return false;
      const ch = row.channel || "whatsapp";
      if (kChannel && ch !== kChannel) return false;
      if (kTab !== "all" && row.status !== kTab) return false;
      if (kRole === "agent" && kTeamMemberId) {
        if (row.group_id) return true;
        if (row.status === "pending") return true;
        return row.assigned_agent_id === kTeamMemberId;
      }
      return true;
    };

    const conversationsChannel = supabase
      .channel("conversations-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
        },
        (payload: any) => {
          const evt = payload.eventType;
          const raw = payload.new ?? payload.old;
          // Payload truncado (linha grande) ou inesperado → só reconcilia
          if (!raw?.id) {
            scheduleReconcile();
            return;
          }
          if (isTypingRef.current) {
            scheduleReconcile(3000);
            return;
          }

          if (evt === "DELETE") {
            patchLists((list) =>
              list.some((c) => c.id === raw.id)
                ? list.filter((c) => c.id !== raw.id)
                : null
            );
            return;
          }

          if (evt === "INSERT") {
            // Conversa nova precisa dos embeds (contact/tags/queue) → refetch curto
            scheduleReconcile(1000);
            return;
          }

          // UPDATE: merge dos campos escalares preservando embeds e
          // last_message_obj já presentes no cache. messages_history pode vir
          // no payload (pesado) — nunca entra no cache.
          const { messages_history: _mh, ...scalar } = raw;

          // Linha pode precisar MUDAR de lista (ex: pending→open). Um "doador"
          // com embeds de qualquer lista cacheada permite mover sem refetch.
          let donor: any = null;
          for (const [, old] of queryClient.getQueriesData({ queryKey: ["conversations"] })) {
            if (!Array.isArray(old)) continue;
            const found = (old as any[]).find((c) => c.id === raw.id);
            if (found) {
              donor = found;
              break;
            }
          }

          let needsReconcile = false;
          patchLists((list, key) => {
            const idx = list.findIndex((c) => c.id === raw.id);
            if (isSearchKey(key)) {
              if (idx < 0) return null;
              const next = [...list];
              next[idx] = { ...next[idx], ...scalar };
              return sortByLastMessage(next);
            }
            const matches = rowMatchesKey(scalar, key);
            if (idx >= 0) {
              if (!matches) return list.filter((c) => c.id !== raw.id);
              const next = [...list];
              next[idx] = { ...next[idx], ...scalar };
              return sortByLastMessage(next);
            }
            if (matches) {
              if (donor) return sortByLastMessage([...list, { ...donor, ...scalar }]);
              needsReconcile = true; // sem embeds disponíveis → refetch curto
            }
            return null;
          });
          if (needsReconcile) scheduleReconcile(1000);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload: any) => {
          const row = payload.new;
          if (!row?.conversation_id) return;
          if (isTypingRef.current) {
            scheduleReconcile(3000);
            return;
          }
          // Espelha exclusões da RPC get_last_messages: reações e avisos de
          // entrada/saída de grupo não viram preview
          if (row.message_type === "reaction") return;
          if (
            typeof row.body === "string" &&
            row.body.startsWith("👥 ") &&
            (row.body.includes(" entrou no grupo") || row.body.includes(" saiu do grupo"))
          )
            return;

          patchLists((list) => {
            const idx = list.findIndex((c) => c.id === row.conversation_id);
            if (idx < 0) return null;
            const next = [...list];
            next[idx] = {
              ...next[idx],
              last_message_at: row.created_at,
              last_message_obj: {
                direction: row.direction,
                body: row.body,
                created_at: row.created_at,
                status: row.status,
                message_type: row.message_type,
              },
            };
            return sortByLastMessage(next);
          });
          scheduleReconcile();
        }
      )
      .subscribe();

    // Also subscribe to conversation_follow_ups for badge updates
    const followUpChannel = supabase
      .channel("follow-up-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_follow_ups",
        },
        () => {
          // Only invalidate if NOT typing
          if (!isTypingRef.current) {
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            queryClient.invalidateQueries({ queryKey: ["conversation-follow-up"] });
          }
        }
      )
      .subscribe();

    return () => {
      if (reconcileTimerRef.current) {
        clearTimeout(reconcileTimerRef.current);
        reconcileTimerRef.current = null;
      }
      supabase.removeChannel(conversationsChannel);
      supabase.removeChannel(followUpChannel);
    };
  }, [queryClient]);

  return {
    conversations: conversations || [],
    isLoading,
    isFetching,
    isSearching: isSearch,
    hasMore,
  };
};

