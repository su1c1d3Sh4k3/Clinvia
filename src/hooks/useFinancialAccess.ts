import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "./useUserRole";

export function useFinancialAccess() {
    const { data: role } = useUserRole();

    return useQuery({
        queryKey: ['financial-access-setting'],
        queryFn: async (): Promise<boolean> => {
            // Admins always have access
            if (role === 'admin') return true;

            // For others, check the global setting
            const { data, error } = await supabase.rpc('get_financial_access_setting');

            if (error) {
                console.error('Error fetching financial access setting:', error);
                return true; // Fallback to true on error to avoid lockout by bug
            }

            return data ?? true;
        },
        enabled: !!role, // Only run after role is known
        staleTime: 1000 * 60 * 5, // Cache for 5 minutes (optimized from 2 min)
    });
}
