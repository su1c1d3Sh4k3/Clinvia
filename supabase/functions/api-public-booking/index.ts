import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import { getWorkHoursForDay } from "../_shared/professional-schedule.ts";
import { isProfessionalDayBlocked } from "../_shared/day-blocks.ts";
import { TERMINAL_STAGES } from "../_shared/crm-stages.ts";
import { applyCampaignDiscount, type CampaignDiscountInfo } from "../_shared/campaign-discount.ts";
import { findActiveCardForChannel } from "../_shared/resolve-conversation.ts";
import { bufferedOverlapWindow, getSlotSettings, padBusyRange } from "../_shared/slot-settings.ts";
import { serviceDisplayName } from "../_shared/service-display-name.ts";
import { createServiceLabelResolver } from "../_shared/service-label.ts";
import {
    apiError,
    describeDbError,
    readJsonBody,
    unknownAction,
} from "../_shared/api-errors.ts";
import {
    CONVENIO_PROF_COLUMNS,
    convenioRanges,
    type ConvenioSelection,
    filterRoomsForConvenio,
    getConvenioCatalog,
    getConvenioRoomIds,
    insideConvenio,
    NO_CONVENIO,
    overlapsConvenio,
} from "../_shared/convenio-schedule.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_ACTIONS = [
    "verify_identity",
    "get_services", "get_prof_list", "get_slots",
    "create_booking", "get_pending", "cancel_booking", "reschedule_booking",
];

/**
 * Telefone digitado no portão do link ("55 (11) 9 8888-7777") → só dígitos.
 * A máscara da tela já garante o formato, mas a API é pública: quem chamar na
 * mão pode mandar qualquer coisa.
 */
function onlyDigits(v: unknown): string {
    return String(v ?? "").replace(/\D/g, "");
}

/**
 * Identidade de contato nesta casa = últimos 8 dígitos (o 9º dígito e o DDI
 * aparecem e somem conforme o aparelho/provedor). DDD diferente é pessoa
 * diferente, então o 8 não pode virar 9 nem 10.
 */
function last8(digits: string): string {
    return digits.slice(-8);
}

function pad(n: number): string { return String(n).padStart(2, "0"); }

/** "08:30" (ou 8.5 legado) → minutos desde a meia-noite. */
function parseT(t: any): number {
    if (!t) return 0;
    if (typeof t === "string" && t.includes(":")) { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); }
    return parseFloat(t) * 60 || 0;
}

/** Agenda da sala num dia: expediente, intervalo e faixas de convênio. */
type RoomDayWindow = {
    start: number;
    end: number;
    breakStart: number | null;
    breakEnd: number | null;
    convRanges: ReturnType<typeof convenioRanges>;
};

/** O atendimento cabe no expediente da sala? (não checa agenda ocupada) */
function windowAccepts(w: RoomDayWindow, m: number, duration: number, convenioRequested: boolean): boolean {
    if (m < w.start || m + duration > w.end) return false;
    if (w.breakStart !== null && w.breakEnd !== null && m < w.breakEnd && m + duration > w.breakStart) return false;
    if (convenioRequested) return insideConvenio(m, duration, w.convRanges);
    return !overlapsConvenio(m, duration, w.convRanges);
}

/**
 * Esta API é a única lida por um PACIENTE (src/pages/PublicBooking.tsx mostra
 * `error` em tela). Então `error`/`message` sempre trazem texto humano e o
 * motivo técnico (Postgres, etc.) vai só em `details`, para o suporte.
 */
function patientError(
    status: number,
    code: string,
    message: string,
    technicalDetail?: unknown,
): Response {
    return apiError(corsHeaders, {
        status,
        code,
        message,
        details: technicalDetail ? String(technicalDetail) : undefined,
    });
}

/** Falha de banco: o paciente lê a orientação, o suporte lê o motivo. */
function patientDbError(code: string, operation: string, error: unknown, advice: string): Response {
    console.error("[api-public-booking]", describeDbError(operation, error));
    return patientError(500, code, advice, (error as any)?.message ?? error);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const { action, user_id, service_id, professional_id, date, time, appointment_id, instance_id, convenio_id } = body!;
        // `contact_id` é reatribuído mais abaixo: contato de Instagram nunca
        // pode ser o dono de um agendamento (ver bloco "trava do Instagram").
        let contact_id = body!.contact_id;

        if (!user_id) {
            return patientError(400, "booking_link_invalid",
                "Este link de agendamento está incompleto (falta a identificação da clínica). Peça um link novo à clínica.");
        }
        if (!action) {
            return unknownAction(corsHeaders, action, VALID_ACTIONS);
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // ── Trava do Instagram ────────────────────────────────────────────────
        // O contato criado pelo instagram-webhook é preso ao IGSID e não tem
        // telefone; ele existe só para a conversa aparecer no inbox. Agendar
        // nele deixaria a agenda com um "paciente" que a clínica não consegue
        // ligar nem encontrar pelo número. Se o link (ou um chamador na mão)
        // mandar um contato de Instagram, redirecionamos para o contato de
        // WhatsApp já vinculado; sem vínculo, o fluxo tem que passar pelo
        // verify_identity antes.
        if (contact_id && action !== "verify_identity") {
            const { data: maybeIg, error: igErr } = await supabase
                .from("contacts")
                .select("id, instagram_id, linked_contact_id")
                .eq("id", contact_id).eq("user_id", user_id).maybeSingle();
            if (igErr) {
                return patientDbError("contact_read_failed", "conferir o cadastro do contato do link", igErr,
                    "Não conseguimos confirmar o seu cadastro agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }
            if (maybeIg?.instagram_id) {
                if (!maybeIg.linked_contact_id) {
                    return patientError(409, "instagram_identity_required",
                        "Antes de agendar pelo Instagram, precisamos do seu nome completo e do seu WhatsApp. Volte ao início do link e preencha os dados.");
                }
                contact_id = maybeIg.linked_contact_id;
            }
        }

        // O token do link (payload `d`) carrega a conexão: sem ela não dá pra saber
        // em qual funil do CRM o agendamento entra.
        if (action === "create_booking" && !instance_id) {
            return patientError(400, "booking_link_without_connection",
                "Este link de agendamento foi gerado sem a conexão de WhatsApp da clínica, então o agendamento não pode ser registrado. Peça um link novo à clínica.");
        }

        /** 400 dizendo qual campo de data/hora veio no formato errado. */
        const checkDateTime = (): Response | null => {
            if (date !== undefined && date !== null && !DATE_RE.test(String(date))) {
                return patientError(400, "invalid_date_format",
                    `A data informada ("${date}") não está no formato esperado. Use AAAA-MM-DD (ex.: 2026-08-30).`);
            }
            if (time !== undefined && time !== null && !TIME_RE.test(String(time))) {
                return patientError(400, "invalid_time_format",
                    `O horário informado ("${time}") não está no formato esperado. Use HH:MM em 24 horas (ex.: 14:30).`);
            }
            return null;
        };

        /**
         * Convênio escolhido na tela (Particular × Convênio). O paciente escolhe
         * da lista devolvida por get_services, então aqui só validamos o id.
         */
        const resolveConvenio = async (): Promise<
            { selection: ConvenioSelection; response: null } | { selection: null; response: Response }
        > => {
            if (!convenio_id) return { selection: NO_CONVENIO, response: null };
            const { data, error } = await supabase.from("convenios")
                .select("id, nome, descricao, is_catch_all")
                .eq("id", convenio_id).eq("user_id", user_id).eq("active", true).maybeSingle();
            if (error) {
                return {
                    selection: null,
                    response: patientDbError("convenio_read_failed", "buscar o convênio escolhido", error,
                        "Não conseguimos confirmar o convênio escolhido. Tente novamente em alguns instantes ou fale com a clínica."),
                };
            }
            if (!data) {
                return {
                    selection: null,
                    response: patientError(404, "convenio_not_found",
                        "O convênio escolhido não está mais disponível na clínica. Volte e escolha outra opção.",
                        `convenio_id=${convenio_id}`),
                };
            }
            return {
                selection: { requested: true, convenio: data, catchAll: !!data.is_catch_all },
                response: null,
            };
        };

        // Campanha ativa da instância do link onde o contato recebeu envio.
        const resolveActiveCampaign = async (): Promise<CampaignDiscountInfo | null> => {
            if (!instance_id || !contact_id) return null;
            try {
                const { data: camps, error: campErr } = await supabase.from("campaigns")
                    .select("id, discount_pct, services")
                    .eq("user_id", user_id)
                    .eq("instance_id", instance_id)
                    .in("status", ["dispatching", "dispatched"])
                    .gt("valid_until", new Date().toISOString())
                    .order("scheduled_at", { ascending: false });
                // desconto é bônus: se falhar, segue com o preço cheio — mas o motivo fica no log
                if (campErr) {
                    console.warn("[api-public-booking]", describeDbError("buscar as campanhas ativas da conexão para aplicar desconto", campErr));
                    return null;
                }
                for (const c of camps || []) {
                    const { data: cc, error: ccErr } = await supabase.from("campaign_contacts")
                        .select("id")
                        .eq("campaign_id", c.id)
                        .eq("contact_id", contact_id)
                        .eq("status", "sent")
                        .limit(1)
                        .maybeSingle();
                    if (ccErr) {
                        console.warn("[api-public-booking]", describeDbError(`verificar se o contato recebeu a campanha ${c.id}`, ccErr));
                        continue;
                    }
                    if (cc) return c as CampaignDiscountInfo;
                }
            } catch (err) {
                console.warn("[api-public-booking] resolveActiveCampaign error:", err);
            }
            return null;
        };

        const ROOM_SCHEDULE_COLUMNS =
            `id, name, work_hours, work_days, use_daily_schedule, work_hours_daily, ${CONVENIO_PROF_COLUMNS}`;

        /**
         * Salas aptas a realizar o serviço (services_client.professionals), já
         * cortadas pelo convênio escolhido. Em serviço pago o paciente NÃO escolhe
         * sala (regra do user): essa lista é a base dos horários e do encaixe.
         */
        const resolveCandidateRooms = async (
            serviceId: string,
            convenio: ConvenioSelection,
        ): Promise<{ rooms: any[]; response: null } | { rooms: null; response: Response }> => {
            const { data: svcRooms, error: svcRoomsErr } = await supabase.from("services_client")
                .select("professionals").eq("id", serviceId).eq("user_id", user_id).maybeSingle();
            if (svcRoomsErr) {
                return {
                    rooms: null,
                    response: patientDbError("service_rooms_read_failed", "buscar as salas que realizam o serviço", svcRoomsErr,
                        "Não conseguimos consultar os horários agora. Tente novamente em alguns instantes ou fale com a clínica."),
                };
            }
            const allowed: string[] = svcRooms?.professionals || [];
            if (allowed.length === 0) return { rooms: [], response: null };

            const { data: profs, error: profsErr } = await supabase.from("professionals")
                .select(ROOM_SCHEDULE_COLUMNS)
                .eq("user_id", user_id).eq("active", true).in("id", allowed);
            if (profsErr) {
                return {
                    rooms: null,
                    response: patientDbError("professionals_read_failed", "buscar as salas disponíveis para o serviço", profsErr,
                        "Não conseguimos consultar os horários agora. Tente novamente em alguns instantes ou fale com a clínica."),
                };
            }
            let rooms = profs || [];
            if (convenio.requested) {
                const roomIds = convenio.convenio
                    ? await getConvenioRoomIds(supabase, convenio.convenio.id)
                    : new Set<string>();
                rooms = filterRoomsForConvenio(rooms, roomIds);
            }
            return { rooms, response: null };
        };

        /** Agenda da sala no dia; `null` = fechada (cadeado, folga ou convênio inapto). */
        const roomDayWindow = async (
            prof: any,
            dateStr: string,
            convenio: ConvenioSelection,
        ): Promise<RoomDayWindow | null> => {
            if (await isProfessionalDayBlocked(supabase, prof.id, dateStr)) return null;

            const reqDate = new Date(dateStr + "T12:00:00");
            const workDays: number[] = prof.work_days || [1, 2, 3, 4, 5];
            if (!workDays.includes(reqDate.getDay())) return null;

            const wh = getWorkHoursForDay(prof, reqDate.getDay());
            const start = parseT(wh.start) || 8 * 60;
            const end = parseT(wh.end) || 20 * 60;
            const breakStart = wh.break_start ? parseT(wh.break_start) : null;
            const breakEnd = wh.break_end ? parseT(wh.break_end) : null;

            // Faixa dedicada a convênio: no modo particular ela some da grade;
            // no modo convênio ela é a única grade oferecida.
            const convRanges = convenioRanges(prof, reqDate.getDay(), { start, end, breakStart, breakEnd });
            if (convenio.requested) {
                const roomIds = convenio.convenio
                    ? await getConvenioRoomIds(supabase, convenio.convenio.id)
                    : new Set<string>();
                if (filterRoomsForConvenio([prof], roomIds).length === 0) return null;
                if (convRanges.length === 0) return null;
            }
            return { start, end, breakStart, breakEnd, convRanges };
        };

        /** Minutos ocupados da sala no dia, já alargados pela folga entre atendimentos. */
        const roomBusyRanges = async (
            professionalId: string,
            dateStr: string,
            bufferMinutes: number,
        ): Promise<{ busy: { start: number; end: number }[]; response: null } | { busy: null; response: Response }> => {
            const { data: apts, error: aptsErr } = await supabase.from("appointments")
                .select("start_time, end_time").eq("professional_id", professionalId).neq("status", "canceled")
                .gte("start_time", `${dateStr}T00:00:00`).lte("start_time", `${dateStr}T23:59:59`);
            if (aptsErr) {
                // sem a agenda ocupada, oferecer horários livres agendaria em cima de outro paciente
                return {
                    busy: null,
                    response: patientDbError("appointments_read_failed", "buscar os agendamentos já marcados do profissional nesta data", aptsErr,
                        "Não conseguimos consultar os horários agora. Tente novamente em alguns instantes ou fale com a clínica."),
                };
            }
            const busy = (apts || []).map((a: any) => {
                const s = new Date(a.start_time); const e = new Date(a.end_time);
                return padBusyRange(
                    { start: s.getHours() * 60 + s.getMinutes(), end: e.getHours() * 60 + e.getMinutes() },
                    bufferMinutes,
                );
            });
            return { busy, response: null };
        };

        // ── verify_identity: portão do link vindo do Instagram ──
        // O Instagram não entrega telefone. Aqui o paciente diz quem é, e o
        // contato do Instagram passa a apontar (linked_contact_id) para o
        // contato de WhatsApp — que é quem recebe o agendamento daqui em diante.
        if (action === "verify_identity") {
            const fullName = String(body!.full_name ?? "").trim().replace(/\s+/g, " ");
            const digits = onlyDigits(body!.phone);

            if (fullName.length < 3) {
                return patientError(400, "identity_name_required",
                    "Digite o seu nome completo para continuar.");
            }
            // 55 + DDD (2) + celular (8 ou 9) — a máscara da tela entrega 13.
            if (digits.length < 12 || digits.length > 13) {
                return patientError(400, "identity_phone_invalid",
                    "O WhatsApp informado está incompleto. Preencha no formato 55 (DDD) 9 0000-0000.");
            }

            // Contato de WhatsApp existente: identidade pelos últimos 8 dígitos.
            // Um contato de Instagram nunca pode ser o resultado desta busca —
            // ele não tem número, e cair nele reintroduziria o bug que esta
            // tela existe para resolver.
            const { data: matches, error: matchErr } = await supabase
                .from("contacts")
                .select("id, push_name, number, instagram_id")
                .eq("user_id", user_id)
                .is("instagram_id", null)
                .like("number", `%${last8(digits)}%`)
                .limit(20);
            if (matchErr) {
                return patientDbError("identity_lookup_failed", "procurar o seu cadastro pelo telefone", matchErr,
                    "Não conseguimos confirmar o seu WhatsApp agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }

            // `like %last8%` pode pegar número de outro DDD que termine igual —
            // DDD diferente é pessoa diferente, então confirmamos os 10 últimos
            // (DDD + 8) antes de adotar o cadastro.
            const tail10 = digits.slice(-10);
            let target = (matches || []).find((c: any) => onlyDigits(c.number).slice(-10) === tail10)
                ?? null;

            if (target) {
                // O nome digitado pelo paciente vence o push_name do WhatsApp:
                // `edited` impede que a próxima mensagem recebida o sobrescreva.
                const { error: renameErr } = await supabase.from("contacts")
                    .update({ push_name: fullName, edited: true })
                    .eq("id", target.id);
                if (renameErr) {
                    return patientDbError("identity_update_failed", "atualizar o seu nome no cadastro", renameErr,
                        "Não conseguimos salvar os seus dados agora. Tente novamente em alguns instantes ou fale com a clínica.");
                }
            } else {
                const { data: created, error: createErr } = await supabase.from("contacts")
                    .insert({
                        user_id,
                        number: digits,
                        push_name: fullName,
                        edited: true,
                        // Conexão que a clínica divulga no Instagram: é nela que
                        // a conversa vai acontecer se o paciente chamar no zap.
                        instance_id: instance_id ?? null,
                        channel: "whatsapp",
                    })
                    .select("id, push_name")
                    .single();
                if (createErr) {
                    return patientDbError("identity_create_failed", "criar o seu cadastro", createErr,
                        "Não conseguimos salvar os seus dados agora. Tente novamente em alguns instantes ou fale com a clínica.");
                }
                target = created;
            }

            // Revincula o contato do Instagram para o número recém-confirmado
            // (decisão do produto: a última verificação vence).
            if (body!.contact_id && body!.contact_id !== target.id) {
                const { error: linkErr } = await supabase.from("contacts")
                    .update({ linked_contact_id: target.id })
                    .eq("id", body!.contact_id)
                    .eq("user_id", user_id)
                    .not("instagram_id", "is", null);
                if (linkErr) {
                    // Vínculo é conveniência (unifica o histórico IG+WhatsApp);
                    // o agendamento já tem o contato certo, então não bloqueia.
                    console.warn("[api-public-booking]",
                        describeDbError("vincular o contato do Instagram ao contato de WhatsApp", linkErr));
                }
            }

            return new Response(JSON.stringify({
                success: true,
                contact_id: target.id,
                contact_name: fullName,
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── get_services: categories + service_names + applications ──
        // Exibe APENAS a categoria Avaliação + serviços comprados e ainda não agendados (sem preços)
        if (action === "get_services") {
            const { data: sc, error: scErr } = await supabase.from("services_client")
                .select("id, name, description, duration_minutes, category_id, service_name_id, professionals")
                .eq("user_id", user_id).eq("status", true);
            if (scErr) {
                return patientDbError("services_read_failed", "carregar os serviços da clínica", scErr,
                    "Não conseguimos carregar a lista de serviços agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }

            const allCatIds = [...new Set((sc || []).map((s: any) => s.category_id))];
            const { data: allCats, error: catErr } = await supabase.from("services_category")
                .select("id, name, category_type").in("id", allCatIds).order("name");
            if (catErr) {
                return patientDbError("service_categories_read_failed", "carregar as categorias de serviço", catErr,
                    "Não conseguimos carregar a lista de serviços agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }

            // Categoria(s) "Avaliação" — sempre visível(is)
            const normalize = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
            const avaliacaoCatIds = new Set((allCats || [])
                .filter((c: any) => normalize(c.name) === "avaliacao")
                .map((c: any) => c.id));

            // Compras pendentes do contato (venda sem agendamento vinculado)
            const purchasedServiceIds = new Set<string>();
            if (contact_id) {
                const { data: pendingSales, error: salesErr } = await supabase.from("sales")
                    .select("service_client_id")
                    .eq("contact_id", contact_id)
                    .is("appointment_id", null)
                    .not("service_client_id", "is", null);
                if (salesErr) {
                    return patientDbError("purchased_services_read_failed", "buscar os serviços já comprados pelo contato", salesErr,
                        "Não conseguimos verificar os serviços que você já comprou. Tente novamente em alguns instantes ou fale com a clínica.");
                }
                for (const s of pendingSales || []) purchasedServiceIds.add(s.service_client_id);
            }

            // Serviços da campanha ativa do link (se houver) também entram no catálogo
            const campaign = await resolveActiveCampaign();
            const campaignServiceIds = new Set<string>(
                (campaign?.services || []).map((s: any) => s?.id).filter(Boolean)
            );

            const visibleApps = (sc || []).filter((s: any) =>
                avaliacaoCatIds.has(s.category_id) || purchasedServiceIds.has(s.id) || campaignServiceIds.has(s.id));

            const catIds = [...new Set(visibleApps.map((s: any) => s.category_id))];
            const snIds = [...new Set(visibleApps.map((s: any) => s.service_name_id))];

            const cats = (allCats || []).filter((c: any) => catIds.includes(c.id));
            const { data: sns, error: snErr } = await supabase.from("service_name")
                .select("id, name, category_id").in("id", snIds).order("name");
            if (snErr) {
                return patientDbError("service_names_read_failed", "carregar os nomes dos serviços", snErr,
                    "Não conseguimos carregar a lista de serviços agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }

            // Convênios da conta + quais aplicações visíveis são aptas a cada um.
            // "Habilitar todos os convênios" vira uma única opção na tela.
            const { catchAll, list } = await getConvenioCatalog(supabase, user_id);
            const convenioOptions = catchAll
                ? [{ id: catchAll.id, nome: "Habilitado para todos os convênios", descricao: catchAll.descricao ?? null }]
                : list.map((c) => ({ id: c.id, nome: c.nome, descricao: c.descricao ?? null }));

            // Salas que atendem cada convênio — o paciente só vê profissional elegível.
            const convenioRooms = new Map<string, string[]>();
            if (convenioOptions.length > 0) {
                const { data: convProfs, error: convProfErr } = await supabase.from("professionals")
                    .select(`id, ${CONVENIO_PROF_COLUMNS}`)
                    .eq("user_id", user_id).eq("active", true);
                if (convProfErr) {
                    return patientDbError("convenio_rooms_read_failed", "buscar as salas que atendem convênio", convProfErr,
                        "Não conseguimos carregar a lista de serviços agora. Tente novamente em alguns instantes ou fale com a clínica.");
                }
                for (const opt of convenioOptions) {
                    const roomIds = await getConvenioRoomIds(supabase, opt.id);
                    convenioRooms.set(
                        opt.id,
                        filterRoomsForConvenio(convProfs || [], roomIds).map((p: any) => p.id),
                    );
                }
            }

            const aptoByService = new Map<string, string[]>();
            if (convenioOptions.length > 0 && visibleApps.length > 0) {
                const { data: aptos, error: aptosErr } = await supabase.from("convenio_servicos")
                    .select("convenio_id, service_client_id")
                    .in("convenio_id", convenioOptions.map((c) => c.id))
                    .in("service_client_id", visibleApps.map((s: any) => s.id));
                if (aptosErr) {
                    return patientDbError("convenio_services_read_failed", "buscar os serviços aptos a convênio", aptosErr,
                        "Não conseguimos carregar a lista de serviços agora. Tente novamente em alguns instantes ou fale com a clínica.");
                }
                for (const row of aptos || []) {
                    const arr = aptoByService.get(row.service_client_id) || [];
                    arr.push(row.convenio_id);
                    aptoByService.set(row.service_client_id, arr);
                }
            }

            // A tela do paciente lista as aplicações numa lista PLANA (sem o nível
            // do serviço), então o nome já sai composto: "Serviço - Aplicação"
            const snById = new Map((sns || []).map((s: any) => [s.id, s.name]));
            const catTypeById = new Map((allCats || []).map((c: any) => [c.id, c.category_type]));

            return new Response(JSON.stringify({
                categories: cats,
                service_names: sns || [],
                convenios: convenioOptions.map((c) => ({
                    ...c,
                    professional_ids: convenioRooms.get(c.id) || [],
                })),
                applications: visibleApps.map((s: any) => ({
                    id: s.id,
                    name: serviceDisplayName({
                        serviceName: snById.get(s.service_name_id),
                        applicationName: s.name,
                        categoryType: catTypeById.get(s.category_id),
                    }),
                    description: s.description, duration_minutes: s.duration_minutes,
                    category_id: s.category_id, service_name_id: s.service_name_id, professionals: s.professionals || [],
                    convenio_ids: aptoByService.get(s.id) || [],
                    // Só a Avaliação deixa o paciente escolher o profissional; serviço
                    // pago vai para a primeira sala livre (regra do user).
                    is_avaliacao: avaliacaoCatIds.has(s.category_id),
                })),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── get_prof_list: all professionals ──
        if (action === "get_prof_list") {
            const { data: profs, error: profErr } = await supabase.from("professionals")
                .select("id, name, responsavel:responsaveis(role, photo_url)")
                .eq("user_id", user_id)
                .eq("active", true);
            if (profErr) {
                return patientDbError("professionals_read_failed", "carregar os profissionais da clínica", profErr,
                    "Não conseguimos carregar a lista de profissionais agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }
            // Foto e cargo são do profissional dono da sala; sala avulsa aparece sem eles.
            // `has_responsavel` deixa a tela mostrar só as salas de profissionais na
            // escolha da Avaliação (regra do user).
            const profList = (profs || []).map((p: any) => ({
                id: p.id,
                name: p.name,
                photo_url: p.responsavel?.photo_url ?? null,
                role: p.responsavel?.role ?? null,
                has_responsavel: !!p.responsavel,
            }));
            return new Response(JSON.stringify({ professionals: profList }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── get_slots: horários livres numa data ──
        // Com `professional_id` = agenda daquela sala (fluxo da Avaliação).
        // Sem `professional_id` = união das salas aptas ao serviço (serviço pago,
        // onde o paciente não escolhe sala).
        if (action === "get_slots") {
            const missingSlots = [
                [service_id, "o serviço", "service_id"],
                [date, "a data", "date"],
            ].filter(([v]) => !v);
            if (missingSlots.length > 0) {
                return patientError(400, "missing_fields",
                    `Não dá para consultar os horários: falta escolher ${missingSlots.map(([, label]) => label).join(", ")}. Volte e complete a seleção.`,
                    `Campos ausentes: ${missingSlots.map(([, , field]) => field).join(", ")}`);
            }
            const badDateTime = checkDateTime();
            if (badDateTime) return badDateTime;

            // Get service duration
            const { data: svc, error: svcErr } = await supabase.from("services_client")
                .select("duration_minutes").eq("id", service_id).maybeSingle();
            if (svcErr) {
                return patientDbError("service_read_failed", "buscar a duração do serviço escolhido", svcErr,
                    "Não conseguimos consultar os horários agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }
            if (!svc) {
                return patientError(404, "service_not_found",
                    "O serviço escolhido não está mais disponível na clínica. Volte e escolha outro serviço.",
                    `service_id=${service_id}`);
            }
            const duration = svc.duration_minutes || 30;

            const { selection: slotConvenio, response: slotConvenioFail } = await resolveConvenio();
            if (slotConvenioFail) return slotConvenioFail;

            // Salas a considerar: a escolhida pelo paciente ou todas as aptas ao serviço
            let rooms: any[];
            if (professional_id) {
                const { data: prof, error: profErr } = await supabase.from("professionals")
                    .select(ROOM_SCHEDULE_COLUMNS)
                    .eq("id", professional_id).eq("active", true).maybeSingle();
                if (profErr) {
                    return patientDbError("professional_read_failed", "buscar os horários de trabalho do profissional", profErr,
                        "Não conseguimos consultar os horários agora. Tente novamente em alguns instantes ou fale com a clínica.");
                }
                if (!prof) {
                    return patientError(404, "professional_not_found",
                        "O profissional escolhido não está mais cadastrado na clínica. Volte e escolha outro profissional.",
                        `professional_id=${professional_id}`);
                }
                rooms = [prof];
            } else {
                const { rooms: candidates, response: roomsFail } = await resolveCandidateRooms(service_id, slotConvenio);
                if (roomsFail) return roomsFail;
                rooms = candidates;
            }

            // Passo da grade e folga entre atendimentos (IA > Configurações)
            const slotSettings = await getSlotSettings(supabase, user_id);

            // União dos horários: basta UMA sala estar livre para o horário aparecer.
            const merged = new Set<string>();
            for (const room of rooms) {
                const window = await roomDayWindow(room, date, slotConvenio);
                if (!window) continue;

                const { busy, response: busyFail } = await roomBusyRanges(room.id, date, slotSettings.bufferMinutes);
                if (busyFail) return busyFail;

                for (let m = window.start; m + duration <= window.end; m += slotSettings.stepMinutes) {
                    if (!windowAccepts(window, m, duration, slotConvenio.requested)) continue;
                    let conflict = false;
                    for (const b of busy!) { if (m < b.end && m + duration > b.start) { conflict = true; break; } }
                    if (!conflict) merged.add(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
                }
            }

            return new Response(JSON.stringify({ slots: [...merged].sort() }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── create_booking: create appointment ──
        if (action === "create_booking") {
            const missingBooking = [
                [contact_id, "o seu cadastro (link incompleto)", "contact_id"],
                [service_id, "o serviço", "service_id"],
                [date, "a data", "date"],
                [time, "o horário", "time"],
            ].filter(([v]) => !v);
            if (missingBooking.length > 0) {
                return patientError(400, "missing_fields",
                    `Não dá para concluir o agendamento: falta ${missingBooking.map(([, label]) => label).join(", ")}. Volte e complete a seleção.`,
                    `Campos ausentes: ${missingBooking.map(([, , field]) => field).join(", ")}`);
            }
            const badBookingDateTime = checkDateTime();
            if (badBookingDateTime) return badBookingDateTime;

            const { data: svc, error: svcErr } = await supabase.from("services_client")
                .select("name, price, duration_minutes, category_id, service_name_id").eq("id", service_id).maybeSingle();
            if (svcErr) {
                return patientDbError("service_read_failed", "buscar o serviço escolhido", svcErr,
                    "Não conseguimos concluir o agendamento agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }
            if (!svc) {
                return patientError(404, "service_not_found",
                    "O serviço escolhido não está mais disponível na clínica. Volte e escolha outro serviço.",
                    `service_id=${service_id}`);
            }

            const { selection: bookingConvenio, response: bookingConvenioFail } = await resolveConvenio();
            if (bookingConvenioFail) return bookingConvenioFail;

            if (bookingConvenio.requested && bookingConvenio.convenio) {
                const { data: apto, error: aptoErr } = await supabase.from("convenio_servicos")
                    .select("service_client_id")
                    .eq("convenio_id", bookingConvenio.convenio.id)
                    .eq("service_client_id", service_id).maybeSingle();
                if (aptoErr) {
                    return patientDbError("convenio_service_check_failed", "checar se o serviço é atendido pelo convênio", aptoErr,
                        "Não conseguimos confirmar se esse serviço é atendido pelo convênio. Tente novamente em alguns instantes ou fale com a clínica.");
                }
                if (!apto) {
                    return patientError(409, "service_not_convenio",
                        `O serviço "${svc.name}" não é atendido por convênio nesta clínica. Volte e escolha a opção Particular ou outro serviço.`);
                }
            }

            const duration = svc.duration_minutes || 30;
            const startISO = `${date}T${time}:00-03:00`;
            const startDate = new Date(startISO);
            const endDate = new Date(startDate.getTime() + duration * 60000);

            if (startDate < new Date()) {
                return patientError(400, "date_in_the_past",
                    `Não é possível agendar para ${date} às ${time} porque esse horário já passou. Escolha uma data e um horário futuros.`,
                    `Agora em Brasília: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
            }

            // A janela de conflito já inclui a folga entre atendimentos
            const { bufferMinutes } = await getSlotSettings(supabase, user_id);
            const window = bufferedOverlapWindow(startDate, endDate, bufferMinutes);

            /** `true` = livre, `false` = ocupada, `Response` = falha ao checar (nunca agendar às cegas). */
            const roomIsFree = async (roomId: string): Promise<boolean | Response> => {
                const { data: overlap, error: overlapErr } = await supabase.rpc("check_appointment_overlap", {
                    p_professional_id: roomId,
                    p_start_time: window.start,
                    p_end_time: window.end,
                    p_exclude_id: null,
                });
                if (overlapErr) {
                    return patientDbError("overlap_check_failed", "verificar se o horário escolhido está livre", overlapErr,
                        "Não conseguimos confirmar se esse horário está livre. Tente novamente em alguns instantes ou fale com a clínica.");
                }
                return !overlap;
            };

            let prof: any;
            if (professional_id) {
                // Avaliação: o paciente escolheu o profissional
                const { data: chosen, error: profErr } = await supabase.from("professionals")
                    .select(ROOM_SCHEDULE_COLUMNS)
                    .eq("id", professional_id).eq("active", true).maybeSingle();
                if (profErr) {
                    return patientDbError("professional_read_failed", "buscar o profissional escolhido", profErr,
                        "Não conseguimos concluir o agendamento agora. Tente novamente em alguns instantes ou fale com a clínica.");
                }
                if (!chosen) {
                    return patientError(404, "professional_not_found",
                        "O profissional escolhido não está mais cadastrado na clínica. Volte e escolha outro profissional.",
                        `professional_id=${professional_id}`);
                }
                if (bookingConvenio.requested && bookingConvenio.convenio) {
                    const roomIds = await getConvenioRoomIds(supabase, bookingConvenio.convenio.id);
                    if (filterRoomsForConvenio([chosen], roomIds).length === 0) {
                        return patientError(409, "professional_not_convenio",
                            `${chosen.name} não atende por convênio. Volte e escolha outro profissional ou a opção Particular.`);
                    }
                }
                if (await isProfessionalDayBlocked(supabase, professional_id, date)) {
                    return patientError(409, "agenda_closed",
                        `${chosen.name} não está atendendo no dia ${date}. Escolha outra data ou outro profissional.`);
                }
                const free = await roomIsFree(professional_id);
                if (free instanceof Response) return free;
                if (!free) {
                    return patientError(409, "slot_taken",
                        `O horário de ${time} do dia ${date} com ${chosen.name} acabou de ser ocupado. Escolha outro horário.`,
                        `Duração do serviço: ${duration} min; folga entre atendimentos: ${bufferMinutes} min`);
                }
                prof = chosen;
            } else {
                // Serviço pago: a sala não é escolha do paciente (regra do user) —
                // pegamos a primeira sala apta que esteja livre no horário escolhido.
                const { rooms: candidates, response: roomsFail } = await resolveCandidateRooms(service_id, bookingConvenio);
                if (roomsFail) return roomsFail;
                if (candidates!.length === 0) {
                    return patientError(409, "service_without_room",
                        `O serviço "${svc.name}" não tem nenhuma sala disponível para atendimento. Fale com a clínica para marcar.`,
                        `service_id=${service_id}`);
                }

                const startMinutes = parseT(time);
                for (const cand of candidates!) {
                    const dayWindow = await roomDayWindow(cand, date, bookingConvenio);
                    if (!dayWindow) continue;
                    if (!windowAccepts(dayWindow, startMinutes, duration, bookingConvenio.requested)) continue;
                    const free = await roomIsFree(cand.id);
                    if (free instanceof Response) return free;
                    if (free) { prof = cand; break; }
                }
                if (!prof) {
                    return patientError(409, "slot_taken",
                        `O horário de ${time} do dia ${date} acabou de ser ocupado. Escolha outro horário.`,
                        `Duração do serviço: ${duration} min; folga entre atendimentos: ${bufferMinutes} min`);
                }
            }
            const bookedProfessionalId = prof.id;

            const campaign = await resolveActiveCampaign();
            // Preço com desconto de campanha (se o serviço agendado estiver na campanha
            // ativa); a venda criada pelo trigger herda esse valor
            const finalPrice = applyCampaignDiscount(svc.price || 0, campaign, service_id);

            const { data: created, error: insertErr } = await supabase.from("appointments").insert({
                user_id,
                professional_id: bookedProfessionalId,
                contact_id,
                service_id,
                category_id: svc.category_id,
                service_name_id: svc.service_name_id,
                service_name: svc.name,
                professional_name: prof.name || "",
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                price: finalPrice,
                type: "appointment",
                campaign_id: campaign?.id ?? null,
                convenio_id: bookingConvenio.convenio?.id ?? null,
                instance_id,
                created_via: "public_link",
            }).select().single();

            if (insertErr) {
                return patientDbError("appointment_insert_failed", "gravar o agendamento", insertErr,
                    "Não conseguimos registrar o seu agendamento. Tente novamente em alguns instantes ou fale com a clínica para marcar por telefone.");
            }

            // Falha no funil NÃO invalida o agendamento (já está gravado): vira aviso.
            let crmWarning: string | null = null;
            const crmFail = (operation: string, err: unknown) => {
                crmWarning = describeDbError(operation, err);
                console.warn("[api-public-booking]", crmWarning);
            };

            // CRM sync: create/move card to Agendado + add service — funil da conexão do link
            try {
                const terminals = TERMINAL_STAGES;
                const activeCard = await findActiveCardForChannel(supabase, {
                    contactId: contact_id,
                    instanceId: instance_id,
                    instagramInstanceId: null,
                });

                if (activeCard) {
                    if (terminals.includes(activeCard.stage)) {
                        // Terminal → create new card
                        const { data: newCard, error: newCardErr } = await supabase.from("crm_client").insert({
                            user_id, contact_id, stage: "Agendado", instance_id,
                            stage_changed_at: new Date().toISOString(), value: 0,
                            professional_id: bookedProfessionalId, priority: "medium", is_active: true,
                        }).select().single();
                        if (newCardErr) crmFail("abrir uma negociação nova na etapa Agendado", newCardErr);
                        if (newCard) {
                            const { error: svcInsErr } = await supabase.from("crm_client_services").insert({
                                crm_client_id: newCard.id, service_client_id: service_id,
                                service_name: svc.name, quantity: 1, unit_price: finalPrice, min_price: 0,
                            });
                            if (svcInsErr) crmFail("vincular o serviço à negociação nova", svcInsErr);
                            const { error: valErr } = await supabase.from("crm_client").update({ value: finalPrice }).eq("id", newCard.id);
                            if (valErr) crmFail("atualizar o valor da negociação nova", valErr);
                        }
                    } else {
                        // Move to Agendado
                        if (activeCard.stage !== "Agendado") {
                            const { error: moveErr } = await supabase.from("crm_client").update({
                                stage: "Agendado", stage_changed_at: new Date().toISOString(),
                            }).eq("id", activeCard.id);
                            if (moveErr) crmFail("mover a negociação para a etapa Agendado", moveErr);
                        }
                        // Add service if not duplicate
                        const { data: existingSvc, error: existingSvcErr } = await supabase.from("crm_client_services")
                            .select("id").eq("crm_client_id", activeCard.id).eq("service_client_id", service_id).maybeSingle();
                        if (existingSvcErr) crmFail("verificar se o serviço já está na negociação", existingSvcErr);
                        if (!existingSvc) {
                            const { error: svcInsErr } = await supabase.from("crm_client_services").insert({
                                crm_client_id: activeCard.id, service_client_id: service_id,
                                service_name: svc.name, quantity: 1, unit_price: finalPrice, min_price: 0,
                            });
                            if (svcInsErr) crmFail("vincular o serviço à negociação", svcInsErr);
                            const { data: allSvcs, error: allSvcsErr } = await supabase.from("crm_client_services")
                                .select("unit_price, quantity").eq("crm_client_id", activeCard.id);
                            if (allSvcsErr) crmFail("somar os serviços da negociação", allSvcsErr);
                            const total = (allSvcs || []).reduce((s: number, r: any) => s + r.unit_price * r.quantity, 0);
                            const { error: valErr } = await supabase.from("crm_client").update({ value: total }).eq("id", activeCard.id);
                            if (valErr) crmFail("atualizar o valor da negociação", valErr);
                        }
                    }
                } else {
                    // No card → create
                    const { data: newCard, error: newCardErr } = await supabase.from("crm_client").insert({
                        user_id, contact_id, stage: "Agendado", instance_id,
                        stage_changed_at: new Date().toISOString(), value: finalPrice,
                        professional_id: bookedProfessionalId, priority: "medium", is_active: true,
                    }).select().single();
                    if (newCardErr) crmFail("abrir a negociação na etapa Agendado", newCardErr);
                    if (newCard) {
                        const { error: svcInsErr } = await supabase.from("crm_client_services").insert({
                            crm_client_id: newCard.id, service_client_id: service_id,
                            service_name: svc.name, quantity: 1, unit_price: finalPrice, min_price: 0,
                        });
                        if (svcInsErr) crmFail("vincular o serviço à negociação", svcInsErr);
                    }
                }
            } catch (crmErr) {
                crmFail("sincronizar o funil com o agendamento criado", crmErr);
            }

            return new Response(JSON.stringify({
                success: true,
                appointment_id: created.id,
                // presente só quando o agendamento foi criado mas o funil não acompanhou
                ...(crmWarning ? { crm_warning: crmWarning } : {}),
            }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── get_pending: pending/confirmed appointments for this contact ──
        if (action === "get_pending") {
            if (!contact_id) {
                return patientError(400, "booking_link_invalid",
                    "Este link de agendamento está incompleto (falta a identificação do paciente). Peça um link novo à clínica.");
            }

            const { data: apts, error: aptsErr } = await supabase.from("appointments")
                .select("id, service_name, professional_name, start_time, end_time, status, service_id, professional_id, convenio_id")
                .eq("contact_id", contact_id).eq("type", "appointment")
                .in("status", ["pending", "confirmed", "rescheduled"])
                .gte("start_time", new Date().toISOString())
                .order("start_time", { ascending: true });
            if (aptsErr) {
                return patientDbError("appointments_read_failed", "buscar os agendamentos do paciente", aptsErr,
                    "Não conseguimos carregar os seus agendamentos agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }

            const label = await createServiceLabelResolver(supabase, (apts || []).map((a: any) => a.service_id));

            return new Response(JSON.stringify({
                appointments: (apts || []).map((a: any) => ({
                    ...a,
                    service_name: label(a.service_id, a.service_name),
                })),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── cancel_booking ──
        if (action === "cancel_booking") {
            if (!appointment_id) {
                return patientError(400, "missing_fields",
                    "Não dá para cancelar: o agendamento não foi identificado. Volte, escolha o agendamento na lista e tente de novo.",
                    "Campo ausente: appointment_id");
            }

            const { data: toCancel, error: findErr } = await supabase.from("appointments")
                .select("id, user_id, status").eq("id", appointment_id).maybeSingle();
            if (findErr) {
                return patientDbError("appointment_read_failed", "buscar o agendamento a cancelar", findErr,
                    "Não conseguimos localizar esse agendamento agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }
            if (!toCancel) {
                return patientError(404, "appointment_not_found",
                    "Esse agendamento não existe mais — ele pode já ter sido cancelado ou removido pela clínica.",
                    `appointment_id=${appointment_id}`);
            }
            if (toCancel.user_id !== user_id) {
                return patientError(403, "appointment_wrong_tenant",
                    "Esse agendamento não pertence à clínica deste link. Peça um link novo à clínica.",
                    `appointment_id=${appointment_id}`);
            }
            if (toCancel.status === "canceled") {
                return new Response(JSON.stringify({ success: true, status: "canceled", already_canceled: true }),
                    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            const { data: updated, error: upErr } = await supabase.from("appointments")
                .update({ status: "canceled" }).eq("id", appointment_id).select().single();
            if (upErr) {
                return patientDbError("appointment_cancel_failed", "cancelar o agendamento", upErr,
                    "Não conseguimos cancelar o seu agendamento. Tente novamente em alguns instantes ou fale com a clínica.");
            }

            // Falha no funil NÃO invalida o cancelamento (já foi gravado): vira aviso.
            let cancelCrmWarning: string | null = null;
            const cancelCrmFail = (operation: string, err: unknown) => {
                cancelCrmWarning = describeDbError(operation, err);
                console.warn("[api-public-booking]", cancelCrmWarning);
            };

            // CRM: create Perdido card + remove service from active card
            if (updated.contact_id && updated.service_id) {
                try {
                    const { error: lostErr } = await supabase.from("crm_client").insert({
                        user_id, contact_id: updated.contact_id, stage: "Perdido",
                        instance_id: updated.instance_id ?? null,
                        stage_changed_at: new Date().toISOString(), value: updated.price || 0,
                        loss_reason: "canceled", loss_reason_other: "Cliente cancelou o agendamento via link",
                        is_active: false,
                    });
                    if (lostErr) cancelCrmFail("registrar a negociação perdida do cancelamento", lostErr);

                    const activeCard = await findActiveCardForChannel(supabase, {
                        contactId: updated.contact_id,
                        instanceId: updated.instance_id ?? null,
                        instagramInstanceId: null,
                    });
                    if (activeCard) {
                        const { error: delErr } = await supabase.from("crm_client_services").delete()
                            .eq("crm_client_id", activeCard.id).eq("service_client_id", updated.service_id);
                        if (delErr) cancelCrmFail("remover o serviço cancelado da negociação", delErr);

                        const { data: remaining, error: remErr } = await supabase.from("crm_client_services")
                            .select("unit_price, quantity").eq("crm_client_id", activeCard.id);
                        if (remErr) cancelCrmFail("somar os serviços restantes da negociação", remErr);

                        if (remaining && remaining.length > 0) {
                            const total = remaining.reduce((s: number, r: any) => s + r.unit_price * r.quantity, 0);
                            const { error: valErr } = await supabase.from("crm_client").update({ value: total }).eq("id", activeCard.id);
                            if (valErr) cancelCrmFail("atualizar o valor da negociação", valErr);
                        } else {
                            const { error: offErr } = await supabase.from("crm_client").update({ is_active: false }).eq("id", activeCard.id);
                            if (offErr) cancelCrmFail("encerrar a negociação que ficou sem serviços", offErr);
                        }
                    }
                } catch (crmErr) {
                    cancelCrmFail("sincronizar o funil com o cancelamento", crmErr);
                }
            }

            return new Response(JSON.stringify({
                success: true,
                status: "canceled",
                ...(cancelCrmWarning ? { crm_warning: cancelCrmWarning } : {}),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── reschedule_booking ──
        if (action === "reschedule_booking") {
            const missingResched = [
                [appointment_id, "o agendamento", "appointment_id"],
                [date, "a nova data", "date"],
                [time, "o novo horário", "time"],
            ].filter(([v]) => !v);
            if (missingResched.length > 0) {
                return patientError(400, "missing_fields",
                    `Não dá para reagendar: falta ${missingResched.map(([, label]) => label).join(", ")}. Volte e complete a seleção.`,
                    `Campos ausentes: ${missingResched.map(([, , field]) => field).join(", ")}`);
            }
            const badReschedDateTime = checkDateTime();
            if (badReschedDateTime) return badReschedDateTime;

            const { data: existing, error: existingErr } = await supabase.from("appointments")
                .select("start_time, end_time, professional_id, professional_name, user_id, status")
                .eq("id", appointment_id).maybeSingle();
            if (existingErr) {
                return patientDbError("appointment_read_failed", "buscar o agendamento a reagendar", existingErr,
                    "Não conseguimos localizar esse agendamento agora. Tente novamente em alguns instantes ou fale com a clínica.");
            }
            if (!existing) {
                return patientError(404, "appointment_not_found",
                    "Esse agendamento não existe mais — ele pode já ter sido cancelado ou removido pela clínica.",
                    `appointment_id=${appointment_id}`);
            }
            if (existing.user_id !== user_id) {
                return patientError(403, "appointment_wrong_tenant",
                    "Esse agendamento não pertence à clínica deste link. Peça um link novo à clínica.",
                    `appointment_id=${appointment_id}`);
            }
            if (existing.status === "canceled") {
                return patientError(409, "appointment_canceled",
                    "Esse agendamento está cancelado e não pode ser reagendado. Faça um agendamento novo.",
                    `appointment_id=${appointment_id}`);
            }

            const durationMs = new Date(existing.end_time).getTime() - new Date(existing.start_time).getTime();
            const startISO = `${date}T${time}:00-03:00`;
            const startDate = new Date(startISO);
            const endDate = new Date(startDate.getTime() + durationMs);

            if (startDate < new Date()) {
                return patientError(400, "date_in_the_past",
                    `Não é possível reagendar para ${date} às ${time} porque esse horário já passou. Escolha uma data e um horário futuros.`,
                    `Agora em Brasília: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
            }

            // Agenda fechada nesse dia (cadeado da agenda)
            if (await isProfessionalDayBlocked(supabase, existing.professional_id, date)) {
                return patientError(409, "agenda_closed",
                    `${existing.professional_name || "O profissional"} não está atendendo no dia ${date}. Escolha outra data.`);
            }

            // A janela inclui a folga entre atendimentos configurada na conta
            const reschedWindow = bufferedOverlapWindow(
                startDate, endDate, (await getSlotSettings(supabase, user_id)).bufferMinutes);
            const { data: overlap, error: overlapErr } = await supabase.rpc("check_appointment_overlap", {
                p_professional_id: existing.professional_id,
                p_start_time: reschedWindow.start,
                p_end_time: reschedWindow.end,
                p_exclude_id: appointment_id,
            });
            if (overlapErr) {
                return patientDbError("overlap_check_failed", "verificar se o novo horário está livre", overlapErr,
                    "Não conseguimos confirmar se esse horário está livre. Tente novamente em alguns instantes ou fale com a clínica.");
            }
            if (overlap) {
                return patientError(409, "slot_taken",
                    `O horário de ${time} do dia ${date} com ${existing.professional_name || "esse profissional"} já está ocupado. Escolha outro horário.`);
            }

            const { data: rescheduled, error: upErr } = await supabase.from("appointments").update({
                start_time: startDate.toISOString(),
                end_time: endDate.toISOString(),
                status: "rescheduled",
            }).eq("id", appointment_id).select().single();
            if (upErr) {
                return patientDbError("appointment_update_failed", "gravar o novo horário do agendamento", upErr,
                    "Não conseguimos reagendar o seu horário. Tente novamente em alguns instantes ou fale com a clínica.");
            }

            // Falha no funil NÃO invalida o reagendamento (já foi gravado): vira aviso.
            let reschedCrmWarning: string | null = null;
            const reschedCrmFail = (operation: string, err: unknown) => {
                reschedCrmWarning = describeDbError(operation, err);
                console.warn("[api-public-booking]", reschedCrmWarning);
            };

            // CRM: move card to Agendado
            if (rescheduled.contact_id) {
                try {
                    const activeCard = await findActiveCardForChannel(supabase, {
                        contactId: rescheduled.contact_id,
                        instanceId: rescheduled.instance_id ?? null,
                        instagramInstanceId: null,
                    });
                    if (activeCard && activeCard.stage !== "Agendado") {
                        const { error: moveErr } = await supabase.from("crm_client").update({
                            stage: "Agendado", stage_changed_at: new Date().toISOString(),
                        }).eq("id", activeCard.id);
                        if (moveErr) reschedCrmFail("mover a negociação para a etapa Agendado", moveErr);
                    }
                } catch (crmErr) {
                    reschedCrmFail("sincronizar o funil com o reagendamento", crmErr);
                }
            }

            return new Response(JSON.stringify({
                success: true,
                status: "rescheduled",
                ...(reschedCrmWarning ? { crm_warning: reschedCrmWarning } : {}),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return unknownAction(corsHeaders, action, VALID_ACTIONS);

    } catch (error) {
        // Paciente não pode ler texto do Postgres: mensagem humana em `error`,
        // motivo técnico só em `details` (e no log da função).
        console.error("[api-public-booking] erro inesperado:", error);
        return patientError(
            500,
            "unexpected_error",
            "Tivemos um problema para processar o seu agendamento. Tente novamente em alguns instantes — se continuar, fale com a clínica.",
            (error as Error)?.message ?? error,
        );
    }
});
