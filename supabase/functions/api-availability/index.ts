import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { getWorkHoursForDay } from "../_shared/professional-schedule.ts";
import { getBlockedProfessionalIds } from "../_shared/day-blocks.ts";
import { getSlotSettings, padBusyRange, type SlotSettings } from "../_shared/slot-settings.ts";
import {
    CONVENIO_PROF_COLUMNS,
    assertServiceAptoConvenio,
    convenioRanges,
    filterRoomsForConvenio,
    getConvenioRoomIds,
    insideConvenio,
    overlapsConvenio,
    resolveConvenioSelection,
    type ConvenioSelection,
} from "../_shared/convenio-schedule.ts";
import {
    ApiError,
    apiError,
    dbErrorResponse,
    describeDbError,
    missingFields,
    readJsonBody,
    requireApiKey,
    unexpectedErrorResponse,
} from "../_shared/api-errors.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const BANDS_3 = [
    { label: "manha", start: 6 * 60, end: 10 * 60 },
    { label: "meio_dia", start: 10 * 60, end: 14 * 60 },
    { label: "tarde", start: 14 * 60, end: 20 * 60 },
];

function parseWorkTime(t: any): number | null {
    if (t == null) return null;
    if (typeof t === "string" && t.includes(":")) {
        const [h, m] = t.split(":").map(Number);
        return h * 60 + (m || 0);
    }
    const num = parseFloat(t);
    return isNaN(num) ? null : num * 60;
}

function pad(n: number): string { return String(n).padStart(2, "0"); }

function formatDate(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Minute of day of a UTC timestamp in the São Paulo timezone */
function spMinuteOfDay(iso: string): number {
    const t = new Date(iso).toLocaleTimeString("en-GB", { timeZone: "America/Sao_Paulo", hour12: false });
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
}

/** Current date/time in São Paulo as a naive Date (safe for date arithmetic/getDay) */
function spNow(): Date {
    const s = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" });
    return new Date(s.replace(" ", "T"));
}

const DAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Slot { time: string; professional: string; minuteOfDay: number; }

/**
 * Agrupa os horários pela sala que atende o serviço.
 *
 * A lista `slots` sai ordenada por horário, então as salas ficam intercaladas
 * ("08:00 Sala 1, 08:10 Sala 2, 08:20 Sala 1"). Deixar o agrupamento a cargo do
 * prompt do n8n é frágil: o modelo oferece dois horários como se fossem da
 * mesma agenda e depois manda um `professional_name` que não bate com o horário
 * escolhido — e o `create_appointment` só resolve a sala sozinho quando o
 * serviço tem exatamente uma.
 */
function groupByProfessional(
    slots: { time: string; professional: string }[],
): { professional: string; times: string[] }[] {
    const byProf = new Map<string, string[]>();
    for (const s of slots) {
        if (!byProf.has(s.professional)) byProf.set(s.professional, []);
        byProf.get(s.professional)!.push(s.time);
    }
    return [...byProf.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
        .map(([professional, times]) => ({ professional, times }));
}

/** Get all free slots for a given date across all professionals */
async function getSlotsForDate(
    supabase: any, professionals: any[], dateStr: string, dayOfWeek: number, duration: number,
    slotSettings: SlotSettings, convenio: ConvenioSelection
): Promise<Slot[]> {
    const slots: Slot[] = [];

    // Agenda fechada no dia (cadeado da agenda) → profissional fora da busca
    const blocked = await getBlockedProfessionalIds(supabase, professionals.map((p: any) => p.id), dateStr);

    for (const prof of professionals) {
        if (blocked.has(prof.id)) continue;
        const workDays: number[] = prof.work_days || [0, 1, 2, 3, 4, 5, 6];
        if (!workDays.includes(dayOfWeek)) continue;

        const wh = getWorkHoursForDay(prof, dayOfWeek);
        const whStart = parseWorkTime(wh.start) ?? 8 * 60;
        const whEnd = parseWorkTime(wh.end) ?? 20 * 60;
        const breakStart = parseWorkTime(wh.break_start);
        const breakEnd = parseWorkTime(wh.break_end);

        // Faixas dedicadas a convênio nesta sala neste dia (já cortadas pelo
        // expediente e pelo intervalo).
        const convRanges = convenioRanges(prof, dayOfWeek, {
            start: whStart, end: whEnd, breakStart, breakEnd,
        });
        // Sala habilitada mas sem janela válida no dia não tem agenda de convênio.
        if (convenio.requested && convRanges.length === 0) continue;

        const { data: appointments, error: apptError } = await supabase
            .from("appointments")
            .select("start_time, end_time")
            .eq("professional_id", prof.id)
            .neq("status", "canceled")
            .gte("start_time", `${dateStr}T00:00:00-03:00`)
            .lte("start_time", `${dateStr}T23:59:59-03:00`);

        // Fatal de propósito: sem a agenda ocupada do profissional a função
        // ofereceria horários já preenchidos (overbooking silencioso).
        if (apptError) {
            throw new ApiError({
                status: 500,
                code: "appointments_read_failed",
                message: describeDbError(
                    `ler os agendamentos de ${prof.name} em ${dateStr} para calcular os horários livres`, apptError),
                details: String((apptError as any)?.message ?? apptError),
            });
        }

        // A folga da conta entra aqui: cada agendamento ocupa a própria duração
        // mais o intervalo configurado dos dois lados.
        const busy = (appointments || []).map((a: any) => padBusyRange({
            start: spMinuteOfDay(a.start_time),
            end: spMinuteOfDay(a.end_time),
        }, slotSettings.bufferMinutes));

        for (let m = whStart; m + duration <= whEnd; m += slotSettings.stepMinutes) {
            if (breakStart !== null && breakEnd !== null && m < breakEnd && m + duration > breakStart) continue;
            // Convênio "sim" só oferece o que cabe inteiro na janela dedicada;
            // convênio "nao" nunca encosta nela.
            if (convenio.requested) {
                if (!insideConvenio(m, duration, convRanges)) continue;
            } else if (overlapsConvenio(m, duration, convRanges)) {
                continue;
            }
            let conflict = false;
            for (const b of busy) { if (m < b.end && m + duration > b.start) { conflict = true; break; } }
            if (conflict) continue;
            slots.push({ time: `${pad(Math.floor(m / 60))}:${pad(m % 60)}`, professional: prof.name, minuteOfDay: m });
        }
    }

    return slots.sort((a, b) => a.minuteOfDay - b.minuteOfDay);
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const { user_id, service_name, date, period, conversation_id } = body!;

        const missingRequired = missingFields(corsHeaders, body!, ["user_id", "service_name"],
            "Envie o id da conta (bd_data.user_id no prompt da IA) e o nome exato da aplicação a consultar.");
        if (missingRequired) return missingRequired;

        // `date` é opcional, mas se vier quebrado a busca varre 30 dias inválidos
        // e devolve "sem disponibilidade" sem que ninguém saiba o porquê.
        if (date && !DATE_RE.test(String(date))) {
            return apiError(corsHeaders, {
                status: 400,
                code: "invalid_date_format",
                message: `Campo date com formato inválido: "${date}". Use AAAA-MM-DD (ex.: 2026-08-30).`,
            });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // Passo da grade e folga entre atendimentos (IA > Configurações)
        const slotSettings = await getSlotSettings(supabase, user_id);

        // Find the service
        const { data: sc, error: scError } = await supabase
            .from("services_client")
            .select("id, name, duration_minutes, professionals")
            .eq("user_id", user_id)
            .ilike("name", service_name)
            .eq("status", true)
            .limit(1)
            .maybeSingle();

        if (scError) {
            return dbErrorResponse(corsHeaders, "service_lookup_failed",
                `buscar a aplicação "${service_name}" no catálogo desta conta`, scError);
        }

        if (!sc) {
            // Listar as aplicações válidas é barato e evita o n8n ficar tentando nomes no escuro
            const { data: options, error: optionsError } = await supabase
                .from("services_client")
                .select("name")
                .eq("user_id", user_id)
                .eq("status", true)
                .order("name")
                .limit(50);
            if (optionsError) {
                console.warn("[api-availability]", describeDbError(
                    "listar as aplicações ativas da conta para sugerir opções", optionsError));
            }
            const names = (options || []).map((o: any) => o.name).join(", ");
            return apiError(corsHeaders, {
                status: 404,
                code: "service_not_found",
                message: `Aplicação "${service_name}" não encontrada no catálogo ativo desta conta. Confira o nome exato em Serviços — aplicações desativadas não aparecem aqui. Aplicações disponíveis: ${names || "(nenhuma aplicação ativa cadastrada nesta conta)"}.`,
            });
        }

        // Convênio pedido na chamada (ausente = particular). Feito depois do
        // serviço porque a checagem de "apto" depende do id da aplicação.
        const convenio = await resolveConvenioSelection(supabase, user_id, body!);
        await assertServiceAptoConvenio(supabase, convenio, sc.id, sc.name);

        const duration = sc.duration_minutes || 30;
        let profIds: string[] = sc.professionals || [];
        if (profIds.length === 0) {
            return apiError(corsHeaders, {
                status: 409,
                code: "service_without_professionals",
                message: `A aplicação "${sc.name}" não tem nenhum profissional vinculado, então não existe agenda para consultar. Vincule ao menos um profissional a ela em Serviços.`,
            });
        }

        // ── Campanha do cliente pode limitar os profissionais (etapa Tipo > Promoção) ──
        // Só dá para saber de quem é a conversa se o n8n mandar conversation_id
        // (bd_data.conversation_id). Sem ele, a agenda continua aberta a todos.
        let campaignFilter: { name: string; names: string[] } | null = null;
        if (conversation_id) {
            const { data: conv, error: convError } = await supabase
                .from("conversations")
                .select("id, user_id, contact_id, instance_id")
                .eq("id", String(conversation_id))
                .maybeSingle();

            if (convError) {
                return dbErrorResponse(corsHeaders, "conversation_lookup_failed",
                    `buscar a conversa ${conversation_id} para checar se a campanha do cliente limita os profissionais`, convError);
            }
            if (!conv) {
                return apiError(corsHeaders, {
                    status: 404,
                    code: "conversation_not_found",
                    message: `Conversa "${conversation_id}" não encontrada. Envie o valor de bd_data.conversation_id que chegou no prompt, ou omita o campo para consultar a agenda sem filtro de campanha.`,
                });
            }
            if (conv.user_id !== user_id) {
                return apiError(corsHeaders, {
                    status: 403,
                    code: "conversation_other_account",
                    message: `A conversa "${conversation_id}" pertence a outra conta, diferente do user_id informado. Use o conversation_id e o user_id do mesmo bd_data.`,
                });
            }

            if (conv.contact_id && conv.instance_id) {
                // Mesma regra do prompt: 1 campanha ativa por contato por instância
                const { data: campSent, error: campError } = await supabase
                    .from("campaign_contacts")
                    .select("sent_at, campaigns!inner(name, professionals, instance_id, valid_until, status)")
                    .eq("contact_id", conv.contact_id)
                    .eq("status", "sent")
                    .eq("campaigns.instance_id", conv.instance_id)
                    .gte("campaigns.valid_until", new Date().toISOString())
                    .in("campaigns.status", ["dispatching", "dispatched"])
                    .order("sent_at", { ascending: false })
                    .limit(1)
                    .maybeSingle();

                // Fatal de propósito: engolir este erro ofereceria horários de
                // profissionais que a campanha não liberou.
                if (campError) {
                    return dbErrorResponse(corsHeaders, "campaign_lookup_failed",
                        `buscar a campanha ativa do cliente para saber quais profissionais estão liberados`, campError);
                }

                const camp = (campSent as any)?.campaigns;
                const list: any[] = Array.isArray(camp?.professionals) ? camp.professionals : [];
                if (list.length > 0) {
                    const allowed = new Set(list.map((p: any) => String(p?.id ?? "")).filter(Boolean));
                    const names = list.map((p: any) => String(p?.name ?? "").trim()).filter(Boolean);
                    const restricted = profIds.filter((id) => allowed.has(id));

                    if (restricted.length === 0) {
                        // Sem isto a resposta seria "sem horários" e a IA diria que a
                        // agenda está cheia — quando na verdade é a campanha que não
                        // libera ninguém que atenda esta aplicação.
                        return apiError(corsHeaders, {
                            status: 409,
                            code: "campaign_professionals_unavailable",
                            message: `A campanha "${camp.name}" está liberada apenas para ${names.join(", ") || "profissionais que não constam mais no cadastro"}, e nenhum deles atende a aplicação "${sc.name}". Ofereça outra aplicação da campanha ou revise os profissionais habilitados nela.`,
                        });
                    }

                    profIds = restricted;
                    campaignFilter = { name: camp.name, names };
                }
            }
        }

        const { data: allProfessionals, error: profError } = await supabase
            .from("professionals")
            .select(`id, name, work_hours, work_days, use_daily_schedule, work_hours_daily, ${CONVENIO_PROF_COLUMNS}`)
            .in("id", profIds).eq("active", true);
        if (profError) {
            return dbErrorResponse(corsHeaders, "professionals_read_failed",
                `buscar os profissionais vinculados à aplicação "${sc.name}"`, profError);
        }

        // Convênio "sim" só enxerga salas habilitadas (e ligadas ao convênio).
        let professionals = allProfessionals as any[] | null;
        if (convenio.requested && convenio.convenio) {
            const roomIds = await getConvenioRoomIds(supabase, convenio.convenio.id);
            professionals = filterRoomsForConvenio((allProfessionals || []) as any[], roomIds);
            if (professionals.length === 0) {
                return apiError(corsHeaders, {
                    status: 409,
                    code: "convenio_without_rooms",
                    message: `Nenhuma sala que atende a aplicação "${sc.name}" está habilitada para ${convenio.catchAll ? "convênio" : `o convênio ${convenio.convenio.nome}`}. Habilite o atendimento de convênio na sala em Equipe > Salas, ou ofereça a aplicação como particular.`,
                });
            }
        }

        if (!professionals || professionals.length === 0) {
            // Não é 404 do pedido do chamador: o pedido está certo, o cadastro é que
            // aponta para profissionais que já foram excluídos.
            return apiError(corsHeaders, {
                status: 409,
                code: "professional_not_found",
                message: `A aplicação "${sc.name}" aponta para ${profIds.length} profissional(is) que não existem mais no cadastro. Revise os profissionais vinculados a ela em Serviços.`,
                details: `ids vinculados: ${profIds.join(", ")}`,
            });
        }

        const MAX_SEARCH = 30;

        // Vai junto em toda resposta de sucesso: deixa explícito para a IA que a
        // lista já saiu restringida pela campanha (e por quem).
        const campaignInfo = campaignFilter
            ? {
                campaign_filter: {
                    campaign: campaignFilter.name,
                    professionals: campaignFilter.names,
                    note: `Horários limitados aos profissionais habilitados na campanha "${campaignFilter.name}".`,
                },
            }
            : {};

        // Deixa explícito na resposta se a lista é de convênio ou particular —
        // sem isso a IA não sabe qual agenda está lendo.
        const convenioInfo = convenio.requested && convenio.convenio
            ? {
                convenio: {
                    nome: convenio.catchAll ? "Habilitado para todos os convênios" : convenio.convenio.nome,
                    note: "Somente horários reservados para atendimento de convênio.",
                },
            }
            : { convenio: null };

        // ════════════════════════════════════════════
        // MODE 2: date + period → all slots in period
        // ════════════════════════════════════════════
        if (date && period) {
            // sem isto um period não-texto estoura em .toLowerCase() e vira erro sem contexto
            if (typeof period !== "string") {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "invalid_period",
                    message: `Campo period precisa ser texto: use "manha" ou "tarde". Recebido: ${Array.isArray(period) ? "array" : typeof period}.`,
                });
            }
            const periodLower = period.toLowerCase();
            const cutoff = 12 * 60; // manha < 12h, tarde >= 12h
            const filterFn = periodLower === "manha"
                ? (s: Slot) => s.minuteOfDay < cutoff
                : (s: Slot) => s.minuteOfDay >= cutoff;
            const periodLabel = periodLower === "manha" ? "manhã" : "tarde";

            // Try the requested date first
            const reqDate = new Date(date + "T12:00:00");
            const dateStr = formatDate(reqDate);
            const allSlots = await getSlotsForDate(supabase, professionals, dateStr, reqDate.getDay(), duration, slotSettings, convenio);
            const filtered = allSlots.filter(filterFn);

            if (filtered.length > 0) {
                const flat = filtered.map(s => ({ time: s.time, professional: s.professional }));
                return new Response(JSON.stringify({
                    service: sc.name,
                    duration_minutes: duration,
                    date: dateStr,
                    day_label: DAY_NAMES[reqDate.getDay()],
                    period: periodLabel,
                    by_professional: groupByProfessional(flat),
                    slots: flat,
                    ...campaignInfo,
                ...convenioInfo,
                }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // No slots in requested date+period → find next available day with slots in that period
            let search = new Date(reqDate);
            search.setDate(search.getDate() + 1);

            for (let i = 0; i < MAX_SEARCH; i++) {
                const sDateStr = formatDate(search);
                const sSlots = await getSlotsForDate(supabase, professionals, sDateStr, search.getDay(), duration, slotSettings, convenio);
                const sFiltered = sSlots.filter(filterFn);

                if (sFiltered.length > 0) {
                    const sFlat = sFiltered.map(s => ({ time: s.time, professional: s.professional }));
                    return new Response(JSON.stringify({
                        service: sc.name,
                        duration_minutes: duration,
                        requested_date: dateStr,
                        message: `Sem horários no período da ${periodLabel} em ${dateStr}. Próxima disponibilidade:`,
                        date: sDateStr,
                        day_label: DAY_NAMES[search.getDay()],
                        period: periodLabel,
                        by_professional: groupByProfessional(sFlat),
                        slots: sFlat,
                        ...campaignInfo,
                        ...convenioInfo,
                    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
                }

                search.setDate(search.getDate() + 1);
            }

            return new Response(JSON.stringify({
                service: sc.name,
                message: `Nenhum horário disponível no período da ${periodLabel} nos próximos 30 dias`,
                by_professional: [],
                slots: [],
                ...campaignInfo,
                ...convenioInfo,
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ════════════════════════════════════════════
        // MODE 1: no date/period → 3 next days summary
        // ════════════════════════════════════════════
        const today = spNow();
        const availability: any[] = [];
        let searchDate = new Date(today);
        searchDate.setDate(searchDate.getDate() + 1);
        searchDate.setHours(0, 0, 0, 0);

        for (let attempt = 0; attempt < MAX_SEARCH && availability.length < 3; attempt++) {
            const dateStr = formatDate(searchDate);
            const daySlots = await getSlotsForDate(supabase, professionals, dateStr, searchDate.getDay(), duration, slotSettings, convenio);

            if (daySlots.length > 0) {
                // 3 horários POR PROFISSIONAL (um por faixa manhã/meio-dia/tarde)
                const pickedSlots: { time: string; professional: string }[] = [];
                const profNames = [...new Set(daySlots.map(s => s.professional))];
                for (const profName of profNames) {
                    const profSlots = daySlots.filter(s => s.professional === profName);
                    for (const band of BANDS_3) {
                        const inBand = profSlots.filter(s => s.minuteOfDay >= band.start && s.minuteOfDay < band.end);
                        if (inBand.length > 0) {
                            const mid = Math.floor(inBand.length / 2);
                            pickedSlots.push({ time: inBand[mid].time, professional: profName });
                        }
                    }
                }
                if (pickedSlots.length > 0) {
                    availability.push({
                        date: dateStr,
                        day_label: DAY_NAMES[searchDate.getDay()],
                        by_professional: groupByProfessional(pickedSlots),
                        slots: pickedSlots,
                    });
                }
            }

            searchDate.setDate(searchDate.getDate() + 1);
        }

        return new Response(JSON.stringify({
            service: sc.name,
            duration_minutes: duration,
            availability,
            ...campaignInfo,
            ...convenioInfo,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (error) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de disponibilidade (api-availability)", error);
    }
});
