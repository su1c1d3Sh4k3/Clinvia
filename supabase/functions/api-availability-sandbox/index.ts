import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { getWorkHoursForDay } from "../_shared/professional-schedule.ts";
import { getBlockedProfessionalIds } from "../_shared/day-blocks.ts";
import { getSlotSettings, padBusyRange, type SlotSettings } from "../_shared/slot-settings.ts";
import { findServiceByDisplayName } from "../_shared/service-label.ts";
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
    detalheTecnicoNoCorpo,
} from "../_shared/api-errors.ts";

// Esta API fala com o n8n: o detalhe tecnico do banco no corpo da resposta e
// o que a torna diagnosticavel. Sem esta declaracao o corpo sai limpo -- ver
// o cabecalho de `_shared/api-errors.ts`.
detalheTecnicoNoCorpo();

import { loadSandboxContext, logSandboxCall, type SandboxContext } from "../_shared/sandbox.ts";

/**
 * api-availability-sandbox
 *
 * Gêmea de `api-availability` no ambiente de teste. As salas, os serviços e os
 * convênios são os REAIS da conta (é isso que o cliente quer testar); o que muda
 * é de onde vem a agenda ocupada:
 *
 *   agenda_mode = 'real'  → agendamentos reais das salas + os do sandbox
 *   agenda_mode = 'livre' → SÓ os agendamentos do sandbox (agenda liberada)
 *
 * Header: x-api-key = SCHEDULING_API_KEY
 * Body: { user_id | conversation_id, service_name, date?, period?, convenio? }
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-origin",
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

function spMinuteOfDay(iso: string): number {
    const t = new Date(iso).toLocaleTimeString("en-GB", { timeZone: "America/Sao_Paulo", hour12: false });
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
}

function spNow(): Date {
    const s = new Date().toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" });
    return new Date(s.replace(" ", "T"));
}

function normalize(s: string): string {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

const DAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Slot { time: string; professional: string; minuteOfDay: number; }

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

/** Horários livres do dia. `agendaReal` decide se a agenda de produção pesa. */
async function getSlotsForDate(
    supabase: any, ctx: SandboxContext, professionals: any[], dateStr: string, dayOfWeek: number,
    duration: number, slotSettings: SlotSettings, convenio: ConvenioSelection, agendaReal: boolean,
): Promise<Slot[]> {
    const slots: Slot[] = [];

    // O cadeado da agenda é do cadastro real da sala, então vale nos dois modos.
    const blocked = await getBlockedProfessionalIds(supabase, professionals.map((p: any) => p.id), dateStr);

    // Agendamentos do próprio sandbox no dia (sempre contam)
    const { data: sandboxAppts, error: sbError } = await supabase
        .from("sandbox_appointments")
        .select("professional_id, start_time, end_time")
        .eq("session_id", ctx.session.id)
        .neq("status", "canceled")
        .gte("start_time", `${dateStr}T00:00:00-03:00`)
        .lte("start_time", `${dateStr}T23:59:59-03:00`);

    if (sbError) {
        throw new ApiError({
            status: 500,
            code: "sandbox_appointments_read_failed",
            message: describeDbError(
                `ler os agendamentos do ambiente de teste em ${dateStr}`, sbError),
            details: String((sbError as any)?.message ?? sbError),
        });
    }

    for (const prof of professionals) {
        if (blocked.has(prof.id)) continue;
        const workDays: number[] = prof.work_days || [0, 1, 2, 3, 4, 5, 6];
        if (!workDays.includes(dayOfWeek)) continue;

        const wh = getWorkHoursForDay(prof, dayOfWeek);
        const whStart = parseWorkTime(wh.start) ?? 8 * 60;
        const whEnd = parseWorkTime(wh.end) ?? 20 * 60;
        const breakStart = parseWorkTime(wh.break_start);
        const breakEnd = parseWorkTime(wh.break_end);

        const convRanges = convenioRanges(prof, dayOfWeek, {
            start: whStart, end: whEnd, breakStart, breakEnd,
        });
        if (convenio.requested && convRanges.length === 0) continue;

        const ocupados: { start_time: string; end_time: string }[] = (sandboxAppts || [])
            .filter((a: any) => a.professional_id === prof.id);

        if (agendaReal) {
            const { data: appointments, error: apptError } = await supabase
                .from("appointments")
                .select("start_time, end_time")
                .eq("professional_id", prof.id)
                .neq("status", "canceled")
                .gte("start_time", `${dateStr}T00:00:00-03:00`)
                .lte("start_time", `${dateStr}T23:59:59-03:00`);

            // Fatal: sem a agenda real o modo "Agenda Real" ofereceria horário ocupado
            if (apptError) {
                throw new ApiError({
                    status: 500,
                    code: "appointments_read_failed",
                    message: describeDbError(
                        `ler os agendamentos reais de ${prof.name} em ${dateStr} (modo Agenda Real)`, apptError),
                    details: String((apptError as any)?.message ?? apptError),
                });
            }
            ocupados.push(...(appointments || []));
        }

        const busy = ocupados.map((a: any) => padBusyRange({
            start: spMinuteOfDay(a.start_time),
            end: spMinuteOfDay(a.end_time),
        }, slotSettings.bufferMinutes));

        for (let m = whStart; m + duration <= whEnd; m += slotSettings.stepMinutes) {
            if (breakStart !== null && breakEnd !== null && m < breakEnd && m + duration > breakStart) continue;
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

serveMonitored("api-availability-sandbox", async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const { service_name, date, period, professional_name } = body!;

        const missingRequired = missingFields(corsHeaders, body!, ["service_name"],
            "Envie o nome exato da aplicação a consultar.");
        if (missingRequired) return missingRequired;

        if (date && !DATE_RE.test(String(date))) {
            return apiError(corsHeaders, {
                status: 400,
                code: "invalid_date_format",
                message: `Campo date com formato inválido: "${date}". Use AAAA-MM-DD (ex.: 2026-08-30).`,
            });
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const ctx = await loadSandboxContext(supabase, {
            conversationId: body!.conversation_id,
            userId: body!.user_id,
        });
        const userId = ctx.userId;
        const agendaReal = ctx.session.agenda_mode !== "livre";

        const slotSettings = await getSlotSettings(supabase, userId);

        const SERVICE_COLUMNS = "id, name, duration_minutes, professionals";
        const { data: scExact, error: scError } = await supabase
            .from("services_client")
            .select(SERVICE_COLUMNS)
            .eq("user_id", userId)
            .ilike("name", service_name)
            .eq("status", true)
            .limit(1)
            .maybeSingle();

        if (scError) {
            return dbErrorResponse(corsHeaders, "service_lookup_failed",
                `buscar a aplicação "${service_name}" no catálogo desta conta`, scError, req);
        }

        const sc = scExact
            || await findServiceByDisplayName(supabase, userId, service_name, SERVICE_COLUMNS);

        if (!sc) {
            const { data: options } = await supabase
                .from("services_client")
                .select("name")
                .eq("user_id", userId)
                .eq("status", true)
                .order("name")
                .limit(50);
            const names = (options || []).map((o: any) => o.name).join(", ");
            await logSandboxCall(supabase, ctx, {
                function_name: "api-availability-sandbox",
                label: `Procurou horários de "${service_name}" e o serviço não existe no catálogo`,
                ok: false,
                status_code: 404,
                request: body,
            });
            return apiError(corsHeaders, {
                status: 404,
                code: "service_not_found",
                message: `Aplicação "${service_name}" não encontrada no catálogo ativo desta conta. Confira o nome exato em Serviços — aplicações desativadas não aparecem aqui. Aplicações disponíveis: ${names || "(nenhuma aplicação ativa cadastrada nesta conta)"}.`,
            });
        }

        const convenio = await resolveConvenioSelection(supabase, userId, body!);
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

        const { data: allProfessionals, error: profError } = await supabase
            .from("professionals")
            .select(`id, name, work_hours, work_days, use_daily_schedule, work_hours_daily, ${CONVENIO_PROF_COLUMNS}`)
            .in("id", profIds).eq("active", true);
        if (profError) {
            return dbErrorResponse(corsHeaders, "professionals_read_failed",
                `buscar os profissionais vinculados à aplicação "${sc.name}"`, profError, req);
        }

        let professionals = (allProfessionals || []) as any[];

        // ── Campanha simulada pode limitar as salas (mesma regra da produção) ──
        // No sandbox a campanha guarda NOMES (o simulador é preenchido à mão).
        let campaignFilter: { name: string; names: string[] } | null = null;
        const { data: camp } = await supabase
            .from("sandbox_campaigns")
            .select("name, professionals")
            .eq("session_id", ctx.session.id)
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        const campProfNames: string[] = Array.isArray(camp?.professionals) ? camp!.professionals : [];
        if (campProfNames.length > 0) {
            const allowed = new Set(campProfNames.map(normalize));
            const restricted = professionals.filter((p) => allowed.has(normalize(p.name)));
            if (restricted.length === 0) {
                return apiError(corsHeaders, {
                    status: 409,
                    code: "campaign_professionals_unavailable",
                    message: `A campanha "${camp!.name}" está liberada apenas para ${campProfNames.join(", ")}, e nenhum deles atende a aplicação "${sc.name}". Ofereça outra aplicação da campanha ou revise os profissionais habilitados nela.`,
                });
            }
            professionals = restricted;
            campaignFilter = { name: camp!.name, names: campProfNames };
        }

        if (convenio.requested && convenio.convenio) {
            const roomIds = await getConvenioRoomIds(supabase, convenio.convenio.id);
            professionals = filterRoomsForConvenio(professionals, roomIds);
            if (professionals.length === 0) {
                return apiError(corsHeaders, {
                    status: 409,
                    code: "convenio_without_rooms",
                    message: `Nenhuma sala que atende a aplicação "${sc.name}" está habilitada para ${convenio.catchAll ? "convênio" : `o convênio ${convenio.convenio.nome}`}. Habilite o atendimento de convênio na sala em Equipe > Salas, ou ofereça a aplicação como particular.`,
                });
            }
        }

        if (professionals.length === 0) {
            return apiError(corsHeaders, {
                status: 409,
                code: "professional_not_found",
                message: `A aplicação "${sc.name}" aponta para ${profIds.length} profissional(is) que não existem mais no cadastro. Revise os profissionais vinculados a ela em Serviços.`,
                details: `ids vinculados: ${profIds.join(", ")}`,
            });
        }

        // ── Filtro opcional por profissional (gêmeo do de `api-availability`) ──
        // Mesma comparação por `includes` sem caixa do `resolveProfessional` de
        // `api-scheduling`: nome que lista horário aqui tem que agendar lá.
        // Fica com TODOS os que batem, não com o primeiro: consultar agenda é
        // listagem, e "Camila" devolvendo as duas é melhor resposta.
        let professionalFilter: string | null = null;
        if (professional_name != null && String(professional_name).trim() !== "") {
            if (typeof professional_name !== "string") {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "invalid_professional_name",
                    message: `Campo professional_name precisa ser texto. Recebido: ${Array.isArray(professional_name) ? "array" : typeof professional_name}.`,
                });
            }
            const alvo = professional_name.trim().toLowerCase();
            const escolhidos = professionals.filter((p: any) =>
                String(p.name || "").toLowerCase().includes(alvo));

            if (escolhidos.length === 0) {
                return apiError(corsHeaders, {
                    status: 404,
                    code: "professional_does_not_serve",
                    message: `O profissional "${professional_name}" não atende a aplicação "${sc.name}"${
                        convenio.requested && convenio.convenio ? " nas salas habilitadas para convênio" : ""
                    }. Profissionais disponíveis para ela: ${professionals.map((p: any) => p.name).join(", ")}.`,
                });
            }

            professionals = escolhidos;
            professionalFilter = escolhidos.map((p: any) => p.name).join(", ");
        }

        // O painel do ambiente de teste mostra este texto: sem o nome, uma agenda
        // recortada por profissional parece a agenda cheia da aplicação.
        const sufixoProf = professionalFilter ? ` — só ${professionalFilter}` : "";

        const MAX_SEARCH = 30;

        const professionalInfo = professionalFilter
            ? {
                professional_filter: {
                    requested: String(professional_name),
                    professionals: professionalFilter,
                    note: `Horários apenas de ${professionalFilter}. Outros profissionais atendem esta aplicação em horários que não estão nesta lista.`,
                },
            }
            : {};

        const campaignInfo = campaignFilter
            ? {
                campaign_filter: {
                    campaign: campaignFilter.name,
                    professionals: campaignFilter.names,
                    note: `Horários limitados aos profissionais habilitados na campanha "${campaignFilter.name}".`,
                },
            }
            : {};

        const convenioInfo = convenio.requested && convenio.convenio
            ? {
                convenio: {
                    nome: convenio.catchAll ? "Habilitado para todos os convênios" : convenio.convenio.nome,
                    note: "Somente horários reservados para atendimento de convênio.",
                },
            }
            : { convenio: null };

        const sandboxInfo = {
            sandbox: true,
            agenda_mode: agendaReal ? "real" : "livre",
        };

        // ── date + period: todos os horários do período ──
        if (date && period) {
            if (typeof period !== "string") {
                return apiError(corsHeaders, {
                    status: 400,
                    code: "invalid_period",
                    message: `Campo period precisa ser texto: use "manha" ou "tarde". Recebido: ${Array.isArray(period) ? "array" : typeof period}.`,
                });
            }
            const periodLower = period.toLowerCase();
            const cutoff = 12 * 60;
            const filterFn = periodLower === "manha"
                ? (s: Slot) => s.minuteOfDay < cutoff
                : (s: Slot) => s.minuteOfDay >= cutoff;
            const periodLabel = periodLower === "manha" ? "manhã" : "tarde";

            const reqDate = new Date(date + "T12:00:00");
            const dateStr = formatDate(reqDate);
            const allSlots = await getSlotsForDate(
                supabase, ctx, professionals, dateStr, reqDate.getDay(), duration, slotSettings, convenio, agendaReal);
            const filtered = allSlots.filter(filterFn);

            if (filtered.length > 0) {
                const flat = filtered.map((s) => ({ time: s.time, professional: s.professional }));
                await logSandboxCall(supabase, ctx, {
                    function_name: "api-availability-sandbox",
                    label: `Consultou horários de ${dateStr.split("-").reverse().join("/")} à ${periodLabel} (${flat.length} livres)${sufixoProf}`,
                    request: body,
                });
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
                    ...professionalInfo,
                    ...sandboxInfo,
                }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            const search = new Date(reqDate);
            search.setDate(search.getDate() + 1);

            for (let i = 0; i < MAX_SEARCH; i++) {
                const sDateStr = formatDate(search);
                const sSlots = await getSlotsForDate(
                    supabase, ctx, professionals, sDateStr, search.getDay(), duration, slotSettings, convenio, agendaReal);
                const sFiltered = sSlots.filter(filterFn);

                if (sFiltered.length > 0) {
                    const sFlat = sFiltered.map((s) => ({ time: s.time, professional: s.professional }));
                    await logSandboxCall(supabase, ctx, {
                        function_name: "api-availability-sandbox",
                        label: `Sem horários em ${dateStr.split("-").reverse().join("/")}; ofereceu ${sDateStr.split("-").reverse().join("/")}${sufixoProf}`,
                        request: body,
                    });
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
                        ...professionalInfo,
                        ...sandboxInfo,
                    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
                }

                search.setDate(search.getDate() + 1);
            }

            await logSandboxCall(supabase, ctx, {
                function_name: "api-availability-sandbox",
                label: `Consultou horários e não achou nada nos próximos 30 dias (${periodLabel})${sufixoProf}`,
                request: body,
            });
            return new Response(JSON.stringify({
                service: sc.name,
                message: `Nenhum horário disponível no período da ${periodLabel} nos próximos 30 dias`,
                by_professional: [],
                slots: [],
                ...campaignInfo,
                ...convenioInfo,
                ...professionalInfo,
                ...sandboxInfo,
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Sem date/period: resumo dos 3 próximos dias ──
        const today = spNow();
        const availability: any[] = [];
        const searchDate = new Date(today);
        searchDate.setDate(searchDate.getDate() + 1);
        searchDate.setHours(0, 0, 0, 0);

        for (let attempt = 0; attempt < MAX_SEARCH && availability.length < 3; attempt++) {
            const dateStr = formatDate(searchDate);
            const daySlots = await getSlotsForDate(
                supabase, ctx, professionals, dateStr, searchDate.getDay(), duration, slotSettings, convenio, agendaReal);

            if (daySlots.length > 0) {
                const pickedSlots: { time: string; professional: string }[] = [];
                const profNames = [...new Set(daySlots.map((s) => s.professional))];
                for (const profName of profNames) {
                    const profSlots = daySlots.filter((s) => s.professional === profName);
                    for (const band of BANDS_3) {
                        const inBand = profSlots.filter((s) => s.minuteOfDay >= band.start && s.minuteOfDay < band.end);
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

        await logSandboxCall(supabase, ctx, {
            function_name: "api-availability-sandbox",
            label: `Consultou a agenda de "${sc.name}" (${availability.length} dia(s) com horário)${sufixoProf}`,
            request: body,
        });

        return new Response(JSON.stringify({
            service: sc.name,
            duration_minutes: duration,
            availability,
            ...campaignInfo,
            ...convenioInfo,
            ...professionalInfo,
            ...sandboxInfo,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (error) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de disponibilidade do ambiente de teste (api-availability-sandbox)", error, req);
    }
});
