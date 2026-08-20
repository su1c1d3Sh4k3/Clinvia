import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Dispara a criação/atualização dos templates Meta de recorrência para os
 * serviços informados (edge fn recurrence-template-sync). Fire-and-forget:
 * não bloqueia o save do serviço; tenant sem instância Meta = no-op silencioso.
 */
export function syncRecurrenceTemplates(serviceClientIds: string[]): void {
    const ids = serviceClientIds.filter(Boolean);
    if (ids.length === 0) return;

    supabase.functions
        .invoke("recurrence-template-sync", { body: { service_client_ids: ids } })
        .then(({ data, error }) => {
            if (error) throw error;
            if (data?.submitted > 0) {
                toast.info(
                    `${data.submitted} template(s) de recorrência enviados para aprovação da Meta`,
                );
            }
            if (Array.isArray(data?.errors) && data.errors.length > 0) {
                toast.error(`Falha ao submeter template de recorrência: ${data.errors[0]}`);
            }
        })
        .catch((err) => {
            console.warn("[recurrence-template-sync] invoke failed:", err);
        });
}
