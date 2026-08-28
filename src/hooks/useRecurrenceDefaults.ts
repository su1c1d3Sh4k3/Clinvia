// Template PADRÃO de recorrência da conta (profiles.recurrence_default_msg_1..3
// com fallback para os textos embutidos) + se o tenant tem instância Meta
// conectada (define se o alerta de aprovação precisa aparecer).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import {
  DEFAULT_RECURRENCE_MESSAGES,
  resolveAccountDefaultMessage,
} from "../../supabase/functions/_shared/recurrence-default-messages";

export type RecurrenceDefaults = Record<1 | 2 | 3, string>;

const SYSTEM_DEFAULTS: RecurrenceDefaults = {
  1: DEFAULT_RECURRENCE_MESSAGES[1],
  2: DEFAULT_RECURRENCE_MESSAGES[2],
  3: DEFAULT_RECURRENCE_MESSAGES[3],
};

/** As 3 mensagens padrão que a conta usa quando o serviço não tem template próprio. */
export const useAccountRecurrenceDefaults = (): RecurrenceDefaults => {
  const { data: ownerId } = useOwnerId();

  const { data } = useQuery({
    queryKey: ["recurrence-default-msgs", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("recurrence_default_msg_1, recurrence_default_msg_2, recurrence_default_msg_3")
        .eq("id", ownerId)
        .maybeSingle();
      if (error) throw error;
      return data as Record<string, string | null> | null;
    },
  });

  if (!data) return SYSTEM_DEFAULTS;
  return {
    1: resolveAccountDefaultMessage(1, data.recurrence_default_msg_1),
    2: resolveAccountDefaultMessage(2, data.recurrence_default_msg_2),
    3: resolveAccountDefaultMessage(3, data.recurrence_default_msg_3),
  };
};

/** true se existe instância Meta conectada (⇒ template personalizado vai para aprovação). */
export const useHasMetaInstance = (): boolean => {
  const { data } = useQuery({
    queryKey: ["has-meta-connected"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instances")
        .select("id")
        .eq("provider", "meta")
        .eq("status", "connected")
        .limit(1);
      if (error) throw error;
      return (data?.length || 0) > 0;
    },
  });
  return data ?? false;
};
