/**
 * Agenda fechada por profissional em um dia (tabela professional_day_blocks).
 * A presença da linha bloqueia TODOS os horários daquela data — o cadeado da
 * agenda grava aqui e todas as vias de agendamento consultam a mesma fonte.
 */

/** IDs (dentre os informados) com a agenda fechada na data `YYYY-MM-DD`. */
export async function getBlockedProfessionalIds(
    supabase: any,
    professionalIds: string[],
    dateStr: string,
): Promise<Set<string>> {
    if (professionalIds.length === 0) return new Set();
    const { data, error } = await supabase
        .from("professional_day_blocks")
        .select("professional_id")
        .eq("block_date", dateStr)
        .in("professional_id", professionalIds);
    if (error) {
        console.error("[day-blocks] erro ao consultar bloqueios:", error);
        return new Set();
    }
    return new Set((data || []).map((r: any) => r.professional_id as string));
}

/** true se a agenda desse profissional estiver fechada na data `YYYY-MM-DD`. */
export async function isProfessionalDayBlocked(
    supabase: any,
    professionalId: string,
    dateStr: string,
): Promise<boolean> {
    const blocked = await getBlockedProfessionalIds(supabase, [professionalId], dateStr);
    return blocked.has(professionalId);
}
