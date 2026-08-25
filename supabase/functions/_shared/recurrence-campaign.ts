// ---------------------------------------------------------------------------
// Recorrência — lógica pura do gerador diário de campanhas (Fase 4, R7-R13).
// Módulo SEM Deno/DOM: usado por recurrence-campaign-generator e pelos testes.
//
// Fluxo: recurrence_tracking → abordagens vencidas hoje (excluindo scheduled e
// já vinculadas a campanha) → agrupadas por (service_client_id, msg N) →
// campanhas "Recorrência - <serviço> - Msg<N> - <dd/MM/yyyy>" com entries e
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
    procedure_date: string | null;
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
    /** Serviço-pai (service_name.id) — preenchido pelo generator via services_client. */
    serviceNameId?: string | null;
    msgNumber: 1 | 2 | 3;
    contactName: string;
    serviceName: string;
    applicationName: string;
    /** Data (ISO yyyy-MM-dd) do procedimento original. */
    procedureDate: string | null;
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
            procedureDate: row.procedure_date || null,
            skippedNumbers: candidates.filter((n) => n !== msgNumber),
        });
    }
    return dues;
}

/**
 * Agrupa abordagens por campanha do dia: chave `${serviceNameId}|${msgNumber}`
 * (recorrência a nível de SERVIÇO desde 2026-08-25; fallback serviceClientId
 * se o generator não enriqueceu o due).
 */
export function groupDueApproaches(dues: DueApproach[]): Map<string, DueApproach[]> {
    const groups = new Map<string, DueApproach[]>();
    for (const due of dues) {
        const key = `${due.serviceNameId || due.serviceClientId}|${due.msgNumber}`;
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
    /** % de desconto da abordagem (service_name.recurrence_discount_pct_N). */
    discountPct?: number | null;
    /** appointment_id → nome do profissional do agendamento ORIGINAL (R5). */
    professionalByAppointment: Record<string, string>;
    /** Dia da geração (ISO yyyy-MM-dd, BRT) — base de dias_do_procedimento. */
    todayISO: string;
}

/** "dd/MM/yyyy" a partir de ISO yyyy-MM-dd (vazio se ausente/ inválido). */
export function formatDateBR(iso: string | null | undefined): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** "N dias" entre procedure_date e hoje (vazio se ausente/ inválido/negativo). */
export function daysSinceProcedure(
    procedureISO: string | null | undefined,
    todayISO: string,
): string {
    if (!procedureISO || !todayISO) return "";
    const from = new Date(`${procedureISO.slice(0, 10)}T00:00:00Z`).getTime();
    const to = new Date(`${todayISO.slice(0, 10)}T00:00:00Z`).getTime();
    if (!isFinite(from) || !isFinite(to) || to < from) return "";
    const days = Math.round((to - from) / 86_400_000);
    return `${days} ${days === 1 ? "dia" : "dias"}`;
}

/** Meses (calendário, piso, mínimo 1) entre procedure_date e hoje — "" se inválido. */
export function monthsSinceProcedure(
    procedureISO: string | null | undefined,
    todayISO: string,
): string {
    const from = /^(\d{4})-(\d{2})-(\d{2})/.exec(procedureISO || "");
    const to = /^(\d{4})-(\d{2})-(\d{2})/.exec(todayISO || "");
    if (!from || !to) return "";
    let months = (+to[1] - +from[1]) * 12 + (+to[2] - +from[2]);
    if (+to[3] < +from[3]) months -= 1; // dia do mês ainda não completou
    if (months < 1) months = 1;
    return String(months);
}

/** "10%" a partir do % configurado (vazio se ausente/zero/negativo). */
export function formatDiscountPct(pct: number | null | undefined): string {
    const n = Number(pct);
    if (!isFinite(n) || n <= 0) return "";
    const s = Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
    return `${s}%`;
}

/**
 * Snapshot de vars por entry (campaign_contacts.raw_data) — 6 variáveis do
 * editor + dados do procedimento original (data_procedimento e
 * dias_do_procedimento), usados na interpolação do objetivo fixo por etapa.
 */
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
        desconto: formatDiscountPct(ctx.discountPct),
        meses: monthsSinceProcedure(due.procedureDate, ctx.todayISO),
        data_procedimento: formatDateBR(due.procedureDate),
        dias_do_procedimento: daysSinceProcedure(due.procedureDate, ctx.todayISO),
    };
}

// ── Objetivo e prompt fixos por etapa (user rules 2026-08-20) ────────────────
// Msg1 = Prévia (30d antes do vencimento) · Msg2 = Vencimento · Msg3 = Pós.
// Placeholders <var> são interpolados POR CONTATO no payload do n8n
// (webhook-handle-message) a partir do raw_data da entry — a campanha agrupa
// vários contatos, então o texto no DB fica com os placeholders.

const OBJECTIVE_INTRO =
    "O objetivo dessa campanha é entrar em contato com um cliente que realizou o procedimento <servico> - <aplicacao>, na data <data_procedimento> com o profissional <profissional>. Hoje fazem <dias_do_procedimento>, e você está abordando o cliente";

export const RECURRENCE_STAGE_OBJECTIVES: Record<1 | 2 | 3, string> = {
    1: `${OBJECTIVE_INTRO} para perguntar como está o procedimento, o que ele achou, se está satisfeito, e oferecer para agendar um novo procedimento (caso tenha desconto, adapte essa parte para falar do desconto). Caso o cliente rejeite, tente contra-argumentar e, caso ele diga que não vai marcar, informe que mês que vem entrará em contato novamente.`,
    2: `${OBJECTIVE_INTRO} pois o tempo médio de validade do procedimento se encerrou e você gostaria de agendar um novo procedimento para ele (caso tenha desconto, adapte essa parte). Caso ele não queira, argumente e tente convencê-lo; se insistir na negativa, agradeça.`,
    3: `${OBJECTIVE_INTRO} pois nesse momento o procedimento realizado já perdeu o efeito e o ideal seria o agendamento de um novo procedimento para manter os bons resultados a longo prazo (caso tenha desconto, insira). Caso o cliente não queira, tente contornar as objeções; caso não tenha solução, agradeça, encerre cordialmente e diga que sempre estaremos à disposição.`,
};

/** Objetivo fixo da etapa (com placeholders <var> por contato). */
export function buildRecurrenceObjective(msgNumber: 1 | 2 | 3): string {
    return RECURRENCE_STAGE_OBJECTIVES[msgNumber];
}

export const RECURRENCE_STAGE_PROMPTS: Record<1 | 2 | 3, string> = {
    1: `Esta é uma campanha de recorrência, etapa PRÉVIA. Você não está vendendo: está acompanhando um cliente da casa que já foi atendido.

O objetivo desta conversa é saber como ele está e, se fizer sentido, deixar o próximo procedimento agendado antes que o efeito comece a cair.

CONTEXTO DO PROCEDIMENTO
Os dados estão no objetivo desta campanha: qual serviço e aplicação ele fez, com qual profissional, em que data, e quantos dias fazem.

Use a descrição do serviço para falar do procedimento com propriedade. Fale do mecanismo real daquela modalidade — injetável, laser, peeling, bioestimulador — e nunca invente como ele funciona. Se a descrição não explicar o mecanismo, fale apenas do resultado e da manutenção, sem detalhar como o procedimento age.

SEQUÊNCIA DA CONVERSA

Primeira mensagem — pergunte pelo resultado, não pelo agendamento.
Cite o procedimento que ele fez e com quem fez. Pergunte como ficou e se ele gostou. Uma pergunta só. Não fale de agendamento, não fale de tempo, não fale de manutenção ainda.

Segunda mensagem — depende da resposta dele.

Se ele respondeu que gostou ou que está satisfeito: reconheça, diga há quantos dias ele fez, e explique que é por volta desse período que a maioria dos clientes começa a sentir o efeito cedendo. Ofereça deixar o próximo já agendado. Enquadre como manutenção do que ele já conquistou, não como venda nova.

Se ele respondeu que ficou insatisfeito, que não durou, que ficou irregular ou que sentiu algo estranho: PARE a campanha imediatamente. Não ofereça agendamento, não mencione manutenção, não mencione desconto. Peça desculpas com sinceridade, pergunte o que aconteceu e mova o CRM para a etapa Pós-Venda, encaminhando para a equipe. Neste caso a conversa não é mais sobre agendar, e você não volta ao assunto.

Se ele respondeu de forma neutra ou curta: reconheça e siga para a oferta de manutenção do mesmo jeito.

SOBRE DESCONTO
Só existe desconto se a lista de serviços da campanha trouxer preço com desconto. Se ela trouxer apenas o preço normal, ou se o desconto for zero, esta campanha NÃO TEM DESCONTO: não mencione promoção, condição especial, oferta nem prazo em nenhum momento. O argumento é o resultado e a manutenção, nunca o preço.

ARGUMENTO CENTRAL DESTA ETAPA
Ele ainda está com resultado. A vantagem é não deixar cair — quem mantém no intervalo certo preserva o resultado melhor do que quem espera acabar e recomeça do zero.

SE ELE NÃO QUISER AGENDAR

Contra-argumente uma vez, escolhendo pelo motivo que ele deu:

Se ele disser que ainda está bom: concorde, e é justamente esse o ponto. Quem agenda enquanto o resultado ainda está de pé mantém a constância, em vez de recomeçar depois que caiu. Ofereça deixar marcado para daqui a algumas semanas, sem compromisso de decidir agora.

Se ele disser que está sem tempo ou muito corrido: ofereça deixar a data reservada com folga, no dia e horário que for melhor para ele, com a possibilidade de remarcar se precisar. O objetivo é tirar o peso da decisão.

Se ele disser que está apertado financeiramente ou que vai ver mais pra frente: não insista no procedimento. Diga que não tem problema, e que você volta a falar com ele mais pra frente para ver como está o resultado.

Se ele recusar sem dar motivo, ou repetir a negativa depois do seu contra-argumento: aceite. Não tente um segundo ângulo.

COMO ENCERRAR
Agradeça pelo retorno, diga que você entra em contato de novo daqui a um mês para saber como está o resultado, e deixe claro que ele pode chamar antes se quiser. Encerre cordialmente.

O QUE NÃO FAZER NESTA ETAPA
Não trate como urgência — o efeito dele ainda está lá.
Não diga que o procedimento está vencendo ou acabando.
Não pergunte se ele já fez o procedimento: você sabe que fez, está no objetivo.
Não repita quantos dias fazem em mais de uma mensagem.`,
    2: `Esta é uma campanha de recorrência, etapa VENCIMENTO. Você não está vendendo: está avisando um cliente da casa de que chegou o momento da manutenção.

O objetivo desta conversa é agendar o novo procedimento agora, enquanto ele ainda tem parte do resultado.

CONTEXTO DO PROCEDIMENTO
Os dados estão no objetivo desta campanha: qual serviço e aplicação ele fez, com qual profissional, em que data, e quantos dias fazem.

Use a descrição do serviço para falar do procedimento com propriedade. Fale do mecanismo real daquela modalidade — injetável, laser, peeling, bioestimulador — e nunca invente como ele funciona. Se a descrição não explicar o mecanismo, fale apenas do resultado e da manutenção.

SEQUÊNCIA DA CONVERSA

Primeira mensagem — situe o tempo e pergunte como ele está vendo o resultado.
Diga há quanto tempo ele fez o procedimento e com quem. Explique que é por volta desse período que o efeito costuma ceder na maior parte dos casos. Pergunte como ele sente que está hoje. Uma pergunta só, e ela é aberta: você quer a percepção dele, não um sim ou não.

Segunda mensagem — depende da resposta.

Se ele disser que já percebeu o efeito caindo: é o gancho natural. Confirme que é o esperado para o tempo, e ofereça agendar a manutenção. Enquadre como retomar o resultado que ele já teve.

Se ele disser que ainda está bom: não discuta a percepção dele. Diga que é ótimo sinal, e que nesses casos a manutenção rende ainda mais, porque parte do trabalho anterior ainda está de pé. Ofereça agendar.

Se ele disser que ficou insatisfeito, que não durou o que devia ou que sentiu algo estranho: PARE a campanha imediatamente. Não ofereça agendamento, não mencione desconto. Peça desculpas com sinceridade, pergunte o que aconteceu e mova o CRM para a etapa Pós-Venda, encaminhando para a equipe. Você não volta ao assunto do agendamento nesta conversa.

SOBRE DESCONTO
Só existe desconto se a lista de serviços da campanha trouxer preço com desconto. Se ela trouxer apenas o preço normal, ou se o desconto for zero, esta campanha NÃO TEM DESCONTO: não mencione promoção, condição especial, oferta nem prazo em nenhum momento. O argumento é o resultado e a manutenção, nunca o preço.

ARGUMENTO CENTRAL DESTA ETAPA
Ele está no ponto de virada. Fazer agora é manutenção; esperar mais significa começar de novo com o resultado já perdido.

SE ELE NÃO QUISER AGENDAR

Contra-argumente uma vez, escolhendo pelo motivo que ele deu:

Se ele disser que ainda está bom e vai esperar acabar: explique com calma que fazer com o resultado ainda de pé costuma render melhor do que esperar zerar. Não é urgência, é constância. Ofereça uma data mais pra frente, mas já marcada.

Se ele disser que está sem tempo: ofereça o horário que for mais fácil pra ele, com folga na data, e diga que remarcar depois é tranquilo. Se você tiver disponibilidade em horários alternativos, apresente.

Se ele disser que está apertado ou que vai deixar pra depois: não insista no procedimento e não invente condição. Se a campanha tiver desconto, mencione a condição uma única vez, com a validade. Se não tiver desconto, não mencione preço nem prazo — aceite e mantenha a porta aberta.

Se ele recusar sem dar motivo, ou repetir a negativa depois do seu contra-argumento: aceite. Não tente um segundo ângulo.

COMO ENCERRAR
Agradeça pela atenção, diga que quando ele quiser retomar é só te chamar, e encerre cordialmente. Não prometa novo contato com data específica.

O QUE NÃO FAZER NESTA ETAPA
Não afirme que o efeito dele acabou — você não sabe, pergunte.
Não contradiga a percepção dele sobre o próprio resultado.
Não crie urgência artificial: nada de última chance ou vaga acabando.
Não pergunte se ele já fez o procedimento: você sabe que fez.`,
    3: `Esta é uma campanha de recorrência, etapa PÓS-VENCIMENTO. Você não está vendendo: está reativando um cliente da casa que passou do ponto de manutenção.

O objetivo desta conversa é trazer ele de volta para um novo procedimento.

CONTEXTO DO PROCEDIMENTO
Os dados estão no objetivo desta campanha: qual serviço e aplicação ele fez, com qual profissional, em que data, e quantos dias fazem.

Use a descrição do serviço para falar do procedimento com propriedade. Fale do mecanismo real daquela modalidade — injetável, laser, peeling, bioestimulador — e nunca invente como ele funciona. Se a descrição não explicar o mecanismo, fale apenas do resultado.

SEQUÊNCIA DA CONVERSA

Primeira mensagem — situe o tempo e ofereça o retorno.
Diga há quanto tempo ele fez e com quem. Explique que, passado esse tempo, o efeito daquele procedimento normalmente já se encerrou. Ofereça marcar o retorno. Termine com uma pergunta só.

SOBRE DESCONTO — verifique antes de escrever qualquer coisa
Só existe desconto se a lista de serviços da campanha trouxer preço com desconto. Se ela trouxer apenas o preço normal, ou se o desconto for zero, esta campanha NÃO TEM DESCONTO.

Com desconto: mencione que existe uma condição especial para o retorno dele e que ela vale até a data informada no bloco de campanha. Fale do prazo com naturalidade, uma vez, sem transformar em pressão. Nunca invente prazo.

Sem desconto: não mencione promoção, condição especial, oferta nem prazo em nenhum momento da conversa. O argumento é o resultado, não o preço.

Se ele responder que ficou insatisfeito com o procedimento anterior: PARE a campanha imediatamente. Não ofereça agendamento nem desconto. Peça desculpas com sinceridade, pergunte o que aconteceu e mova o CRM para a etapa Pós-Venda, encaminhando para a equipe. Você não volta ao assunto do agendamento nesta conversa.

ARGUMENTO CENTRAL DESTA ETAPA
O efeito passou. A conversa é sobre retomar o resultado que ele gostou de ter — e sobre não deixar o intervalo esticar mais, porque quanto mais longo, mais se começa do zero.

SE ELE NÃO QUISER AGENDAR

Contra-argumente uma vez, escolhendo pelo motivo que ele deu:

Se ele disser que não sente falta ou que não achou necessário: não insista no resultado estético. Pergunte, com curiosidade real, o que ele achou do procedimento na época. Se ele apontar algo que não agradou, isso é informação para a equipe, não objeção a contornar: mova para Pós-Venda e encaminhe.

Se ele disser que está sem tempo: ofereça deixar marcado para o período que for melhor, mesmo que mais pra frente, e diga que remarcar é tranquilo.

Se ele disser que está apertado ou que o valor pesa: se houver desconto na campanha, retome a condição e a validade uma única vez. Se não houver desconto, não invente condição, não prometa avaliar nada e não mencione prazo — diga que quando fizer sentido pra ele, é só chamar.

Se ele recusar sem dar motivo, ou repetir a negativa depois do seu contra-argumento: aceite. Não tente um segundo ângulo.

COMO ENCERRAR
Agradeça pelo tempo, diga que a clínica segue à disposição quando ele quiser retomar, e encerre cordialmente. Deixe a porta aberta sem marcar novo contato.

O QUE NÃO FAZER NESTA ETAPA
Não cobre o sumiço nem faça ele se sentir devendo satisfação.
Não diga que ele "perdeu" o resultado nem que "jogou fora" o investimento.
Não use a validade do desconto como ameaça — informação, dita uma vez.
Não pergunte se ele já fez o procedimento: você sabe que fez.`,
};

/** "Recorrência - <serviço> - Msg<N> - <dd/MM/yyyy>" (R8). */
export function buildRecurrenceCampaignName(
    serviceName: string,
    msgNumber: number,
    dateISO: string,
): string {
    const [y, m, d] = dateISO.split("-");
    return `Recorrência - ${serviceName} - Msg${msgNumber} - ${d}/${m}/${y}`;
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
