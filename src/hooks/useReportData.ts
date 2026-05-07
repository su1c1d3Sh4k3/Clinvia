import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// =============================================
// TYPES
// =============================================

export interface TicketMetrics {
    total: number;
    open: number;
    pending: number;
    resolved: number;
    closed: number;
    avgResolutionHours: number | null;
    byAgent: { agent_id: string; agent_name: string; count: number }[];
    // Métricas avançadas (via RPC get_attendance_metrics)
    avgFirstResponseSecondsAi: number;
    avgFirstResponseSecondsHuman: number;
    countAiHandled: number;
    countHumanHandled: number;
    countOutsideBusinessHours: number;
    countInsideBusinessHours: number;
    countAbandoned: number;
    abandonmentRate: number;
    avgSentimentScore: number;
    avgNps: number;
    totalNpsResponses: number;
}

export interface ContactMetrics {
    totalNew: number;
    totalLeads: number;
    conversionRate: number;
    // Origem dos contatos (contacts.channel)
    whatsappCount: number;
    instagramCount: number;
    // Funil Lead → Paciente (contacts.is_lead / contacts.patient)
    leadCount: number;
    patientCount: number;
    leadToPatientRate: number;
}

export interface AppointmentMetrics {
    total: number;
    confirmed: number;
    completed: number;
    pending: number;
    rescheduled: number;
    canceled: number;
    byProfessional: { professional_id: string; professional_name: string; count: number }[];
    occupancyByProfessional: { professional_id: string; professional_name: string; occupancy: number; totalHours: number; bookedHours: number }[];
    // Métricas avançadas (via RPC get_appointment_metrics)
    notCompletedCount: number;
    noShowRate: number;          // % do total não-concluído
    canceledRate: number;        // % do total cancelado
    pureNoShowCount: number;     // não-concluídos - cancelados
    byDayOfWeek: { dow: number; count: number }[];
    byHourHeatmap: { dow: number; hour: number; count: number }[];
    dailyProgress: { date: string; cumulative: number }[];
    goal: {
        target: number;
        month: number;
        year: number;
        achieved: number;
        progressPct: number;
    } | null;
}

export interface SalesMetrics {
    totalCount: number;
    totalRevenue: number;
    averageTicket: number;
    cashCount: number;
    installmentCount: number;
    cashRevenue: number;
    installmentRevenue: number;
    topProducts: { id: string; name: string; type: string; quantity: number; revenue: number }[];
    overdueInstallments: number;
    overdueAmount: number;
}

export interface CrmMetrics {
    byFunnel: {
        funnel_id: string;
        funnel_name: string;
        stages: { stage_id: string; stage_name: string; count: number; value: number }[];
    }[];
    totalDeals: number;
    totalValue: number;
}

export interface QueueMetrics {
    byQueue: { queue_id: string | null; queue_name: string; count: number }[];
}

export interface FinancialMetrics {
    totalRevenue: number;
    totalReceived: number;
    totalPending: number;
    totalOverdue: number;
}

export interface ReportData {
    tickets: TicketMetrics;
    contacts: ContactMetrics;
    appointments: AppointmentMetrics;
    sales: SalesMetrics;
    crm: CrmMetrics;
    queues: QueueMetrics;
    financials: FinancialMetrics;
}

// =============================================
// FETCH FUNCTIONS
// =============================================

async function fetchTicketMetrics(start: string, end: string): Promise<TicketMetrics> {
    // Fetch conversations + RPC em paralelo
    const [convResult, rpcResult] = await Promise.all([
        supabase
            .from("conversations" as any)
            .select("id, status, created_at, updated_at, assigned_agent_id")
            .gte("created_at", start)
            .lte("created_at", end)
            .limit(10000),
        supabase.rpc("get_attendance_metrics" as any, { p_start: start, p_end: end }),
    ]);

    if (convResult.error) throw convResult.error;
    const items = (convResult.data || []) as any[];

    // RPC pode falhar silenciosamente (ex: migration não aplicada); usa defaults
    const adv = (rpcResult.data || {}) as any;

    const resolved = items.filter(c => c.status === "resolved");
    let avgResolutionHours: number | null = null;
    if (resolved.length > 0) {
        const totalMs = resolved.reduce((sum, c) => {
            return sum + (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime());
        }, 0);
        avgResolutionHours = Math.round((totalMs / resolved.length / 1000 / 60 / 60) * 10) / 10;
    }

    // Count by agent
    const agentMap = new Map<string, number>();
    items.forEach(c => {
        if (c.assigned_agent_id) {
            agentMap.set(c.assigned_agent_id, (agentMap.get(c.assigned_agent_id) || 0) + 1);
        }
    });

    // Fetch agent names
    const agentIds = Array.from(agentMap.keys());
    let agentNames: Record<string, string> = {};
    if (agentIds.length > 0) {
        const { data: members } = await supabase
            .from("team_members" as any)
            .select("auth_user_id, name")
            .in("auth_user_id", agentIds);
        (members || []).forEach((m: any) => { agentNames[m.auth_user_id] = m.name; });
    }

    return {
        total: items.length,
        open: items.filter(c => c.status === "open").length,
        pending: items.filter(c => c.status === "pending").length,
        resolved: resolved.length,
        closed: items.filter(c => c.status === "closed").length,
        avgResolutionHours,
        byAgent: agentIds.map(id => ({
            agent_id: id,
            agent_name: agentNames[id] || "Sem atendente",
            count: agentMap.get(id) || 0,
        })).sort((a, b) => b.count - a.count),
        avgFirstResponseSecondsAi: Number(adv.avg_first_response_seconds_ai) || 0,
        avgFirstResponseSecondsHuman: Number(adv.avg_first_response_seconds_human) || 0,
        countAiHandled: Number(adv.count_ai_handled) || 0,
        countHumanHandled: Number(adv.count_human_handled) || 0,
        countOutsideBusinessHours: Number(adv.count_outside_business_hours) || 0,
        countInsideBusinessHours: Number(adv.count_inside_business_hours) || 0,
        countAbandoned: Number(adv.count_abandoned) || 0,
        abandonmentRate: Number(adv.abandonment_rate) || 0,
        avgSentimentScore: Number(adv.avg_sentiment_score) || 0,
        avgNps: Number(adv.avg_nps) || 0,
        totalNpsResponses: Number(adv.total_nps_responses) || 0,
    };
}

async function fetchContactMetrics(start: string, end: string): Promise<ContactMetrics> {
    // Todas as queries em paralelo — RLS já filtra por user_id, índices em (user_id, created_at).
    // count: 'exact' + head: true → não traz rows, só o número.
    const [
        contactsAgg,
        dealsAgg,
        whatsappAgg,
        instagramAgg,
        leadAgg,
        patientAgg,
    ] = await Promise.all([
        supabase.from("contacts" as any).select("id", { count: "exact", head: true })
            .gte("created_at", start).lte("created_at", end),
        supabase.from("crm_deals" as any).select("contact_id")
            .gte("created_at", start).lte("created_at", end).limit(10000),
        supabase.from("contacts" as any).select("id", { count: "exact", head: true })
            .eq("channel", "whatsapp").gte("created_at", start).lte("created_at", end),
        supabase.from("contacts" as any).select("id", { count: "exact", head: true })
            .eq("channel", "instagram").gte("created_at", start).lte("created_at", end),
        supabase.from("contacts" as any).select("id", { count: "exact", head: true })
            .eq("is_lead", true).gte("created_at", start).lte("created_at", end),
        supabase.from("contacts" as any).select("id", { count: "exact", head: true })
            .eq("patient", true).gte("created_at", start).lte("created_at", end),
    ]);

    if (contactsAgg.error) throw contactsAgg.error;
    if (dealsAgg.error) throw dealsAgg.error;

    const total = contactsAgg.count || 0;
    const uniqueLeads = new Set((dealsAgg.data || []).map((l: any) => l.contact_id)).size;
    const leadCount = leadAgg.count || 0;
    const patientCount = patientAgg.count || 0;

    return {
        totalNew: total,
        totalLeads: uniqueLeads,
        conversionRate: total > 0 ? Math.round((uniqueLeads / total) * 100 * 10) / 10 : 0,
        whatsappCount: whatsappAgg.count || 0,
        instagramCount: instagramAgg.count || 0,
        leadCount,
        patientCount,
        leadToPatientRate: leadCount > 0
            ? Math.round((patientCount / leadCount) * 100 * 10) / 10
            : 0,
    };
}

async function fetchAppointmentMetrics(start: string, end: string): Promise<AppointmentMetrics> {
    // Fetch appointments + RPC em paralelo
    const [appointmentsResult, rpcResult] = await Promise.all([
        supabase
            .from("appointments" as any)
            .select("id, status, professional_id, start_time, end_time, type")
            .gte("start_time", start)
            .lte("start_time", end)
            .eq("type", "appointment")
            .limit(10000),
        supabase.rpc("get_appointment_metrics" as any, { p_start: start, p_end: end }),
    ]);

    if (appointmentsResult.error) throw appointmentsResult.error;
    const items = (appointmentsResult.data || []) as any[];
    const adv = (rpcResult.data || {}) as any;

    // Group by professional
    const profMap = new Map<string, number>();
    items.forEach(a => {
        if (a.professional_id) {
            profMap.set(a.professional_id, (profMap.get(a.professional_id) || 0) + 1);
        }
    });

    const profIds = Array.from(profMap.keys());
    let profData: any[] = [];
    if (profIds.length > 0) {
        const { data: profs } = await supabase
            .from("professionals" as any)
            .select("id, name, work_days, work_hours")
            .in("id", profIds);
        profData = profs || [];
    }

    const profNames: Record<string, string> = {};
    profData.forEach((p: any) => { profNames[p.id] = p.name; });

    // Calculate occupancy per professional
    const startDate = new Date(start);
    const endDate = new Date(end);
    const occupancyByProfessional = profData.map((prof: any) => {
        const workHours = prof.work_hours || {};
        const workDays = prof.work_days || [];

        // Calculate total work hours in the period
        let totalWorkMinutes = 0;
        const current = new Date(startDate);
        while (current <= endDate) {
            const dayOfWeek = current.getDay();
            if (workDays.includes(dayOfWeek)) {
                const startH = workHours.start ? parseFloat(workHours.start.replace(":", ".")) : 8;
                const endH = workHours.end ? parseFloat(workHours.end.replace(":", ".")) : 18;
                const breakStartH = workHours.break_start ? parseFloat(workHours.break_start.replace(":", ".")) : 0;
                const breakEndH = workHours.break_end ? parseFloat(workHours.break_end.replace(":", ".")) : 0;

                let dailyMinutes = (endH - startH) * 60;
                if (breakStartH && breakEndH) {
                    dailyMinutes -= (breakEndH - breakStartH) * 60;
                }
                totalWorkMinutes += Math.max(0, dailyMinutes);
            }
            current.setDate(current.getDate() + 1);
        }

        // Calculate booked hours
        const profAppointments = items.filter(a => a.professional_id === prof.id);
        const bookedMinutes = profAppointments.reduce((sum: number, a: any) => {
            const duration = (new Date(a.end_time).getTime() - new Date(a.start_time).getTime()) / 60000;
            return sum + duration;
        }, 0);

        const totalHours = Math.round(totalWorkMinutes / 60 * 10) / 10;
        const bookedHours = Math.round(bookedMinutes / 60 * 10) / 10;

        return {
            professional_id: prof.id,
            professional_name: prof.name,
            occupancy: totalWorkMinutes > 0 ? Math.round((bookedMinutes / totalWorkMinutes) * 100 * 10) / 10 : 0,
            totalHours,
            bookedHours,
        };
    });

    const advGoal = adv.goal;

    return {
        total: items.length,
        confirmed: items.filter(a => a.status === "confirmed").length,
        completed: items.filter(a => a.status === "completed").length,
        pending: items.filter(a => a.status === "pending").length,
        rescheduled: items.filter(a => a.status === "rescheduled").length,
        canceled: items.filter(a => a.status === "canceled").length,
        byProfessional: profIds.map(id => ({
            professional_id: id,
            professional_name: profNames[id] || "Sem profissional",
            count: profMap.get(id) || 0,
        })).sort((a, b) => b.count - a.count),
        occupancyByProfessional,
        notCompletedCount: Number(adv.not_completed_count) || 0,
        noShowRate: Number(adv.no_show_rate) || 0,
        canceledRate: Number(adv.canceled_rate) || 0,
        pureNoShowCount: Number(adv.pure_no_show) || 0,
        byDayOfWeek: Array.isArray(adv.by_day_of_week) ? adv.by_day_of_week : [],
        byHourHeatmap: Array.isArray(adv.by_hour_heatmap) ? adv.by_hour_heatmap : [],
        dailyProgress: Array.isArray(adv.daily_progress) ? adv.daily_progress : [],
        goal: advGoal ? {
            target: Number(advGoal.target) || 0,
            month: Number(advGoal.month) || 0,
            year: Number(advGoal.year) || 0,
            achieved: Number(advGoal.achieved) || 0,
            progressPct: Number(advGoal.progress_pct) || 0,
        } : null,
    };
}

async function fetchSalesMetrics(start: string, end: string): Promise<SalesMetrics> {
    const { data: sales, error } = await supabase
        .from("sales" as any)
        .select("id, total_amount, payment_type, quantity, product_service_id, category")
        .gte("sale_date", start)
        .lte("sale_date", end)
        .limit(10000);

    if (error) throw error;
    const items = (sales || []) as any[];

    const totalRevenue = items.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);
    const cashItems = items.filter(s => s.payment_type === "cash");
    const installmentItems = items.filter(s => s.payment_type === "installment");

    // Top products/services
    const productMap = new Map<string, { quantity: number; revenue: number; category: string }>();
    items.forEach(s => {
        if (s.product_service_id) {
            const existing = productMap.get(s.product_service_id) || { quantity: 0, revenue: 0, category: s.category || "" };
            existing.quantity += (s.quantity || 1);
            existing.revenue += (Number(s.total_amount) || 0);
            existing.category = s.category || existing.category;
            productMap.set(s.product_service_id, existing);
        }
    });

    const productIds = Array.from(productMap.keys());
    let productNames: Record<string, { name: string; type: string }> = {};
    if (productIds.length > 0) {
        const { data: products } = await supabase
            .from("products_services" as any)
            .select("id, name, type")
            .in("id", productIds);
        (products || []).forEach((p: any) => { productNames[p.id] = { name: p.name, type: p.type }; });
    }

    const topProducts = productIds
        .map(id => ({
            id,
            name: productNames[id]?.name || "Desconhecido",
            type: productNames[id]?.type || "product",
            quantity: productMap.get(id)?.quantity || 0,
            revenue: productMap.get(id)?.revenue || 0,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

    // Overdue installments
    const { data: overdue, error: overdueErr } = await supabase
        .from("sale_installments" as any)
        .select("id, amount")
        .eq("status", "overdue")
        .gte("due_date", start)
        .lte("due_date", end);

    if (overdueErr) throw overdueErr;
    const overdueItems = (overdue || []) as any[];

    return {
        totalCount: items.length,
        totalRevenue,
        averageTicket: items.length > 0 ? Math.round(totalRevenue / items.length * 100) / 100 : 0,
        cashCount: cashItems.length,
        installmentCount: installmentItems.length,
        cashRevenue: cashItems.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0),
        installmentRevenue: installmentItems.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0),
        topProducts,
        overdueInstallments: overdueItems.length,
        overdueAmount: overdueItems.reduce((sum, i) => sum + (Number(i.amount) || 0), 0),
    };
}

async function fetchCrmMetrics(start: string, end: string): Promise<CrmMetrics> {
    const { data: deals, error } = await supabase
        .from("crm_deals" as any)
        .select("id, funnel_id, stage_id, value")
        .gte("created_at", start)
        .lte("created_at", end)
        .limit(10000);

    if (error) throw error;
    const items = (deals || []) as any[];

    // Fetch funnels and stages
    const funnelIds = [...new Set(items.map(d => d.funnel_id).filter(Boolean))];
    const stageIds = [...new Set(items.map(d => d.stage_id).filter(Boolean))];

    let funnelNames: Record<string, string> = {};
    let stageNames: Record<string, { name: string; funnel_id: string }> = {};

    if (funnelIds.length > 0) {
        const { data: funnels } = await supabase
            .from("crm_funnels" as any)
            .select("id, name")
            .in("id", funnelIds);
        (funnels || []).forEach((f: any) => { funnelNames[f.id] = f.name; });
    }

    if (stageIds.length > 0) {
        const { data: stages } = await supabase
            .from("crm_stages" as any)
            .select("id, name, funnel_id")
            .in("id", stageIds);
        (stages || []).forEach((s: any) => { stageNames[s.id] = { name: s.name, funnel_id: s.funnel_id }; });
    }

    // Group by funnel → stage
    const funnelMap = new Map<string, Map<string, { count: number; value: number }>>();
    items.forEach(d => {
        if (!d.funnel_id || !d.stage_id) return;
        if (!funnelMap.has(d.funnel_id)) funnelMap.set(d.funnel_id, new Map());
        const stageMap = funnelMap.get(d.funnel_id)!;
        const existing = stageMap.get(d.stage_id) || { count: 0, value: 0 };
        existing.count++;
        existing.value += Number(d.value) || 0;
        stageMap.set(d.stage_id, existing);
    });

    const byFunnel = Array.from(funnelMap.entries()).map(([funnelId, stageMap]) => ({
        funnel_id: funnelId,
        funnel_name: funnelNames[funnelId] || "Funil desconhecido",
        stages: Array.from(stageMap.entries()).map(([stageId, data]) => ({
            stage_id: stageId,
            stage_name: stageNames[stageId]?.name || "Etapa desconhecida",
            count: data.count,
            value: data.value,
        })),
    }));

    return {
        byFunnel,
        totalDeals: items.length,
        totalValue: items.reduce((sum, d) => sum + (Number(d.value) || 0), 0),
    };
}

async function fetchQueueMetrics(start: string, end: string): Promise<QueueMetrics> {
    const { data: conversations, error } = await supabase
        .from("conversations" as any)
        .select("id, queue_id")
        .gte("created_at", start)
        .lte("created_at", end)
        .limit(10000);

    if (error) throw error;
    const items = (conversations || []) as any[];

    const queueMap = new Map<string | null, number>();
    items.forEach(c => {
        const qId = c.queue_id || null;
        queueMap.set(qId, (queueMap.get(qId) || 0) + 1);
    });

    const queueIds = Array.from(queueMap.keys()).filter(Boolean) as string[];
    let queueNames: Record<string, string> = {};
    if (queueIds.length > 0) {
        const { data: queues } = await supabase
            .from("queues" as any)
            .select("id, name")
            .in("id", queueIds);
        (queues || []).forEach((q: any) => { queueNames[q.id] = q.name; });
    }

    return {
        byQueue: Array.from(queueMap.entries()).map(([qId, count]) => ({
            queue_id: qId,
            queue_name: qId ? (queueNames[qId] || "Fila desconhecida") : "Sem fila",
            count,
        })).sort((a, b) => b.count - a.count),
    };
}

async function fetchFinancialMetrics(start: string, end: string): Promise<FinancialMetrics> {
    // Busca vendas e parcelas no período — dados reais do módulo de vendas
    const [salesRes, installmentsRes] = await Promise.all([
        supabase
            .from("sales" as any)
            .select("id, total_amount, payment_type")
            .gte("sale_date", start)
            .lte("sale_date", end),
        supabase
            .from("sale_installments" as any)
            .select("amount, status, sale_id")
            .gte("due_date", start)
            .lte("due_date", end),
    ]);

    if (salesRes.error) throw salesRes.error;
    if (installmentsRes.error) throw installmentsRes.error;

    const sales = (salesRes.data || []) as any[];
    const installments = (installmentsRes.data || []) as any[];

    // Receita total: soma de todas as vendas no período
    const totalRevenue = sales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);

    // Vendas à vista (recebido imediatamente)
    const cashRevenue = sales
        .filter(s => s.payment_type === "cash")
        .reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0);

    // Parcelas pagas
    const paidInstallments = installments
        .filter(i => i.status === "paid")
        .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

    // Parcelas pendentes (ainda não vencidas ou aguardando)
    const pendingInstallments = installments
        .filter(i => i.status === "pending")
        .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

    // Parcelas em atraso
    const overdueInstallments = installments
        .filter(i => i.status === "overdue")
        .reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

    return {
        totalRevenue,
        totalReceived: cashRevenue + paidInstallments,
        totalPending: pendingInstallments,
        totalOverdue: overdueInstallments,
    };
}

// =============================================
// MAIN HOOK
// =============================================

export function useReportData(startDate: string | null, endDate: string | null) {
    return useQuery({
        queryKey: ["report-data", startDate, endDate],
        queryFn: async (): Promise<ReportData> => {
            const start = startDate!;
            const end = endDate!;

            const [tickets, contacts, appointments, sales, crm, queues, financials] = await Promise.all([
                fetchTicketMetrics(start, end),
                fetchContactMetrics(start, end),
                fetchAppointmentMetrics(start, end),
                fetchSalesMetrics(start, end),
                fetchCrmMetrics(start, end),
                fetchQueueMetrics(start, end),
                fetchFinancialMetrics(start, end),
            ]);

            return { tickets, contacts, appointments, sales, crm, queues, financials };
        },
        enabled: !!startDate && !!endDate,
        staleTime: 1000 * 60 * 5,
    });
}

// =============================================
// COMPARISON HELPER
// =============================================

export function calcEvolution(current: number, previous: number): number | null {
    if (previous === 0 && current === 0) return null;
    if (previous === 0) return 100;
    return Math.round(((current - previous) / Math.abs(previous)) * 100 * 10) / 10;
}
