// supabase/functions/_shared/automation-instance.ts
// -----------------------------------------------------------------------------
// Seleção da instância usada para envios automáticos (confirmação de
// agendamento, lembretes, feedback). Prioridade:
//   1. Instância marcada como principal (is_automation_primary) e conectada
//   2. Instância Meta (API oficial) conectada
//   3. Qualquer instância conectada
// -----------------------------------------------------------------------------

export interface AutomationInstance {
    id: string;
    apikey: string | null;
    provider: string | null;
    instance_name: string | null;
    status: string;
    user_id: string;
    meta_waba_id: string | null;
    meta_phone_number_id: string | null;
    meta_access_token: string | null;
    is_automation_primary: boolean;
}

export function isMetaInstance(i: {
    provider?: string | null;
    instance_name?: string | null;
}): boolean {
    return i?.provider === "meta" || (i?.instance_name || "").startsWith("meta-");
}

export async function pickAutomationInstance(
    supabase: any,
    userId: string,
): Promise<AutomationInstance | null> {
    const { data } = await supabase
        .from("instances")
        .select(
            "id, apikey, provider, instance_name, status, user_id, meta_waba_id, meta_phone_number_id, meta_access_token, is_automation_primary",
        )
        .eq("user_id", userId)
        .eq("status", "connected");

    const list: AutomationInstance[] = data || [];
    if (!list.length) return null;

    const primary = list.find((i) => i.is_automation_primary);
    if (primary) return primary;

    const meta = list.find(isMetaInstance);
    if (meta) return meta;

    return list[0];
}
