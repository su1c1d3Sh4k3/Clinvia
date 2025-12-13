import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// =============================================
// Types
// =============================================
export interface FollowUpCategory {
    id: string;
    user_id: string;
    team_member_id: string | null;
    name: string;
    created_at: string;
}

export interface FollowUpTemplate {
    id: string;
    user_id: string;
    team_member_id: string | null;
    category_id: string;
    name: string;
    time_minutes: number;
    message: string;
    created_at: string;
    category?: FollowUpCategory;
    team_member?: { name: string };
}

export interface ConversationFollowUp {
    id: string;
    conversation_id: string;
    category_id: string;
    last_seen_template_id: string | null;
    created_at: string;
    // Auto follow up fields
    auto_send?: boolean;
    next_send_at?: string | null;
    current_template_index?: number;
    completed?: boolean;
}

// =============================================
// Helper to get owner_id for RLS
// =============================================
async function getOwnerId(authUserId: string): Promise<string> {
    let { data: teamMember } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('auth_user_id', authUserId)
        .maybeSingle();

    if (!teamMember) {
        const { data: adminMember } = await supabase
            .from('team_members')
            .select('user_id')
            .eq('user_id', authUserId)
            .eq('role', 'admin')
            .maybeSingle();
        teamMember = adminMember;
    }

    return teamMember?.user_id || authUserId;
}

// =============================================
// CATEGORIES HOOKS
// =============================================

export function useFollowUpCategories() {
    return useQuery({
        queryKey: ["follow-up-categories"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("follow_up_categories" as any)
                .select("*")
                .order("name");
            if (error) throw error;
            return data as FollowUpCategory[];
        },
    });
}

export function useCreateFollowUpCategory() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (name: string) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Não autenticado");

            const ownerId = await getOwnerId(user.id);

            // Get team_member_id
            const { data: teamMember } = await supabase
                .from('team_members')
                .select('id')
                .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`)
                .maybeSingle();

            const { data, error } = await supabase
                .from("follow_up_categories" as any)
                .insert({
                    user_id: ownerId,
                    team_member_id: teamMember?.id || null,
                    name,
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["follow-up-categories"] });
            toast({ title: "Categoria criada com sucesso!" });
        },
        onError: (error: any) => {
            toast({ title: "Erro ao criar categoria", description: error.message, variant: "destructive" });
        },
    });
}

export function useDeleteFollowUpCategory() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("follow_up_categories" as any)
                .delete()
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["follow-up-categories"] });
            queryClient.invalidateQueries({ queryKey: ["follow-up-templates"] });
            toast({ title: "Categoria excluída!" });
        },
        onError: (error: any) => {
            toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
        },
    });
}

// =============================================
// TEMPLATES HOOKS
// =============================================

export function useFollowUpTemplates(categoryId?: string) {
    return useQuery({
        queryKey: ["follow-up-templates", categoryId],
        queryFn: async () => {
            let query = supabase
                .from("follow_up_templates" as any)
                .select(`
                    *,
                    category:follow_up_categories(id, name),
                    team_member:team_members(name)
                `)
                .order("time_minutes");

            if (categoryId) {
                query = query.eq("category_id", categoryId);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data as FollowUpTemplate[];
        },
    });
}

export function useCreateFollowUpTemplate() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (template: { category_id: string; name: string; time_minutes: number; message: string }) => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Não autenticado");

            const ownerId = await getOwnerId(user.id);

            const { data: teamMember } = await supabase
                .from('team_members')
                .select('id')
                .or(`auth_user_id.eq.${user.id},user_id.eq.${user.id}`)
                .maybeSingle();

            const { data, error } = await supabase
                .from("follow_up_templates" as any)
                .insert({
                    user_id: ownerId,
                    team_member_id: teamMember?.id || null,
                    ...template,
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["follow-up-templates"] });
            toast({ title: "Follow Up criado com sucesso!" });
        },
        onError: (error: any) => {
            toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
        },
    });
}

export function useUpdateFollowUpTemplate() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id, ...template }: { id: string; category_id?: string; name?: string; time_minutes?: number; message?: string }) => {
            const { error } = await supabase
                .from("follow_up_templates" as any)
                .update(template)
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["follow-up-templates"] });
            toast({ title: "Follow Up atualizado!" });
        },
        onError: (error: any) => {
            toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
        },
    });
}

export function useDeleteFollowUpTemplate() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("follow_up_templates" as any)
                .delete()
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["follow-up-templates"] });
            toast({ title: "Follow Up excluído!" });
        },
        onError: (error: any) => {
            toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
        },
    });
}

// =============================================
// CONVERSATION FOLLOW UP HOOKS
// =============================================

export function useConversationFollowUp(conversationId?: string) {
    return useQuery({
        queryKey: ["conversation-follow-up", conversationId],
        queryFn: async () => {
            if (!conversationId) return null;
            const { data, error } = await supabase
                .from("conversation_follow_ups" as any)
                .select("*, category:follow_up_categories(*)")
                .eq("conversation_id", conversationId)
                .maybeSingle();
            if (error) throw error;
            return data as ConversationFollowUp & { category: FollowUpCategory } | null;
        },
        enabled: !!conversationId,
    });
}

export function useAddConversationFollowUp() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ conversationId, categoryId }: { conversationId: string; categoryId: string }) => {
            // Insert follow up link
            const { error: insertError } = await supabase
                .from("conversation_follow_ups" as any)
                .insert({
                    conversation_id: conversationId,
                    category_id: categoryId,
                });
            if (insertError) throw insertError;

            // Update conversation flag
            const { error: updateError } = await supabase
                .from("conversations" as any)
                .update({ has_follow_up: true })
                .eq("id", conversationId);
            if (updateError) throw updateError;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["conversation-follow-up"] });
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            toast({ title: "Follow Up adicionado ao contato!" });
        },
        onError: (error: any) => {
            toast({ title: "Erro", description: error.message, variant: "destructive" });
        },
    });
}

export function useRemoveConversationFollowUp() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (conversationId: string) => {
            // Delete follow up link
            const { error: deleteError } = await supabase
                .from("conversation_follow_ups" as any)
                .delete()
                .eq("conversation_id", conversationId);
            if (deleteError) throw deleteError;

            // Update conversation flag
            const { error: updateError } = await supabase
                .from("conversations" as any)
                .update({ has_follow_up: false, follow_up_notified_at: null })
                .eq("id", conversationId);
            if (updateError) throw updateError;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["conversation-follow-up"] });
            queryClient.invalidateQueries({ queryKey: ["conversations"] });
            toast({ title: "Follow Up removido!" });
        },
        onError: (error: any) => {
            toast({ title: "Erro", description: error.message, variant: "destructive" });
        },
    });
}

// =============================================
// AUTO FOLLOW UP TOGGLE
// =============================================

export function useToggleAutoFollowUp() {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ conversationId, enabled }: { conversationId: string; enabled: boolean }) => {
            if (enabled) {
                // Get follow up and its templates to calculate first send time
                const { data: followUp } = await supabase
                    .from("conversation_follow_ups" as any)
                    .select("category_id")
                    .eq("conversation_id", conversationId)
                    .single();

                if (!followUp) throw new Error("Follow up não encontrado");

                // Get first template (sorted by time_minutes)
                const { data: templates } = await supabase
                    .from("follow_up_templates" as any)
                    .select("time_minutes")
                    .eq("category_id", followUp.category_id)
                    .order("time_minutes", { ascending: true })
                    .limit(1);

                if (!templates || templates.length === 0) {
                    throw new Error("Nenhum template cadastrado nesta categoria");
                }

                // Calculate next_send_at based on first template's time
                const firstTemplateMinutes = templates[0].time_minutes;
                const nextSendAt = new Date(Date.now() + firstTemplateMinutes * 60 * 1000);

                const { error } = await supabase
                    .from("conversation_follow_ups" as any)
                    .update({
                        auto_send: true,
                        next_send_at: nextSendAt.toISOString(),
                        current_template_index: 0,
                        completed: false
                    })
                    .eq("conversation_id", conversationId);

                if (error) throw error;
            } else {
                // Disable auto follow up
                const { error } = await supabase
                    .from("conversation_follow_ups" as any)
                    .update({
                        auto_send: false,
                        next_send_at: null
                    })
                    .eq("conversation_id", conversationId);

                if (error) throw error;
            }
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["conversation-follow-up"] });
            toast({
                title: variables.enabled
                    ? "Follow Up automático ativado!"
                    : "Follow Up automático desativado"
            });
        },
        onError: (error: any) => {
            toast({ title: "Erro", description: error.message, variant: "destructive" });
        },
    });
}

// =============================================
// FOLLOW UP STATUS HELPERS
// =============================================

export function useLastClientMessage(conversationId?: string) {
    return useQuery({
        queryKey: ["last-client-message", conversationId],
        queryFn: async () => {
            if (!conversationId) return null;
            const { data, error } = await supabase
                .from("messages")
                .select("created_at")
                .eq("conversation_id", conversationId)
                .eq("direction", "inbound")
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            return data?.created_at ? new Date(data.created_at) : null;
        },
        enabled: !!conversationId,
        refetchInterval: 60000, // Refetch every minute
    });
}

export function isTemplateUnlocked(templateTimeMinutes: number, lastClientMessageAt: Date | null): boolean {
    if (!lastClientMessageAt) return false;
    const unlockTime = new Date(lastClientMessageAt.getTime() + templateTimeMinutes * 60 * 1000);
    return new Date() >= unlockTime;
}

export function getUnlockTime(templateTimeMinutes: number, lastClientMessageAt: Date | null): Date | null {
    if (!lastClientMessageAt) return null;
    return new Date(lastClientMessageAt.getTime() + templateTimeMinutes * 60 * 1000);
}

// =============================================
// FOLLOW UP NOTIFICATIONS HOOK
// Check which conversations have unlocked follow ups
// =============================================

export function useFollowUpNotifications() {
    return useQuery({
        queryKey: ["follow-up-notifications"],
        queryFn: async () => {
            // 1. Get all conversations with active follow ups
            const { data: followUps, error: followUpError } = await supabase
                .from("conversation_follow_ups" as any)
                .select(`
                    conversation_id,
                    category_id,
                    last_seen_template_id,
                    category:follow_up_categories(
                        id,
                        templates:follow_up_templates(id, time_minutes)
                    )
                `);

            if (followUpError) throw followUpError;
            if (!followUps || followUps.length === 0) return new Set<string>();

            // 2. Get last inbound message for each conversation
            const conversationIds = followUps.map((f: any) => f.conversation_id);
            const { data: conversations, error: convError } = await supabase
                .from("conversations" as any)
                .select("id, status")
                .in("id", conversationIds)
                .eq("status", "open");

            if (convError) throw convError;
            if (!conversations || conversations.length === 0) return new Set<string>();

            const openConversationIds = conversations.map((c: any) => c.id);

            // 3. For each open conversation, check if any template is unlocked
            const notificationSet = new Set<string>();

            for (const followUp of followUps as any[]) {
                if (!openConversationIds.includes(followUp.conversation_id)) continue;

                // Get last inbound message
                const { data: lastMessage } = await supabase
                    .from("messages")
                    .select("created_at")
                    .eq("conversation_id", followUp.conversation_id)
                    .eq("direction", "inbound")
                    .order("created_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (!lastMessage) continue;

                const lastClientMessageAt = new Date(lastMessage.created_at);
                // Access templates through category (correct FK path)
                const templates = followUp.category?.templates || [];

                // Sort by time DESCENDING to find the LATEST unlocked template
                const sortedTemplates = [...templates].sort((a: any, b: any) => b.time_minutes - a.time_minutes);

                // Find the LATEST (highest time) unlocked template
                for (const template of sortedTemplates) {
                    const unlockTime = new Date(lastClientMessageAt.getTime() + template.time_minutes * 60 * 1000);
                    if (new Date() >= unlockTime) {
                        // This is the latest unlocked template - check if user has seen it
                        if (followUp.last_seen_template_id !== template.id) {
                            notificationSet.add(followUp.conversation_id);
                        }
                        break; // Only check the latest unlocked one
                    }
                }
            }

            return notificationSet;
        },
        refetchInterval: 60000, // Check every minute
    });
}

// Mark follow up as seen (call when user opens the conversation)
export function useMarkFollowUpSeen() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ conversationId, templateId }: { conversationId: string; templateId: string }) => {
            const { error } = await supabase
                .from("conversation_follow_ups" as any)
                .update({ last_seen_template_id: templateId })
                .eq("conversation_id", conversationId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["follow-up-notifications"] });
            queryClient.invalidateQueries({ queryKey: ["conversation-follow-up"] });
        },
    });
}

// =============================================
// AUTO FOLLOW UP PROCESSOR
// Polls the edge function every 2 minutes to process pending auto follow ups
// =============================================

import { useEffect, useRef } from "react";

export function useAutoFollowUpProcessor() {
    const lastProcessedRef = useRef<number>(0);
    const isProcessingRef = useRef<boolean>(false);

    useEffect(() => {
        const processAutoFollowUps = async () => {
            // Prevent concurrent processing
            if (isProcessingRef.current) return;

            // Rate limit: only process every 2 minutes (120000ms)
            const now = Date.now();
            if (now - lastProcessedRef.current < 120000) return;

            isProcessingRef.current = true;
            lastProcessedRef.current = now;

            try {
                console.log('[AutoFollowUp] Processing pending follow ups...');
                const { data, error } = await supabase.functions.invoke('process-auto-follow-up', {});

                if (error) {
                    console.error('[AutoFollowUp] Error:', error);
                } else {
                    console.log('[AutoFollowUp] Result:', data);
                    if (data?.sent > 0) {
                        console.log(`[AutoFollowUp] Sent ${data.sent} messages`);
                    }
                }
            } catch (err) {
                console.error('[AutoFollowUp] Exception:', err);
            } finally {
                isProcessingRef.current = false;
            }
        };

        // Process immediately on mount
        processAutoFollowUps();

        // Then process every 2 minutes
        const interval = setInterval(processAutoFollowUps, 120000);

        return () => clearInterval(interval);
    }, []);
}
