// supabase/functions/_shared/slot-settings.ts
// -----------------------------------------------------------------------------
// Fonte única do tamanho do slot e da folga entre atendimentos usados pelos
// canais automáticos (IA/API, link público e automações de agendamento).
//
// Configurado por conta em IA > Configurações (ia_config.slot_minutes /
// slot_buffer_minutes). O agendamento MANUAL feito pelo painel não passa por
// aqui de propósito — o atendente continua livre para encaixar horários.
// -----------------------------------------------------------------------------

export const DEFAULT_SLOT_MINUTES = 10;
export const DEFAULT_SLOT_BUFFER_MINUTES = 0;

export interface SlotSettings {
    /** Passo da grade de horários oferecidos, em minutos. */
    stepMinutes: number;
    /** Folga exigida antes E depois de cada agendamento existente, em minutos. */
    bufferMinutes: number;
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Lê a configuração da conta. Nunca é fatal: sem linha em ia_config (ou com erro
 * de leitura) devolve o comportamento histórico — slot de 10 min e folga zero.
 */
export async function getSlotSettings(supabase: any, userId: string): Promise<SlotSettings> {
    if (!userId) return { stepMinutes: DEFAULT_SLOT_MINUTES, bufferMinutes: DEFAULT_SLOT_BUFFER_MINUTES };

    const { data, error } = await supabase
        .from("ia_config")
        .select("slot_minutes, slot_buffer_minutes")
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        console.warn("[slot-settings] falha ao ler ia_config, usando padrões:", error.message ?? error);
        return { stepMinutes: DEFAULT_SLOT_MINUTES, bufferMinutes: DEFAULT_SLOT_BUFFER_MINUTES };
    }

    return {
        stepMinutes: clamp(data?.slot_minutes, DEFAULT_SLOT_MINUTES, 5, 240),
        bufferMinutes: clamp(data?.slot_buffer_minutes, DEFAULT_SLOT_BUFFER_MINUTES, 0, 240),
    };
}

/**
 * Janela a mandar para o RPC check_appointment_overlap: o horário pedido mais a
 * folga dos dois lados. Sem isto a checagem aceitaria um agendamento colado no
 * anterior, mesmo com a folga configurada.
 */
export function bufferedOverlapWindow(start: Date, end: Date, bufferMinutes: number): { start: string; end: string } {
    const pad = Math.max(0, bufferMinutes) * 60_000;
    return {
        start: new Date(start.getTime() - pad).toISOString(),
        end: new Date(end.getTime() + pad).toISOString(),
    };
}

/** Expande um intervalo ocupado com a folga dos dois lados (em minutos do dia). */
export function padBusyRange<T extends { start: number; end: number }>(range: T, bufferMinutes: number): T {
    if (bufferMinutes <= 0) return range;
    return { ...range, start: range.start - bufferMinutes, end: range.end + bufferMinutes };
}
