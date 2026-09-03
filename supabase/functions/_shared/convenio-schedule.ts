/**
 * Convênios: janela dedicada na sala + resolução do convênio pedido pela API.
 *
 * Fonte única para api-availability, api-scheduling, api-public-booking e
 * slot-engine. Editar este arquivo obriga redeploy de TODAS elas (o bundler do
 * Deno inclui `_shared` transitivamente).
 *
 * Regra dos dois modos:
 *   convenio="nao" (default) → tudo como antes, MENOS os slots que encostam na
 *                              janela dedicada de salas com convenio_enabled.
 *   convenio="sim"           → só salas habilitadas (e ligadas ao convênio
 *                              escolhido) e só slots contidos na janela.
 *
 * A janela vive SEMPRE dentro do expediente da sala: fora dele, ou em cima do
 * intervalo, ela simplesmente não existe (nunca apaga a agenda inteira).
 */

import { ApiError, describeDbError } from "./api-errors.ts";

/** Colunas de `professionals` que qualquer consulta de horário precisa trazer. */
export const CONVENIO_PROF_COLUMNS =
    "convenio_enabled, convenio_all, convenio_days, convenio_hours, convenio_use_daily, convenio_hours_daily";

export interface ConvenioHours {
    start?: string | number | null;
    end?: string | number | null;
}

export interface ConvenioScheduleFields {
    convenio_enabled?: boolean | null;
    convenio_all?: boolean | null;
    convenio_days?: number[] | null;
    convenio_hours?: ConvenioHours | null;
    convenio_use_daily?: boolean | null;
    convenio_hours_daily?: Record<string, ConvenioHours> | null;
}

export interface MinuteRange { start: number; end: number; }

export interface WorkWindow {
    start: number;
    end: number;
    breakStart: number | null;
    breakEnd: number | null;
}

/** "14:30" | 14.5 | null → minutos do dia. Mesma leitura de parseWorkTime das APIs. */
export function parseTimeToMinutes(t: any): number | null {
    if (t == null) return null;
    if (typeof t === "string") {
        const s = t.trim();
        if (!s) return null;
        if (s.includes(":")) {
            const [h, m] = s.split(":").map(Number);
            if (isNaN(h)) return null;
            return h * 60 + (m || 0);
        }
    }
    const num = parseFloat(String(t));
    return isNaN(num) ? null : num * 60;
}

/**
 * Horário dedicado da sala no dia da semana (0=Dom..6=Sáb).
 * Espelha getWorkHoursForDay: com convenio_use_daily usa convenio_hours_daily.
 */
export function getConvenioHoursForDay(
    prof: ConvenioScheduleFields,
    weekday: number,
): ConvenioHours | null {
    if (!prof?.convenio_enabled) return null;
    const days = prof.convenio_days || [];
    if (!days.includes(weekday)) return null;
    if (prof.convenio_use_daily && prof.convenio_hours_daily) {
        const daily = prof.convenio_hours_daily[String(weekday)];
        if (daily) return daily;
        return null;
    }
    return prof.convenio_hours || null;
}

/**
 * Faixas realmente dedicadas no dia: a janela cortada pelo expediente e pelo
 * intervalo. Pode devolver duas faixas quando o intervalo parte a janela ao
 * meio, ou nenhuma quando a configuração não sobra tempo útil.
 */
export function convenioRanges(
    prof: ConvenioScheduleFields,
    weekday: number,
    work: WorkWindow,
): MinuteRange[] {
    const hours = getConvenioHoursForDay(prof, weekday);
    if (!hours) return [];

    const rawStart = parseTimeToMinutes(hours.start);
    const rawEnd = parseTimeToMinutes(hours.end);
    if (rawStart === null || rawEnd === null || rawEnd <= rawStart) return [];

    const start = Math.max(rawStart, work.start);
    const end = Math.min(rawEnd, work.end);
    if (end <= start) return [];

    if (work.breakStart === null || work.breakEnd === null || work.breakEnd <= work.breakStart) {
        return [{ start, end }];
    }

    const ranges: MinuteRange[] = [];
    if (work.breakStart > start) ranges.push({ start, end: Math.min(end, work.breakStart) });
    if (work.breakEnd < end) ranges.push({ start: Math.max(start, work.breakEnd), end });
    return ranges.filter((r) => r.end > r.start);
}

/** O slot [m, m+duration) encosta em alguma faixa dedicada? (modo convenio="nao") */
export function overlapsConvenio(m: number, duration: number, ranges: MinuteRange[]): boolean {
    for (const r of ranges) {
        if (m < r.end && m + duration > r.start) return true;
    }
    return false;
}

/** O slot cabe inteiro dentro de alguma faixa dedicada? (modo convenio="sim") */
export function insideConvenio(m: number, duration: number, ranges: MinuteRange[]): boolean {
    for (const r of ranges) {
        if (m >= r.start && m + duration <= r.end) return true;
    }
    return false;
}

/** Texto legível das faixas, para mensagens de erro/aviso. */
export function describeRanges(ranges: MinuteRange[]): string {
    const fmt = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
    return ranges.map((r) => `${fmt(r.start)}–${fmt(r.end)}`).join(", ");
}

// ────────────────────────────────────────────────────────────────
// Resolução do convênio pedido na chamada
// ────────────────────────────────────────────────────────────────

export interface ConvenioRow {
    id: string;
    nome: string;
    descricao?: string | null;
    is_catch_all?: boolean | null;
}

export interface ConvenioSelection {
    /** true quando o chamador mandou convenio="sim" */
    requested: boolean;
    /** convênio escolhido (só existe quando requested) */
    convenio: ConvenioRow | null;
    /** true quando a conta está em "Habilitar todos os convênios" */
    catchAll: boolean;
}

export const NO_CONVENIO: ConvenioSelection = { requested: false, convenio: null, catchAll: false };

/**
 * Lê o campo `convenio` do corpo. Ausente/qualquer coisa fora da lista = "nao".
 * Regra do user: com "nao", `convenio_nome` é IGNORADO (a IA preenche por engano).
 */
export function wantsConvenio(raw: any): boolean {
    if (raw === true) return true;
    if (typeof raw === "number") return raw === 1;
    if (typeof raw !== "string") return false;
    const v = raw.trim().toLowerCase();
    return v === "sim" || v === "s" || v === "true" || v === "yes" || v === "1";
}

function normalize(s: string): string {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

async function listConvenios(supabase: any, userId: string): Promise<ConvenioRow[]> {
    const { data, error } = await supabase
        .from("convenios")
        .select("id, nome, descricao, is_catch_all")
        .eq("user_id", userId)
        .eq("active", true)
        .order("nome");
    if (error) {
        throw new ApiError({
            status: 500,
            code: "convenios_read_failed",
            message: describeDbError("listar os convênios cadastrados nesta conta", error),
            details: String((error as any)?.message ?? error),
        });
    }
    return (data || []) as ConvenioRow[];
}

/** Só o convênio "todos" da conta, quando existir. Usado pelo payload da IA. */
export async function getConvenioCatalog(
    supabase: any,
    userId: string,
): Promise<{ catchAll: ConvenioRow | null; list: ConvenioRow[] }> {
    const rows = await listConvenios(supabase, userId);
    const catchAll = rows.find((r) => r.is_catch_all) || null;
    return { catchAll, list: rows.filter((r) => !r.is_catch_all) };
}

/**
 * Resolve o convênio da chamada.
 * - convenio ausente/"nao" → NO_CONVENIO (nada é consultado no banco).
 * - conta em "todos os convênios" → adota a linha catch-all e ignora o nome.
 * - nome informado → busca sem acento/caixa; erro listando as opções se não achar.
 * - nome ausente com um único convênio → adota; com vários → erro pedindo o nome.
 */
export async function resolveConvenioSelection(
    supabase: any,
    userId: string,
    body: Record<string, any>,
): Promise<ConvenioSelection> {
    if (!wantsConvenio(body?.convenio)) return NO_CONVENIO;

    const { catchAll, list } = await getConvenioCatalog(supabase, userId);

    if (catchAll) {
        return { requested: true, convenio: catchAll, catchAll: true };
    }

    if (list.length === 0) {
        throw new ApiError({
            status: 409,
            code: "convenio_not_configured",
            message: "Esta conta não tem nenhum convênio cadastrado, então não existe agenda de convênio para consultar. Cadastre os convênios em Equipe > Convênios ou repita a consulta com convenio=\"nao\".",
        });
    }

    const nomes = list.map((c) => c.nome).join(", ");
    const raw = body?.convenio_nome;
    const nome = typeof raw === "string" ? raw.trim() : "";

    if (!nome) {
        if (list.length === 1) return { requested: true, convenio: list[0], catchAll: false };
        throw new ApiError({
            status: 400,
            code: "convenio_name_required",
            message: `Esta conta atende mais de um convênio, então é preciso informar convenio_nome. Convênios disponíveis: ${nomes}.`,
        });
    }

    const target = normalize(nome);
    const found = list.find((c) => normalize(c.nome) === target);
    if (!found) {
        throw new ApiError({
            status: 404,
            code: "convenio_not_found",
            message: `Convênio "${nome}" não encontrado nesta conta. Convênios disponíveis: ${nomes}.`,
        });
    }
    return { requested: true, convenio: found, catchAll: false };
}

/**
 * Reconstrói a seleção a partir de um agendamento já gravado.
 * Usado no reagendamento: um agendamento de convênio continua sendo de convênio.
 */
export async function selectionFromConvenioId(
    supabase: any,
    convenioId: string | null | undefined,
): Promise<ConvenioSelection> {
    if (!convenioId) return NO_CONVENIO;
    const { data, error } = await supabase
        .from("convenios")
        .select("id, nome, descricao, is_catch_all")
        .eq("id", convenioId)
        .maybeSingle();
    if (error) {
        throw new ApiError({
            status: 500,
            code: "convenio_read_failed",
            message: describeDbError("buscar o convênio deste agendamento", error),
            details: String((error as any)?.message ?? error),
        });
    }
    if (!data) return NO_CONVENIO;
    return { requested: true, convenio: data as ConvenioRow, catchAll: !!data.is_catch_all };
}

/**
 * Garante que a aplicação escolhida é apta ao convênio (regra D7 do plano).
 * Sem isso a API ofereceria horário de convênio para um serviço particular.
 */
export async function assertServiceAptoConvenio(
    supabase: any,
    selection: ConvenioSelection,
    serviceClientId: string,
    serviceName: string,
): Promise<void> {
    if (!selection.requested || !selection.convenio) return;

    const { data, error } = await supabase
        .from("convenio_servicos")
        .select("service_client_id")
        .eq("convenio_id", selection.convenio.id)
        .eq("service_client_id", serviceClientId)
        .maybeSingle();

    if (error) {
        throw new ApiError({
            status: 500,
            code: "convenio_service_check_failed",
            message: describeDbError(
                `checar se a aplicação "${serviceName}" está liberada para o convênio ${selection.convenio.nome}`, error),
            details: String((error as any)?.message ?? error),
        });
    }

    if (!data) {
        throw new ApiError({
            status: 409,
            code: "service_not_convenio",
            message: `A aplicação "${serviceName}" não está marcada como apta para ${selection.catchAll ? "convênio" : `o convênio ${selection.convenio.nome}`}. Ofereça-a como particular (convenio="nao") ou marque a aplicação em Equipe > Convênios.`,
        });
    }
}

/** Ids das salas ligadas ao convênio (usado quando a sala não é convenio_all). */
export async function getConvenioRoomIds(supabase: any, convenioId: string): Promise<Set<string>> {
    const { data, error } = await supabase
        .from("convenio_salas")
        .select("professional_id")
        .eq("convenio_id", convenioId);
    if (error) {
        throw new ApiError({
            status: 500,
            code: "convenio_rooms_read_failed",
            message: describeDbError("listar as salas habilitadas para este convênio", error),
            details: String((error as any)?.message ?? error),
        });
    }
    return new Set((data || []).map((r: any) => String(r.professional_id)));
}

/**
 * Filtra as salas que podem atender o convênio escolhido.
 * `convenio_all=true` na sala dispensa o vínculo explícito.
 */
export function filterRoomsForConvenio<T extends ConvenioScheduleFields & { id: string }>(
    professionals: T[],
    roomIds: Set<string>,
): T[] {
    return professionals.filter((p) =>
        !!p.convenio_enabled && (p.convenio_all !== false || roomIds.has(String(p.id))));
}
