import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SyncOptions {
    /** service_name ids com template personalizado a sincronizar. */
    serviceNameIds?: string[];
    /** true = sincroniza também os 3 templates padrão da conta. */
    syncDefault?: boolean;
}

/**
 * Dispara a criação/atualização dos templates Meta de recorrência
 * (edge fn recurrence-template-sync). Fire-and-forget: não bloqueia o save;
 * tenant sem instância Meta = no-op silencioso.
 */
export function syncRecurrenceTemplates(opts: SyncOptions): void {
    const ids = (opts.serviceNameIds || []).filter(Boolean);
    const syncDefault = opts.syncDefault === true;
    if (ids.length === 0 && !syncDefault) return;

    const body: Record<string, unknown> = {};
    if (ids.length > 0) body.service_name_ids = ids;
    if (syncDefault) body.default = true;

    supabase.functions
        .invoke("recurrence-template-sync", { body })
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
