// ---------------------------------------------------------------------------
// Recorrência — lógica pura do gerador diário de campanhas (Fase 4, R7-R13).
// Módulo SEM Deno/DOM: usado por recurrence-campaign-generator e pelos testes.
//
// Fluxo: recurrence_tracking → abordagens vencidas hoje (excluindo scheduled e
// já vinculadas a campanha) → agrupadas por (service_client_id, msg N) →
// campanhas "Recorrencia - <serviço> - Msg<N> - <dd/MM/yyyy>" com entries e
// vars snapshot (mesmo pipeline do campaign-dispatch). Writeback deriva
// approach_N_status do desfecho em campaign_contacts.
// ---------------------------------------------------------------------------

export interface RecurrenceTrackingRow {
    id: string;
    user_id: string;
    contact_id: string | null;
    appointment_id: string | null;
    service_client_id: string | null;
    contact_name: string | null;
    service_name: string | null;
    application_name: string | null;
    scheduled: boolean;
    approach_1_date: string | null;
    approach_1_status: string;
    approach_1_campaign_id?: string | null;
    approach_2_date: string | null;
    approach_2_status: string;
    approach_2_campaign_id?: string | null;
    approach_3_date: string | null;
    approach_3_status: string;
    approach_3_campaign_id?: string | null;
}

export interface DueApproach {
    trackingId: string;
    contactId: string;
    appointmentId: string | null;
    serviceClientId: string;
    msgNumber: 1 | 2 | 3;
    contactName: string;
    serviceName: string;
    applicationName: string;
    /** Abordagens anteriores também vencidas e ainda pendentes — marcar 'skipped'. */
    skippedNumbers: number[];
}

/**
 * Seleciona, por linha de tracking, a abordagem a disparar hoje:
 * a MAIOR msg N com data <= hoje, status 'pendente' e sem campanha vinculada.
 * Abordagens menores também vencidas/pendentes viram skippedNumbers (nunca
 * disparamos 2+ mensagens do mesmo ciclo no mesmo dia).
 * Exclui: scheduled=true, sem contato ou sem serviço.
 */
export function collectDueApproaches(
    rows: RecurrenceTrackingRow[],
    todayISO: string,
): DueApproach[] {
    const dues: DueApproach[] = [];
    for (const row of rows || []) {
        if (row.scheduled) continue;
        if (!row.contact_id || !row.service_client_id) continue;

        const candidates: number[] = [];
        for (const n of [1, 2, 3] as const) {
            const date = row[`approach_${n}_date`];
            const status = row[`approach_${n}_status`];
            const campaignId = row[`approach_${n}_campaign_id`];
            if (date && date <= todayISO && status === "pendente" && !campaignId) {
                candidates.push(n);
            }
        }
        if (candidates.length === 0) continue;

        const msgNumber = Math.max(...candidates) as 1 | 2 | 3;
        dues.push({
            trackingId: row.id,
            contactId: row.contact_id,
            appointmentId: row.appointment_id,
            serviceClientId: row.service_client_id,
            msgNumber,
            contactName: row.contact_name || "Cliente",
            serviceName: row.service_name || "Serviço",
            applicationName: row.application_name || "Aplicação",
            skippedNumbers: candidates.filter((n) => n !== msgNumber),
        });
    }
    return dues;
}

/** Agrupa abordagens por campanha do dia: chave `${serviceClientId}|${msgNumber}`. */
export function groupDueApproaches(dues: DueApproach[]): Map<string, DueApproach[]> {
    const groups = new Map<string, DueApproach[]>();
    for (const due of dues) {
        const key = `${due.serviceClientId}|${due.msgNumber}`;
        const list = groups.get(key) || [];
        list.push(due);
        groups.set(key, list);
    }
    return groups;
}

/** R$ 1.234,56 (mesma formatação do preview do editor). */
export function formatPriceBRL(price: number | null | undefined): string {
    const n = Number(price);
    if (!isFinite(n) || n <= 0) return "";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export interface RecurrenceVarsContext {
    clinicName: string;
    price: number | null;
    /** appointment_id → nome do profissional do agendamento ORIGINAL (R5). */
    professionalByAppointment: Record<string, string>;
}

/** Snapshot de vars por entry (campaign_contacts.raw_data) — 6 variáveis do editor. */
export function buildRecurrenceVars(
    due: DueApproach,
    ctx: RecurrenceVarsContext,
): Record<string, string> {
    return {
        nome_cliente: due.contactName,
        nome_clinica: ctx.clinicName || "nossa clínica",
        servico: due.serviceName,
        aplicacao: due.applicationName,
        preco: formatPriceBRL(ctx.price),
        profissional:
            (due.appointmentId && ctx.professionalByAppointment[due.appointmentId]) ||
            "nossa equipe",
    };
}

/** "Recorrencia - <serviço> - Msg<N> - <dd/MM/yyyy>" (R8). */
export function buildRecurrenceCampaignName(
    serviceName: string,
    msgNumber: number,
    dateISO: string,
): string {
    const [y, m, d] = dateISO.split("-");
    return `Recorrencia - ${serviceName} - Msg${msgNumber} - ${d}/${m}/${y}`;
}

/**
 * Converte o texto do editor ({{var}}) para o formato <var> que o
 * campaign-dispatch renderiza via raw_data (renderMessage/resolveVariable).
 */
export function toDispatchMessage(text: string): string {
    return (text || "").replace(
        /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g,
        (_m, name: string) => `<${name}>`,
    );
}

export interface CampaignContactOutcome {
    status?: string | null; // pending|sending|sent|failed|invalid|skipped|open_ticket
    message_status?: string | null; // sent|delivered|read|failed
    frozen_reason?: string | null; // scheduled|resolved|moved|expired
    frozen_responded?: boolean | null;
    frozen_scheduled?: boolean | null;
}

/**
 * Writeback R12: deriva approach_N_status do desfecho em campaign_contacts.
 * Prioridade: scheduled > responded > failed > delivered > sent.
 * null = ainda sem desfecho (não atualiza o tracking).
 */
export function deriveApproachOutcome(cc: CampaignContactOutcome): string | null {
    if (!cc) return null;
    if (cc.frozen_reason === "scheduled" || cc.frozen_scheduled === true) return "scheduled";
    if (cc.frozen_responded === true) return "responded";
    if (cc.status === "failed" || cc.status === "invalid") return "failed";
    if (cc.message_status === "failed") return "failed";
    if (cc.message_status === "delivered" || cc.message_status === "read") return "delivered";
    if (cc.status === "sent") return "sent";
    return null;
}
