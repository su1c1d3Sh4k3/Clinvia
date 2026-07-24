import { supabase } from "@/integrations/supabase/client";
import { FieldDef } from "@/lib/importMapper";
import { normalizePhone, normalizeName, normalizePrice, ValidatedRow, ValidationStatus } from "@/lib/importTransformers";

// ─── Campos da planilha de agendamentos ──────────────────────────────────────

export const APPOINTMENT_FIELDS: FieldDef[] = [
    { key: "name", label: "Nome", required: true, synonyms: ["nome", "name", "paciente", "cliente", "nome_completo", "nome_paciente", "full_name"] },
    { key: "phone", label: "Telefone", required: true, synonyms: ["whatsapp", "celular", "telefone", "phone", "tel", "mobile", "numero", "fone", "whats", "cel"] },
    { key: "date", label: "Data", required: true, synonyms: ["data", "date", "dia", "data_agendamento", "data_consulta", "data_hora", "datahora"] },
    { key: "time", label: "Hora", synonyms: ["hora", "horario", "time", "hora_inicio", "horario_consulta", "hora_agendamento"] },
    { key: "professional", label: "Profissional", required: true, synonyms: ["profissional", "professional", "medico", "doutor", "doutora", "dentista", "atendente", "especialista", "dr", "dra"] },
    { key: "service", label: "Serviço", required: true, synonyms: ["servico", "service", "procedimento", "procedure", "tratamento", "aplicacao", "consulta_tipo"] },
    { key: "status", label: "Status", synonyms: ["status", "situacao", "estado", "condicao"] },
    { key: "price", label: "Valor (R$)", synonyms: ["valor", "preco", "price", "value", "custo", "valor_consulta"] },
    { key: "notes", label: "Observações", synonyms: ["observacoes", "obs", "observacao", "notas", "descricao", "comentario", "detalhes"] },
];

// ─── Normalização ────────────────────────────────────────────────────────────

const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Chave normalizada para casar valores da planilha com entidades cadastradas */
export const entityKey = (s: string) => stripAccents((s || "").trim().toLowerCase()).replace(/\s+/g, " ");

const STATUS_SYNONYMS: Record<string, string> = {
    finalizado: "completed", finalizada: "completed", concluido: "completed", concluida: "completed",
    realizado: "completed", realizada: "completed", atendido: "completed", atendida: "completed",
    completo: "completed", completed: "completed", feito: "completed", compareceu: "completed",
    pendente: "pending", pending: "pending", agendado: "pending", agendada: "pending", marcado: "pending", marcada: "pending",
    confirmado: "confirmed", confirmada: "confirmed", confirmed: "confirmed",
    cancelado: "canceled", cancelada: "canceled", canceled: "canceled", cancelled: "canceled", desmarcado: "canceled", desmarcada: "canceled",
    faltou: "no-show", falta: "no-show", "nao compareceu": "no-show", "no-show": "no-show", noshow: "no-show", "no show": "no-show", ausente: "no-show",
    remarcado: "rescheduled", remarcada: "rescheduled", reagendado: "rescheduled", reagendada: "rescheduled", rescheduled: "rescheduled",
    aguardando: "waiting", espera: "waiting", "em espera": "waiting", waiting: "waiting",
};

export const STATUS_LABELS: Record<string, string> = {
    completed: "Finalizado",
    pending: "Pendente",
    confirmed: "Confirmado",
    canceled: "Cancelado",
    "no-show": "Faltou",
    rescheduled: "Remarcado",
    waiting: "Em espera",
};

// ─── Data/Hora ───────────────────────────────────────────────────────────────

function parseTimeStr(s: string): { h: number; min: number } | null {
    const t = (s || "").trim();
    if (!t) return null;
    // Fração de dia do Excel (ex: 0,5 = 12:00)
    if (/^0?[.,]\d+$/.test(t)) {
        const frac = parseFloat(t.replace(",", "."));
        const tot = Math.round(frac * 1440);
        return { h: Math.floor(tot / 60) % 24, min: tot % 60 };
    }
    const m = t.match(/(\d{1,2})[:h.](\d{2})/i) || t.match(/^(\d{1,2})\s*h?$/i);
    if (!m) return null;
    const h = parseInt(m[1]);
    const min = m[2] ? parseInt(m[2]) : 0;
    if (h > 23 || min > 59) return null;
    return { h, min };
}

/**
 * Aceita Data + Hora em colunas separadas ou combinadas na coluna Data.
 * Formatos: dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd, serial do Excel; hora hh:mm, 14h30, fração Excel.
 */
export function parseDateTime(dateRaw: string, timeRaw: string): { date: Date | null; hasTime: boolean } {
    const dr = (dateRaw || "").trim();
    let base: { y: number; m: number; d: number } | null = null;
    let time: { h: number; min: number } | null = null;

    // Serial de data do Excel (dias desde 1899-12-30)
    if (/^\d+([.,]\d+)?$/.test(dr)) {
        const serial = parseFloat(dr.replace(",", "."));
        if (serial > 20000 && serial < 80000) {
            const d = new Date(Math.round((serial - 25569) * 86400000));
            base = { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
            if (serial % 1 > 0.0001) time = { h: d.getUTCHours(), min: d.getUTCMinutes() };
        }
    }

    if (!base) {
        let rest = "";
        let m = dr.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
        if (m) {
            const yy = parseInt(m[3]);
            base = { y: yy < 100 ? 2000 + yy : yy, m: parseInt(m[2]) - 1, d: parseInt(m[1]) };
            rest = dr.slice((m.index || 0) + m[0].length);
        } else {
            m = dr.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (m) {
                base = { y: parseInt(m[1]), m: parseInt(m[2]) - 1, d: parseInt(m[3]) };
                rest = dr.slice((m.index || 0) + m[0].length);
            }
        }
        // Hora combinada na mesma coluna (após a data)
        if (base && rest.trim()) {
            time = parseTimeStr(rest) || time;
        }
    }

    // Coluna Hora separada tem prioridade
    const fromTimeCol = parseTimeStr(timeRaw);
    if (fromTimeCol) time = fromTimeCol;

    if (!base) return { date: null, hasTime: false };
    if (base.m < 0 || base.m > 11 || base.d < 1 || base.d > 31) return { date: null, hasTime: false };

    const date = new Date(base.y, base.m, base.d, time?.h ?? 0, time?.min ?? 0, 0, 0);
    if (isNaN(date.getTime())) return { date: null, hasTime: false };
    return { date, hasTime: !!time };
}

// ─── Validação por linha ─────────────────────────────────────────────────────

export function validateAppointmentRow(
    row: Record<string, string>,
    mapping: Record<string, string>
): ValidatedRow {
    const errors: string[] = [];
    const data: Record<string, any> = {};

    const reverseMap: Record<string, string> = {};
    for (const [header, field] of Object.entries(mapping)) {
        reverseMap[field] = row[header] || "";
    }

    const name = normalizeName(reverseMap.name || "");
    if (!name) errors.push("Nome é obrigatório");
    data.name = name;

    const number = normalizePhone(reverseMap.phone || "");
    if (!number) errors.push("Telefone inválido");
    data.number = number;

    const { date, hasTime } = parseDateTime(reverseMap.date || "", reverseMap.time || "");
    if (!date) errors.push("Data inválida (use dd/mm/aaaa)");
    else if (!hasTime) errors.push("Hora não informada");
    data.start = date && hasTime ? date.toISOString() : null;

    const profLabel = (reverseMap.professional || "").trim();
    if (!profLabel) errors.push("Profissional é obrigatório");
    data.professionalLabel = profLabel;
    data.professionalKey = entityKey(profLabel);

    const svcLabel = (reverseMap.service || "").trim();
    if (!svcLabel) errors.push("Serviço é obrigatório");
    data.serviceLabel = svcLabel;
    data.serviceKey = entityKey(svcLabel);

    // Status: vazio → padrão pela data; desconhecido → aviso + padrão
    const statusRaw = (reverseMap.status || "").trim();
    let status: string | null = null;
    let statusWarning = false;
    if (statusRaw) {
        status = STATUS_SYNONYMS[entityKey(statusRaw)] || null;
        if (!status) statusWarning = true;
    }
    data.status = status;

    // Valor: vazio → usa o preço cadastrado do serviço
    data.price = (reverseMap.price || "").trim() ? normalizePrice(reverseMap.price) : null;
    data.notes = (reverseMap.notes || "").trim() || null;

    let vStatus: ValidationStatus = errors.length > 0 ? "error" : "valid";
    if (vStatus === "valid" && statusWarning) {
        vStatus = "warning";
        errors.push(`Status "${statusRaw}" desconhecido — será aplicado o padrão pela data`);
    }

    return { data, status: vStatus, errors };
}

// ─── Execução da importação ──────────────────────────────────────────────────

export interface EntityLink {
    key: string;
    label: string;
    /** id da entidade cadastrada, ou "__create" (apenas profissionais) */
    target: string;
    count: number;
}

export interface AppointmentImportResult {
    imported: number;
    failed: number;
    contactsCreated: number;
    professionalsCreated: number;
    salesCreated: number;
    cardsCreated: number;
    errors: string[];
}

const DEFAULT_WORK_HOURS = { start: "09:00", end: "18:00", break_start: "12:00", break_end: "13:00" };

export async function importAppointments(opts: {
    ownerId: string;
    rows: ValidatedRow[];
    professionalLinks: EntityLink[];
    serviceLinks: EntityLink[];
    autoCrm: boolean;
    onProgress?: (current: number, total: number) => void;
}): Promise<AppointmentImportResult> {
    const { ownerId, rows, professionalLinks, serviceLinks, autoCrm, onProgress } = opts;
    const result: AppointmentImportResult = {
        imported: 0, failed: 0, contactsCreated: 0, professionalsCreated: 0,
        salesCreated: 0, cardsCreated: 0, errors: [],
    };
    const totalSteps = rows.length * (autoCrm ? 2 : 1);
    let step = 0;
    const tick = () => onProgress?.(++step, totalSteps);

    // 1. Cria profissionais marcados para criação automática (jornada padrão)
    const profIdByKey = new Map<string, string>();
    for (const link of professionalLinks) {
        if (link.target === "__create") {
            const { data, error } = await supabase
                .from("professionals" as any)
                .insert({
                    user_id: ownerId,
                    name: link.label,
                    role: "",
                    commission: 0,
                    work_days: [1, 2, 3, 4, 5],
                    work_hours: DEFAULT_WORK_HOURS,
                })
                .select("id")
                .single();
            if (error) throw new Error(`Erro ao criar profissional "${link.label}": ${error.message}`);
            profIdByKey.set(link.key, (data as any).id);
            result.professionalsCreated++;
        } else {
            profIdByKey.set(link.key, link.target);
        }
    }

    // 2. Carrega os serviços vinculados
    const svcIdByKey = new Map<string, string>(serviceLinks.map((l) => [l.key, l.target]));
    const svcIds = [...new Set(serviceLinks.map((l) => l.target))];
    const { data: svcRows, error: svcErr } = await supabase
        .from("services_client")
        .select("id, name, duration_minutes, price, min_price, category_id, service_name_id, professionals")
        .in("id", svcIds);
    if (svcErr) throw svcErr;
    const svcById = new Map<string, any>((svcRows || []).map((s: any) => [s.id, s]));

    // 3. Vincula serviço ↔ profissional automaticamente quando faltar
    const neededProsBySvc = new Map<string, Set<string>>();
    for (const row of rows) {
        const profId = profIdByKey.get(row.data.professionalKey);
        const svcId = svcIdByKey.get(row.data.serviceKey);
        if (!profId || !svcId) continue;
        if (!neededProsBySvc.has(svcId)) neededProsBySvc.set(svcId, new Set());
        neededProsBySvc.get(svcId)!.add(profId);
    }
    for (const [svcId, profIds] of neededProsBySvc) {
        const svc = svcById.get(svcId);
        if (!svc) continue;
        const current: string[] = svc.professionals || [];
        const missing = [...profIds].filter((p) => !current.includes(p));
        if (missing.length > 0) {
            const updated = [...current, ...missing];
            const { error } = await supabase
                .from("services_client")
                .update({ professionals: updated })
                .eq("id", svcId);
            if (!error) svc.professionals = updated;
        }
    }

    // 4. Resolve contatos pelos últimos 8 dígitos (sem duplicatas)
    const suffix8 = (n: string) => n.replace(/\D/g, "").slice(-8);
    const bySuffix = new Map<string, { id: string; push_name: string | null }>();
    const PAGE = 1000;
    for (let page = 0; ; page++) {
        const { data: batch, error } = await supabase
            .from("contacts")
            .select("id, number, push_name")
            .eq("user_id", ownerId)
            .order("created_at", { ascending: false })
            .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) throw error;
        for (const c of batch || []) {
            const key = suffix8(c.number || "");
            if (key.length === 8 && !bySuffix.has(key)) {
                bySuffix.set(key, { id: c.id, push_name: c.push_name });
            }
        }
        if (!batch || batch.length < PAGE) break;
    }

    const contactIdByNumber = new Map<string, string>();
    const nameByNumber = new Map<string, string>();
    for (const row of rows) {
        const n = row.data.number as string;
        if (!contactIdByNumber.has(n)) nameByNumber.set(n, row.data.name);
        const match = bySuffix.get(suffix8(n));
        if (match) {
            contactIdByNumber.set(n, match.id);
            // Atualiza o nome com o da planilha (demais campos preservados)
            const fileName = row.data.name as string;
            if (fileName && fileName !== match.push_name) {
                await supabase
                    .from("contacts")
                    .update({ push_name: fileName, updated_at: new Date().toISOString() })
                    .eq("id", match.id);
                match.push_name = fileName;
            }
        }
    }
    const toCreate = [...nameByNumber.keys()].filter((n) => !contactIdByNumber.has(n));
    for (let i = 0; i < toCreate.length; i += 100) {
        const chunk = toCreate.slice(i, i + 100).map((n) => ({
            user_id: ownerId,
            number: n,
            push_name: nameByNumber.get(n) || "Cliente",
            phone: n.replace(/@.*$/, ""),
            channel: "whatsapp",
            is_lead: true,
        }));
        const { data: inserted, error } = await supabase
            .from("contacts")
            .insert(chunk as any)
            .select("id, number");
        if (error) throw new Error(`Erro ao criar contatos: ${error.message}`);
        for (const c of inserted || []) {
            contactIdByNumber.set(c.number, c.id);
            result.contactsCreated++;
        }
    }

    // 5. Monta e insere os agendamentos (sem validar conflito de horário — regra de importação)
    const now = Date.now();
    interface Prepared {
        payload: any;
        contactId: string;
        professionalId: string;
        svc: any;
        price: number;
        status: string;
        start: Date;
    }
    const prepared: Prepared[] = [];
    for (const row of rows) {
        const contactId = contactIdByNumber.get(row.data.number);
        const professionalId = profIdByKey.get(row.data.professionalKey);
        const svc = svcById.get(svcIdByKey.get(row.data.serviceKey) || "");
        if (!contactId || !professionalId || !svc || !row.data.start) {
            result.failed++;
            result.errors.push(`Linha ignorada (${row.data.name || "sem nome"}): vínculo incompleto`);
            if (!autoCrm) tick(); else { tick(); tick(); }
            continue;
        }
        const start = new Date(row.data.start);
        const duration = svc.duration_minutes && svc.duration_minutes > 0 ? svc.duration_minutes : 30;
        const end = new Date(start.getTime() + duration * 60000);
        const status = row.data.status || (start.getTime() < now ? "completed" : "pending");
        const price = row.data.price ?? (svc.price ?? 0);
        prepared.push({
            payload: {
                user_id: ownerId,
                professional_id: professionalId,
                contact_id: contactId,
                service_id: svc.id,
                category_id: svc.category_id || null,
                service_name_id: svc.service_name_id || null,
                start_time: start.toISOString(),
                end_time: end.toISOString(),
                price,
                description: row.data.notes,
                type: "appointment",
                status,
            },
            contactId, professionalId, svc, price, status, start,
        });
    }

    for (let i = 0; i < prepared.length; i += 100) {
        const chunk = prepared.slice(i, i + 100);
        const { error } = await supabase
            .from("appointments")
            .insert(chunk.map((p) => p.payload) as any);
        if (error) {
            result.failed += chunk.length;
            result.errors.push(`Erro ao inserir agendamentos: ${error.message}`);
            chunk.forEach(() => tick());
            continue;
        }
        result.imported += chunk.length;
        chunk.forEach(() => tick());
    }

    // 6. Negociações + vendas automáticas (opcional)
    if (autoCrm) {
        const cardCache = new Map<string, { id: string; svcIds: Set<string>; total: number } | null>();
        for (const p of prepared) {
            try {
                await syncCrmForImported(ownerId, p, cardCache, result);
            } catch (err: any) {
                result.errors.push(`CRM (${p.svc.name}): ${err.message}`);
            }
            tick();
        }
    }

    return result;
}

const TERMINAL = ["Ganho", "Perdido", "Finalizado"];

async function syncCrmForImported(
    ownerId: string,
    p: { contactId: string; professionalId: string; svc: any; price: number; status: string; start: Date },
    cardCache: Map<string, { id: string; svcIds: Set<string>; total: number } | null>,
    result: AppointmentImportResult
) {
    const nowIso = new Date().toISOString();

    // Finalizado → venda (data do agendamento) + card Ganho
    if (p.status === "completed") {
        if (p.price > 0) {
            const y = p.start.getFullYear();
            const m = String(p.start.getMonth() + 1).padStart(2, "0");
            const d = String(p.start.getDate()).padStart(2, "0");
            const { error } = await supabase.from("sales").insert({
                user_id: ownerId,
                category: "service",
                product_service_id: null,
                product_name: p.svc.name || "Serviço",
                quantity: 1,
                unit_price: p.price,
                total_amount: p.price,
                payment_type: "pending",
                installments: 1,
                interest_rate: 0,
                cash_amount: 0,
                sale_date: `${y}-${m}-${d}`,
                professional_id: p.professionalId,
                contact_id: p.contactId,
                notes: `Venda automática - importação de agendamentos: ${p.svc.name}`,
            });
            if (!error) result.salesCreated++;
        }
        await createInactiveCard(ownerId, p, "Ganho", null, result);
        return;
    }

    // Cancelado / faltou → card Perdido
    if (p.status === "canceled" || p.status === "no-show") {
        const lossType = p.status === "no-show" ? "no_show" : "canceled";
        await createInactiveCard(ownerId, p, "Perdido", lossType, result);
        return;
    }

    // Pendente / confirmado / remarcado / em espera → card ativo em Agendado
    let cached = cardCache.get(p.contactId);
    if (cached === undefined) {
        const { data: card } = await supabase
            .from("crm_client" as any)
            .select("*")
            .eq("contact_id", p.contactId)
            .eq("is_active", true)
            .maybeSingle();
        if (card && !TERMINAL.includes((card as any).stage)) {
            const services = await supabase
                .from("crm_client_services" as any)
                .select("service_client_id, unit_price, quantity")
                .eq("crm_client_id", (card as any).id);
            const rows = (services.data || []) as any[];
            cached = {
                id: (card as any).id,
                svcIds: new Set(rows.map((s) => s.service_client_id)),
                total: rows.reduce((s, r) => s + r.unit_price * r.quantity, 0),
            };
            if ((card as any).stage !== "Agendado") {
                await supabase
                    .from("crm_client" as any)
                    .update({ stage: "Agendado", stage_changed_at: nowIso, updated_at: nowIso })
                    .eq("id", cached.id);
            }
        } else {
            cached = null;
        }
        cardCache.set(p.contactId, cached);
    }

    if (!cached) {
        const { data: newCard, error } = await supabase
            .from("crm_client" as any)
            .insert({
                user_id: ownerId,
                contact_id: p.contactId,
                stage: "Agendado",
                stage_changed_at: nowIso,
                value: 0,
                professional_id: p.professionalId,
                priority: "medium",
                is_active: true,
            })
            .select()
            .single();
        if (error || !newCard) throw new Error(error?.message || "falha ao criar card");
        cached = { id: (newCard as any).id, svcIds: new Set(), total: 0 };
        cardCache.set(p.contactId, cached);
        result.cardsCreated++;
    }

    if (!cached.svcIds.has(p.svc.id)) {
        await supabase.from("crm_client_services" as any).insert({
            crm_client_id: cached.id,
            service_client_id: p.svc.id,
            service_name: p.svc.name || "Serviço",
            quantity: 1,
            unit_price: p.price,
            min_price: p.svc.min_price || 0,
        });
        cached.svcIds.add(p.svc.id);
        cached.total += p.price;
        await supabase
            .from("crm_client" as any)
            .update({ value: cached.total, updated_at: nowIso })
            .eq("id", cached.id);
    }
}

async function createInactiveCard(
    ownerId: string,
    p: { contactId: string; professionalId: string; svc: any; price: number },
    stage: "Ganho" | "Perdido",
    lossType: "canceled" | "no_show" | null,
    result: AppointmentImportResult
) {
    const nowIso = new Date().toISOString();
    const payload: any = {
        user_id: ownerId,
        contact_id: p.contactId,
        stage,
        stage_changed_at: nowIso,
        value: p.price,
        professional_id: p.professionalId,
        is_active: false,
    };
    if (lossType) {
        payload.loss_reason = lossType;
        payload.loss_reason_other = lossType === "no_show"
            ? "Cliente não compareceu"
            : "Cliente cancelou o agendamento";
    }
    const { data: card, error } = await supabase
        .from("crm_client" as any)
        .insert(payload)
        .select()
        .single();
    if (error || !card) throw new Error(error?.message || "falha ao criar card");
    await supabase.from("crm_client_services" as any).insert({
        crm_client_id: (card as any).id,
        service_client_id: p.svc.id,
        service_name: p.svc.name || "Serviço",
        quantity: 1,
        unit_price: p.price,
        min_price: 0,
    });
    result.cardsCreated++;
}
