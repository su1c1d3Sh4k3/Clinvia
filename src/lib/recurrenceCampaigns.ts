// ---------------------------------------------------------------------------
// Campanhas de recorrência (Fase 5 do plano 2026-08-20_plano_recorrencia_templates)
// Helpers puros: separação recorrência × campanhas comuns, agrupamento por dia
// (container pai "Recorrência - <dd/MM/yyyy>") e alerta de campanha bloqueada (R9).
// ---------------------------------------------------------------------------

export const RECURRENCE_BLOCKED_ALERT =
    "Campanha interrompida devido a não aprovação do template da Meta";

export interface RecurrenceCampaignLike {
    recurrence_date?: string | null; // "yyyy-MM-dd"
    status?: string;
    name?: string;
}

/** Campanha gerada pelo pipeline de recorrência (recurrence_date preenchida). */
export function isRecurrenceCampaign(c: RecurrenceCampaignLike | null | undefined): boolean {
    return !!c?.recurrence_date;
}

/** Remove campanhas de recorrência — usada em TODAS as listagens da aba/página Campanhas. */
export function filterOutRecurrence<T extends RecurrenceCampaignLike>(list: T[]): T[] {
    return list.filter((c) => !isRecurrenceCampaign(c));
}

// ---------------------------------------------------------------------------
// Monitoramento de Grupos — campanhas source_type='monitoring' ficam FORA de
// /campanhas e da lista comum da dash (sub-aba própria em Campanhas).
// ---------------------------------------------------------------------------

export interface MonitoringCampaignLike {
    source_type?: string;
}

/** Campanha de monitoramento de grupo (source_type='monitoring'). */
export function isMonitoringCampaign(c: MonitoringCampaignLike | null | undefined): boolean {
    return c?.source_type === "monitoring";
}

/** Remove campanhas de monitoramento — usada em /campanhas e na lista comum da dash. */
export function filterOutMonitoring<T extends MonitoringCampaignLike>(list: T[]): T[] {
    return list.filter((c) => !isMonitoringCampaign(c));
}

/** Só campanhas de monitoramento (sub-aba Monitoramento da dash). */
export function filterMonitoringOnly<T extends MonitoringCampaignLike>(list: T[]): T[] {
    return list.filter((c) => isMonitoringCampaign(c));
}

/** Só campanhas de recorrência (aba Recorrência da dash). */
export function filterRecurrenceOnly<T extends RecurrenceCampaignLike>(list: T[]): T[] {
    return list.filter((c) => isRecurrenceCampaign(c));
}

/** Rótulo do container pai do dia: "Recorrência - dd/MM/yyyy". */
export function recurrenceDayLabel(dateISO: string): string {
    const [y, m, d] = dateISO.split("-");
    return `Recorrência - ${d}/${m}/${y}`;
}

export interface RecurrenceDayGroup<T extends RecurrenceCampaignLike> {
    dateISO: string;
    label: string;
    campaigns: T[];
    blockedCount: number;
}

/**
 * Agrupa campanhas de recorrência por dia (recurrence_date), dias mais recentes
 * primeiro; dentro do dia, ordena por nome. Ignora campanhas sem recurrence_date.
 */
export function groupRecurrenceCampaignsByDate<T extends RecurrenceCampaignLike>(
    list: T[],
): RecurrenceDayGroup<T>[] {
    const map = new Map<string, T[]>();
    for (const c of list) {
        if (!c.recurrence_date) continue;
        if (!map.has(c.recurrence_date)) map.set(c.recurrence_date, []);
        map.get(c.recurrence_date)!.push(c);
    }
    return [...map.entries()]
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .map(([dateISO, campaigns]) => ({
            dateISO,
            label: recurrenceDayLabel(dateISO),
            campaigns: [...campaigns].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
            blockedCount: campaigns.filter((c) => c.status === "blocked").length,
        }));
}

/** Alerta vermelho de campanha bloqueada (R9) — null se não bloqueada. */
export function recurrenceBlockedAlert(c: RecurrenceCampaignLike | null | undefined): string | null {
    return c?.status === "blocked" ? RECURRENCE_BLOCKED_ALERT : null;
}
