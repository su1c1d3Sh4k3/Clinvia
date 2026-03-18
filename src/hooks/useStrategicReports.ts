import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import type { StrategicReport, ReportFrequency } from "@/types/reports";

export function useStrategicReports(frequency?: ReportFrequency) {
  const { data: ownerId } = useOwnerId();

  return useQuery({
    queryKey: ["strategic-reports", ownerId, frequency],
    queryFn: async (): Promise<StrategicReport[]> => {
      if (!ownerId) return [];

      let query = (supabase as any)
        .from("strategic_reports")
        .select("*")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: false });

      if (frequency) {
        query = query.eq("frequency", frequency);
      }

      const { data, error } = await query.limit(500);
      if (error) throw error;
      return (data || []) as StrategicReport[];
    },
    enabled: !!ownerId,
  });
}

export function useLatestReports() {
  const { data: ownerId } = useOwnerId();

  return useQuery({
    queryKey: ["strategic-reports-latest", ownerId],
    queryFn: async () => {
      if (!ownerId) return { daily: [], weekly: [], monthly: [] };

      const fetchByFrequency = async (
        freq: ReportFrequency
      ): Promise<StrategicReport[]> => {
        // Get the most recent report date for this frequency
        const { data: latest } = await (supabase as any)
          .from("strategic_reports")
          .select("period_start")
          .eq("user_id", ownerId)
          .eq("frequency", freq)
          .order("created_at", { ascending: false })
          .limit(1);

        if (!latest || latest.length === 0) return [];

        const latestDate = latest[0].period_start;

        // Get all reports for that period
        const { data, error } = await (supabase as any)
          .from("strategic_reports")
          .select("*")
          .eq("user_id", ownerId)
          .eq("frequency", freq)
          .eq("period_start", latestDate)
          .order("report_number", { ascending: true });

        if (error) throw error;
        return (data || []) as StrategicReport[];
      };

      const [daily, weekly, monthly] = await Promise.all([
        fetchByFrequency("daily"),
        fetchByFrequency("weekly"),
        fetchByFrequency("monthly"),
      ]);

      return { daily, weekly, monthly };
    },
    enabled: !!ownerId,
  });
}

export function useStrategicReport(id: string | null) {
  return useQuery({
    queryKey: ["strategic-report", id],
    queryFn: async (): Promise<StrategicReport | null> => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from("strategic_reports")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as StrategicReport;
    },
    enabled: !!id,
  });
}
