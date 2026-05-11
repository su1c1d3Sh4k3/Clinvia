import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useRef } from "react";
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

type ConversationWithLastMsg = Conversation & {
    last_message_obj: {
        direction: string | null;
        body: string | null;
        created_at: string | null;
        status: string | null;
        message_type: string | null;
    } | null;
    last_message_body?: string | null;
    last_message_direction?: string | null;
    last_message_status?: string | null;
    last_message_type?: string | null;
};

type TabFilter = "open" | "pending" | "resolved" | "all";

interface UseConversationsOptions {
    tab?: TabFilter;
    userId?: string;
    role?: string;
    teamMemberId?: string;
    channel?: 'whatsapp' | 'instagram';
    /**
     * Texto de busca. Quando presente, dispara uma query única (sem paginação)
     * com `ilike` server-side em push_name / number / phone / group name,
     * limitada a 100 resultados — atravessa TODAS as conversas do owner,
     * não apenas as páginas já carregadas.
     */
    searchQuery?: string;
    /** Filtra por queue_id no server */
    queueId?: string | null;
    /** Filtra por instance_id no server */
    instanceId?: string | null;
    /**
     * Filtra people (contact_id IS NOT NULL) vs groups (group_id IS NOT NULL).
     * Default 'people'.
     */
    typeFilter?: 'people' | 'groups';
}

const PAGE_SIZE = 20;
const SEARCH_LIMIT = 100;
const CONVERSATION_SELECT = `
  *,
  instance_id,
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
`;

/**
 * Mapeia as colunas denormalizadas `last_message_*` da tabela conversations
 * para o shape `last_message_obj` que o frontend já espera. Zero query extra
 * — as colunas são populadas por trigger AFTER INSERT messages (ver migration
 * 20260506140000_denormalize_last_message.sql).
 *
 * Para conversas com `messages_history` JSONB (resolved) e sem last_message_body
 * (backfill antigo), faz fallback síncrono lendo o último item do array.
 */
function attachLastMessages(rows: Conversation[]): ConversationWithLastMsg[] {
    return rows.map((conv) => {
        const r = conv as any;
        // Prioridade 1: colunas denormalizadas (trigger ON INSERT messages)
        if (r.last_message_body !== null && r.last_message_body !== undefined) {
            return {
                ...conv,
                last_message_obj: {
                    direction: r.last_message_direction ?? null,
                    body: r.last_message_body,
                    created_at: r.last_message_at ?? null,
                    status: r.last_message_status ?? null,
                    message_type: r.last_message_type ?? null,
                },
            } as ConversationWithLastMsg;
        }
        // Prioridade 2: messages_history JSONB (resolved sem trigger antigo)
        if (Array.isArray(r.messages_history) && r.messages_history.length > 0) {
            const last = r.messages_history[r.messages_history.length - 1];
            return {
                ...conv,
                last_message_obj: {
                    direction: last.role === 'user' ? 'inbound' : 'outbound',
                    body: last.content || '',
                    created_at: last.created_at ?? null,
                    status: 'read',
                    message_type: last.type || 'text',
                },
            } as ConversationWithLastMsg;
        }
        return { ...conv, last_message_obj: null } as ConversationWithLastMsg;
    });
}

/** Aplica filtros comuns (status, channel, type, queue, instance, role) à query. */
function applyCommonFilters(
    q: any,
    opts: {
        tab: TabFilter;
        channel?: 'whatsapp' | 'instagram';
        typeFilter: 'people' | 'groups';
        queueId?: string | null;
        instanceId?: string | null;
        role?: string;
        teamMemberId?: string;
    },
) {
    if (opts.tab === 'open') q = q.eq('status', 'open');
    else if (opts.tab === 'pending') q = q.eq('status', 'pending');
    else if (opts.tab === 'resolved') q = q.eq('status', 'resolved');

    if (opts.channel) q = q.eq('channel', opts.channel);

    if (opts.typeFilter === 'groups') q = q.not('group_id', 'is', null);
    else q = q.is('group_id', null);

    if (opts.queueId) q = q.eq('queue_id', opts.queueId);
    if (opts.instanceId) q = q.eq('instance_id', opts.instanceId);

    // Agentes só veem: pending (livre p/ pegar) OU atribuídas a si (open/resolved)
    if (opts.role === 'agent' && opts.teamMemberId) {
        q = q.or(`status.eq.pending,assigned_agent_id.eq.${opts.teamMemberId}`);
    }
    return q;
}

export const useConversations = (options: UseConversationsOptions = {}) => {
    const {
        tab = 'open',
        userId,
        role,
        teamMemberId,
        channel,
        searchQuery,
        queueId,
        instanceId,
        typeFilter = 'people',
    } = options;
    const queryClient = useQueryClient();
    const isTyping = useIsTyping();
    const isTypingRef = useRef(isTyping);

    useEffect(() => {
        isTypingRef.current = isTyping;
    }, [isTyping]);

    const trimmedSearch = (searchQuery ?? '').trim();
    const isSearching = trimmedSearch.length > 0;

    // ─── BRANCH 1: busca server-side (LIMIT 100, sem paginação) ────────────
    // Atravessa TODAS as conversas do owner (não apenas as 20 carregadas).
    const searchResult = useQuery({
        queryKey: [
            'conversations',
            'search',
            tab,
            userId,
            role,
            teamMemberId,
            channel,
            queueId,
            instanceId,
            typeFilter,
            trimmedSearch,
        ],
        enabled: !!userId && isSearching,
        queryFn: async () => {
            // Heurística: se o termo é só dígitos, busca por número/phone — senão
            // por push_name/group name (ilike) via inner join nos contacts/groups.
            const isPhone = /^[+\d\s\-()]+$/.test(trimmedSearch);
            const digits = trimmedSearch.replace(/\D/g, '');

            // Estratégia: duas queries paralelas (por nome e por número),
            // dedup por id na junção. Mais robusto do que uma OR complexa
            // que o PostgREST nem sempre parseia bem com joins.
            const baseSelect = supabase.from('conversations').select(CONVERSATION_SELECT);

            const byNameQuery = (() => {
                let q = baseSelect;
                q = applyCommonFilters(q, { tab, channel, typeFilter, queueId, instanceId, role, teamMemberId });
                // ilike em push_name OU group_name
                if (typeFilter === 'groups') {
                    q = q.ilike('groups.group_name', `%${trimmedSearch}%`);
                } else {
                    q = q.ilike('contacts.push_name', `%${trimmedSearch}%`);
                }
                return q.order('last_message_at', { ascending: false, nullsFirst: false })
                    .limit(SEARCH_LIMIT);
            })();

            const byNumberQuery = isPhone && digits.length >= 3
                ? (() => {
                    let q = supabase.from('conversations').select(CONVERSATION_SELECT);
                    q = applyCommonFilters(q, { tab, channel, typeFilter, queueId, instanceId, role, teamMemberId });
                    if (typeFilter === 'groups') {
                        q = q.ilike('groups.remote_jid', `%${digits}%`);
                    } else {
                        q = q.ilike('contacts.number', `%${digits}%`);
                    }
                    return q.order('last_message_at', { ascending: false, nullsFirst: false })
                        .limit(SEARCH_LIMIT);
                })()
                : null;

            const [r1, r2] = await Promise.all([
                byNameQuery,
                byNumberQuery ?? Promise.resolve({ data: [], error: null }),
            ]);

            if (r1.error) throw r1.error;
            if (r2.error) throw r2.error;

            // Dedup por id e ordena por last_message_at desc
            const map = new Map<string, Conversation>();
            for (const c of ((r1.data ?? []) as Conversation[])) map.set(c.id, c);
            for (const c of ((r2.data ?? []) as Conversation[])) {
                if (!map.has(c.id)) map.set(c.id, c);
            }
            const merged = Array.from(map.values())
                .sort((a: any, b: any) => {
                    const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
                    const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
                    return tb - ta;
                })
                .slice(0, SEARCH_LIMIT);

            return attachLastMessages(merged);
        },
    });

    // ─── BRANCH 2: paginação 20-em-20 com cursor (sem search) ───────────────
    const pagedResult = useInfiniteQuery({
        queryKey: [
            'conversations',
            'paged',
            tab,
            userId,
            role,
            teamMemberId,
            channel,
            queueId,
            instanceId,
            typeFilter,
        ],
        enabled: !!userId && !isSearching,
        initialPageParam: null as string | null,
        getNextPageParam: (lastPage: ConversationWithLastMsg[]) => {
            if (!lastPage || lastPage.length < PAGE_SIZE) return undefined;
            const last = lastPage[lastPage.length - 1];
            return (last as any).last_message_at ?? null;
        },
        queryFn: async ({ pageParam }) => {
            let q = supabase.from('conversations').select(CONVERSATION_SELECT);
            q = applyCommonFilters(q, { tab, channel, typeFilter, queueId, instanceId, role, teamMemberId });

            if (pageParam) {
                q = q.lt('last_message_at', pageParam);
            }
            q = q.order('last_message_at', { ascending: false, nullsFirst: false }).limit(PAGE_SIZE);

            const { data, error } = await q;
            if (error) throw error;
            return attachLastMessages((data ?? []) as Conversation[]);
        },
        refetchInterval: 300_000,
    });

    // ─── Realtime ──────────────────────────────────────────────────────────
    // Filtra por user_id para isolar instâncias entre tenants. Invalida só a
    // primeira página da paginação (a busca está cacheada por trimmedSearch).
    useEffect(() => {
        if (!userId) return;
        const conversationsChannel = supabase
            .channel(`conversations-changes-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'conversations',
                    filter: `user_id=eq.${userId}`,
                },
                () => {
                    if (!isTypingRef.current) {
                        queryClient.invalidateQueries({ queryKey: ['conversations', 'paged'] });
                        queryClient.invalidateQueries({ queryKey: ['conversations', 'search'] });
                    }
                },
            )
            .subscribe();

        const followUpChannel = supabase
            .channel(`follow-up-changes-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'conversation_follow_ups',
                },
                () => {
                    if (!isTypingRef.current) {
                        queryClient.invalidateQueries({ queryKey: ['conversations', 'paged'] });
                        queryClient.invalidateQueries({ queryKey: ['conversation-follow-up'] });
                    }
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(conversationsChannel);
            supabase.removeChannel(followUpChannel);
        };
    }, [queryClient, userId]);

    // ─── Achatamento das páginas + retorno unificado ───────────────────────
    const flatPaged = useMemo<ConversationWithLastMsg[]>(() => {
        if (!pagedResult.data) return [];
        return pagedResult.data.pages.flat() as ConversationWithLastMsg[];
    }, [pagedResult.data]);

    const conversations = isSearching ? (searchResult.data ?? []) : flatPaged;
    const isLoading = isSearching ? searchResult.isLoading : pagedResult.isLoading;
    const hasMore = !isSearching && !!pagedResult.hasNextPage;
    const isLoadingMore = !isSearching && pagedResult.isFetchingNextPage;

    return {
        conversations,
        isLoading,
        hasMore,
        isLoadingMore,
        isSearching,
        loadMore: () => pagedResult.fetchNextPage(),
    };
};
