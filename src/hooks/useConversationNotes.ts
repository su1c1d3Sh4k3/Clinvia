import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentTeamMember } from "@/hooks/useStaff";

/**
 * Notas internas de conversa — armazenadas em client_documents (category 'notas',
 * com conversation_id preenchido). Nunca são enviadas ao cliente e nunca podem
 * ser apagadas; edição preserva o texto anterior em edited_from.
 */
export interface ConversationNote {
    id: string;
    user_id: string;
    contact_id: string;
    conversation_id: string;
    category: string;
    title: string;
    description: string | null;
    author_name: string | null;
    edited_from: string | null;
    created_at: string;
}

/** Título padrão: "Nota de Conversa - <autor> - dd/MM/yyyy HH:mm" */
export const buildNoteTitle = (author: string, date: Date = new Date()) =>
    `Nota de Conversa - ${author} - ${format(date, "dd/MM/yyyy HH:mm")}`;

/** Nome do usuário logado para autoria da nota (team_members.full_name/name) */
export function useNoteAuthorName(): string {
    const { user } = useAuth();
    const { data: tm } = useCurrentTeamMember();
    return (
        (tm as any)?.full_name ||
        (tm as any)?.name ||
        user?.email?.split("@")[0] ||
        "Usuário"
    );
}

export function useConversationNotes(conversationId?: string | null) {
    const queryClient = useQueryClient();
    const { data: ownerId } = useOwnerId();
    const authorName = useNoteAuthorName();

    const { data: notes } = useQuery({
        queryKey: ["conversation-notes", conversationId],
        enabled: !!conversationId,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("client_documents" as any)
                .select("*")
                .eq("conversation_id", conversationId!)
                .eq("category", "notas")
                .order("created_at", { ascending: true });
            if (error) throw error;
            return (data || []) as unknown as ConversationNote[];
        },
    });

    // Realtime: nota criada por outro atendente (ou pela IA via API) aparece sem refresh
    useEffect(() => {
        if (!conversationId) return;
        const channel = supabase
            .channel(`conversation-notes-${conversationId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "client_documents", filter: `conversation_id=eq.${conversationId}` },
                () => queryClient.invalidateQueries({ queryKey: ["conversation-notes", conversationId] })
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [conversationId, queryClient]);

    const invalidate = (contactId?: string) => {
        queryClient.invalidateQueries({ queryKey: ["conversation-notes", conversationId] });
        if (contactId) queryClient.invalidateQueries({ queryKey: ["client-documents", contactId] });
    };

    const addNote = useMutation({
        mutationFn: async ({ text, contactId }: { text: string; contactId: string }) => {
            if (!ownerId || !conversationId) throw new Error("Conversa não encontrada");
            const { error } = await supabase.from("client_documents" as any).insert({
                user_id: ownerId,
                contact_id: contactId,
                conversation_id: conversationId,
                category: "notas",
                title: buildNoteTitle(authorName),
                description: text,
                author_name: authorName,
            });
            if (error) throw error;
            return contactId;
        },
        onSuccess: (contactId) => invalidate(contactId),
    });

    const editNote = useMutation({
        mutationFn: async ({ note, text }: { note: ConversationNote; text: string }) => {
            const { error } = await supabase
                .from("client_documents" as any)
                .update({ description: text, edited_from: note.description })
                .eq("id", note.id);
            if (error) throw error;
            return note.contact_id;
        },
        onSuccess: (contactId) => invalidate(contactId),
    });

    return { notes: notes || [], addNote, editNote };
}

/**
 * Mescla notas na timeline de mensagens (ordenada por created_at).
 * Cada nota vira um pseudo-item com `_note: true` — MessageList/ConversationChatModal
 * renderizam essas entradas com o NoteBubble roxo.
 */
export function mergeNotesIntoMessages(messages: any[], notes: ConversationNote[]): any[] {
    if (!notes.length) return messages;
    const noteItems = notes.map((n) => ({
        ...n,
        _note: true,
        note_id: n.id,
        id: `note-${n.id}`,
        body: n.description || "",
        direction: "outbound",
        message_type: "note",
    }));
    return [...messages, ...noteItems].sort(
        (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    );
}
