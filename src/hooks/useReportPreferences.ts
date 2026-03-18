import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { toast } from "sonner";
import type { ReportPreferences, ReportType } from "@/types/reports";

export function useReportPreferences() {
  const { data: ownerId } = useOwnerId();

  return useQuery({
    queryKey: ["report-preferences", ownerId],
    queryFn: async (): Promise<ReportPreferences | null> => {
      if (!ownerId) return null;
      const { data, error } = await (supabase as any)
        .from("report_preferences")
        .select("*")
        .eq("user_id", ownerId)
        .maybeSingle();
      if (error) throw error;
      return data as ReportPreferences | null;
    },
    enabled: !!ownerId,
  });
}

export function useUpdateReportPreferences() {
  const queryClient = useQueryClient();
  const { data: ownerId } = useOwnerId();

  return useMutation({
    mutationFn: async (activeTypes: ReportType[]) => {
      if (!ownerId) throw new Error("Usuário não identificado");

      const { data: existing } = await (supabase as any)
        .from("report_preferences")
        .select("id")
        .eq("user_id", ownerId)
        .maybeSingle();

      if (existing) {
        const { error } = await (supabase as any)
          .from("report_preferences")
          .update({ active_types: activeTypes })
          .eq("user_id", ownerId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("report_preferences")
          .insert({
            user_id: ownerId,
            active_types: activeTypes,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["report-preferences"],
      });
      toast.success("Preferências salvas com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao salvar preferências: " + (error as Error).message);
    },
  });
}
