
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GroupMember {
    id: string;
    group_id: string;
    user_id: string | null;
    number: string;
    push_name: string | null;
    profile_pic_url: string | null;
    is_admin?: boolean;
    cleanNumber: string;
    lid?: string;
}

export const useGroupMembers = (conversationId?: string, isGroup: boolean = false) => {
    return useQuery({
        queryKey: ["group-members", conversationId],
        queryFn: async () => {
            if (!conversationId || !isGroup) return [];

            const { data: conversation, error: convError } = await supabase
                .from('conversations')
                .select('group_id')
                .eq('id', conversationId)
                .single();

            if (convError || !conversation?.group_id) return [];

            const { data, error } = await supabase
                .from('group_members')
                .select('*')
                .eq('group_id', conversation.group_id);

            if (error) {
                console.error("Error fetching group members:", error);
                return [];
            }

            // Transform data to ensure we have a clean number for replacement logic
            return (data as any[]).map(member => ({
                ...member,
                cleanNumber: member.number ? member.number.split('@')[0] : '',
                lid: member.lid ? member.lid.split('@')[0] : null // Clean LID to remove @lid suffix
            })) as GroupMember[];
        },
        enabled: !!conversationId && isGroup,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
};
