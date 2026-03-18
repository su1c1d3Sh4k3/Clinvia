import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ==================== TYPES ====================
interface ReportData {
  metrics: Record<string, any>;
  breakdown: any[];
}

type Calculator = (
  sb: any,
  userId: string,
  start: string,
  end: string
) => Promise<ReportData>;

// ==================== HELPERS ====================

/** Returns IDs of "won" stages (named Ganho/Won/Fechado) across user's funnels */
async function getWonStageIds(sb: any, userId: string): Promise<string[]> {
  const { data: funnels } = await sb
    .from("crm_funnels")
    .select("id")
    .eq("user_id", userId);
  const funnelIds = (funnels || []).map((f: any) => f.id);
  if (funnelIds.length === 0) return [];

  const { data: stages } = await sb
    .from("crm_stages")
    .select("id, name")
    .in("funnel_id", funnelIds);

  return (stages || [])
    .filter((s: any) => /ganh|won|fechad|conclu/i.test(s.name))
    .map((s: any) => s.id);
}

/** Returns IDs of "lost" stages (named Perdido/Lost/Cancelado) across user's funnels */
async function getLostStageIds(sb: any, userId: string): Promise<string[]> {
  const { data: funnels } = await sb
    .from("crm_funnels")
    .select("id")
    .eq("user_id", userId);
  const funnelIds = (funnels || []).map((f: any) => f.id);
  if (funnelIds.length === 0) return [];

  const { data: stages } = await sb
    .from("crm_stages")
    .select("id, name")
    .in("funnel_id", funnelIds);

  return (stages || [])
    .filter((s: any) => /perd|lost|cancel/i.test(s.name))
    .map((s: any) => s.id);
}

// ==================== CALCULATORS ====================

const calcDeliveryFunnel: Calculator = async (sb, userId, start, end) => {
  // Use sale_date as primary filter (business date), fallback to created_at range
  const { data: bySaleDate } = await sb
    .from("deliveries")
    .select("id, stage, sale_date, created_at")
    .eq("user_id", userId)
    .gte("sale_date", start)
    .lte("sale_date", end);

  const { data: byCreatedAt } = await sb
    .from("deliveries")
    .select("id, stage, sale_date, created_at")
    .eq("user_id", userId)
    .gte("created_at", start + "T00:00:00")
    .lte("created_at", end + "T23:59:59");

  // Merge deduplicated by id
  const seen = new Set<string>();
  const items: any[] = [];
  for (const item of [...(bySaleDate || []), ...(byCreatedAt || [])]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }

  const stages = [
    "aguardando_agendamento",
    "procedimento_agendado",
    "procedimento_confirmado",
    "procedimento_concluido",
    "procedimento_cancelado",
  ];
  const by_stage: Record<string, number> = {};
  stages.forEach((s) => (by_stage[s] = 0));
  items.forEach((d: any) => {
    if (by_stage[d.stage] !== undefined) by_stage[d.stage]++;
  });
  const total = items.length;
  const concluido = by_stage["procedimento_concluido"] || 0;
  const cancelado = by_stage["procedimento_cancelado"] || 0;

  return {
    metrics: {
      total,
      by_stage,
      conversion_rate: total > 0 ? Math.round((concluido / total) * 100) : 0,
      cancel_rate: total > 0 ? Math.round((cancelado / total) * 100) : 0,
    },
    breakdown: stages.map((s) => ({ stage: s, count: by_stage[s] })),
  };
};

/** Generic CRM funnel calculator — uses ilike for funnel name to handle accents */
const calcCrmFunnel =
  (funnelNamePattern: string): Calculator =>
  async (sb, userId, start, end) => {
    const { data: funnelResults } = await sb
      .from("crm_funnels")
      .select("id, name")
      .eq("user_id", userId)
      .ilike("name", `%${funnelNamePattern}%`);

    if (!funnelResults || funnelResults.length === 0)
      return { metrics: { total_deals: 0 }, breakdown: [] };

    const funnel = funnelResults[0];

    const { data: stages } = await sb
      .from("crm_stages")
      .select("id, name, position")
      .eq("funnel_id", funnel.id)
      .order("position");

    const { data: deals } = await sb
      .from("crm_deals")
      .select("id, stage_id, value, loss_reason")
      .eq("funnel_id", funnel.id)
      .eq("user_id", userId)
      .gte("created_at", start + "T00:00:00")
      .lte("created_at", end + "T23:59:59");

    const stageList = stages || [];
    const dealList = deals || [];
    const total = dealList.length;

    // Won = stage name matches "ganho/won/fechado", Lost = has loss_reason
    const wonStageIds = stageList
      .filter((s: any) => /ganh|won|fechad/i.test(s.name))
      .map((s: any) => s.id);
    const lostStageIds = stageList
      .filter((s: any) => /perd|lost/i.test(s.name))
      .map((s: any) => s.id);

    const won = dealList.filter(
      (d: any) =>
        wonStageIds.includes(d.stage_id) ||
        (!d.loss_reason && wonStageIds.length === 0 && false)
    ).length;
    const lost = dealList.filter(
      (d: any) =>
        lostStageIds.includes(d.stage_id) || d.loss_reason != null
    ).length;

    const breakdown = stageList.map((s: any) => {
      const stageDeals = dealList.filter((d: any) => d.stage_id === s.id);
      return {
        stage_name: s.name,
        count: stageDeals.length,
        value_sum: stageDeals.reduce(
          (acc: number, d: any) => acc + (Number(d.value) || 0),
          0
        ),
      };
    });

    return {
      metrics: {
        total_deals: total,
        won,
        lost,
        conversion_rate: total > 0 ? Math.round((won / total) * 100) : 0,
        loss_rate: total > 0 ? Math.round((lost / total) * 100) : 0,
      },
      breakdown,
    };
  };

const calcAiService: Calculator = async (sb, userId, start, end) => {
  const { data: convs } = await sb
    .from("conversations")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", start + "T00:00:00")
    .lte("created_at", end + "T23:59:59");
  const convIds = (convs || []).map((c: any) => c.id);
  if (convIds.length === 0)
    return {
      metrics: { total_analyses: 0, avg_sentiment: 0, avg_speed: 0, conversations_with_ai: 0 },
      breakdown: [],
    };

  const { data: analyses } = await sb
    .from("ai_analysis")
    .select("conversation_id, sentiment_score, speed_score")
    .in("conversation_id", convIds);
  const items = analyses || [];
  const total = items.length;
  const avgSentiment =
    total > 0
      ? Number(
          (
            items.reduce((a: number, i: any) => a + (Number(i.sentiment_score) || 0), 0) /
            total
          ).toFixed(1)
        )
      : 0;
  const avgSpeed =
    total > 0
      ? Number(
          (
            items.reduce((a: number, i: any) => a + (Number(i.speed_score) || 0), 0) /
            total
          ).toFixed(1)
        )
      : 0;

  const ranges = [
    { label: "0-3", min: 0, max: 3 },
    { label: "4-6", min: 4, max: 6 },
    { label: "7-10", min: 7, max: 10 },
  ];
  const breakdown = ranges.map((r) => ({
    score_range: r.label,
    count: items.filter((i: any) => {
      const s = Number(i.sentiment_score) || 0;
      return s >= r.min && s <= r.max;
    }).length,
  }));

  return {
    metrics: {
      total_analyses: total,
      avg_sentiment: avgSentiment,
      avg_speed: avgSpeed,
      conversations_with_ai: total,
    },
    breakdown,
  };
};

const calcNewLeads: Calculator = async (sb, userId, start, end) => {
  const { data } = await sb
    .from("contacts")
    .select("id, created_at, channel")
    .eq("user_id", userId)
    .gte("created_at", start + "T00:00:00")
    .lte("created_at", end + "T23:59:59");
  const items = data || [];
  const total = items.length;

  const byDate: Record<string, number> = {};
  const byChannel: Record<string, number> = {};
  items.forEach((c: any) => {
    const d = c.created_at?.split("T")[0] || "unknown";
    byDate[d] = (byDate[d] || 0) + 1;
    const ch = c.channel || "Desconhecido";
    byChannel[ch] = (byChannel[ch] || 0) + 1;
  });

  return {
    metrics: {
      total_new: total,
      by_channel: Object.entries(byChannel).map(([channel, count]) => ({ channel, count })),
      growth_pct: 0,
    },
    breakdown: Object.entries(byDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
};

const calcLeadsConversions: Calculator = async (sb, userId, start, end) => {
  const { data: contacts } = await sb
    .from("contacts")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", start + "T00:00:00")
    .lte("created_at", end + "T23:59:59");
  const totalLeads = (contacts || []).length;

  // Won deals: in stages named Ganho/Won
  const wonStageIds = await getWonStageIds(sb, userId);
  let totalConversions = 0;
  if (wonStageIds.length > 0) {
    const { data: deals } = await sb
      .from("crm_deals")
      .select("id")
      .eq("user_id", userId)
      .in("stage_id", wonStageIds)
      .gte("created_at", start + "T00:00:00")
      .lte("created_at", end + "T23:59:59");
    totalConversions = (deals || []).length;
  } else {
    // Fallback: deals without loss_reason (assume active/won)
    const { data: deals } = await sb
      .from("crm_deals")
      .select("id")
      .eq("user_id", userId)
      .is("loss_reason", null)
      .gte("created_at", start + "T00:00:00")
      .lte("created_at", end + "T23:59:59");
    totalConversions = (deals || []).length;
  }

  return {
    metrics: {
      total_leads: totalLeads,
      total_conversions: totalConversions,
      conversion_rate:
        totalLeads > 0 ? Math.round((totalConversions / totalLeads) * 100) : 0,
    },
    breakdown: [],
  };
};

const calcRecurrenceConversion: Calculator = async (sb, userId, start, end) => {
  const { data: funnelResults } = await sb
    .from("crm_funnels")
    .select("id, name")
    .eq("user_id", userId)
    .ilike("name", "%Recorr%");

  if (!funnelResults || funnelResults.length === 0)
    return { metrics: { conversion_rate: 0, total_recurrence: 0 }, breakdown: [] };

  const funnel = funnelResults[0];

  const { data: stages } = await sb
    .from("crm_stages")
    .select("id, name")
    .eq("funnel_id", funnel.id);

  const stageList = stages || [];
  const wonStageIds = stageList
    .filter((s: any) => /ganh|won|fechad/i.test(s.name))
    .map((s: any) => s.id);
  const lostStageIds = stageList
    .filter((s: any) => /perd|lost/i.test(s.name))
    .map((s: any) => s.id);

  const { data: deals } = await sb
    .from("crm_deals")
    .select("id, stage_id, loss_reason")
    .eq("funnel_id", funnel.id)
    .eq("user_id", userId)
    .gte("created_at", start + "T00:00:00")
    .lte("created_at", end + "T23:59:59");

  const items = deals || [];
  const total = items.length;
  const won = items.filter((d: any) => wonStageIds.includes(d.stage_id)).length;
  const lost = items.filter(
    (d: any) => lostStageIds.includes(d.stage_id) || d.loss_reason != null
  ).length;
  const pending = total - won - lost;

  return {
    metrics: {
      total_recurrence: total,
      won,
      lost,
      pending,
      conversion_rate: total > 0 ? Math.round((won / total) * 100) : 0,
    },
    breakdown: [],
  };
};

const calcRevenue: Calculator = async (sb, userId, start, end) => {
  const { data: revs } = await sb
    .from("revenues")
    .select("amount, status")
    .eq("user_id", userId)
    .gte("due_date", start)
    .lte("due_date", end);
  const { data: exps } = await sb
    .from("expenses")
    .select("amount, status")
    .eq("user_id", userId)
    .gte("due_date", start)
    .lte("due_date", end);
  const { data: costs } = await sb
    .from("team_costs")
    .select("salary, commission, bonus, deduction")
    .eq("user_id", userId)
    .gte("reference_month", start)
    .lte("reference_month", end);

  const totalRevenue = (revs || []).reduce(
    (a: number, r: any) => a + (Number(r.amount) || 0), 0
  );
  const totalExpenses = (exps || []).reduce(
    (a: number, e: any) => a + (Number(e.amount) || 0), 0
  );
  const totalCosts = (costs || []).reduce(
    (a: number, c: any) =>
      a + (Number(c.salary) || 0) + (Number(c.commission) || 0) +
      (Number(c.bonus) || 0) - (Number(c.deduction) || 0),
    0
  );
  const netProfit = totalRevenue - totalExpenses - totalCosts;

  return {
    metrics: {
      total_revenue: totalRevenue,
      total_expenses: totalExpenses,
      team_costs: totalCosts,
      net_profit: netProfit,
      margin_pct: totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0,
    },
    breakdown: [],
  };
};

const calcServiceStatus: Calculator = async (sb, userId, start, end) => {
  const { data } = await sb
    .from("conversations")
    .select("id, status, created_at")
    .eq("user_id", userId)
    .gte("created_at", start + "T00:00:00")
    .lte("created_at", end + "T23:59:59");
  const items = data || [];
  const open = items.filter((c: any) => c.status === "open").length;
  const pending = items.filter((c: any) => c.status === "pending").length;
  const resolved = items.filter(
    (c: any) => c.status === "resolved" || c.status === "closed"
  ).length;
  const total = items.length;

  const byDate: Record<string, { open: number; pending: number; resolved: number }> = {};
  items.forEach((c: any) => {
    const d = c.created_at?.split("T")[0] || "unknown";
    if (!byDate[d]) byDate[d] = { open: 0, pending: 0, resolved: 0 };
    if (c.status === "open") byDate[d].open++;
    else if (c.status === "pending") byDate[d].pending++;
    else byDate[d].resolved++;
  });

  return {
    metrics: {
      open,
      pending,
      resolved,
      total,
      resolution_rate: total > 0 ? Math.round((resolved / total) * 100) : 0,
    },
    breakdown: Object.entries(byDate)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
};

/** Uses conversations.sentiment_score as satisfaction proxy since contacts.nps doesn't exist */
const calcSatisfactionIndex: Calculator = async (sb, userId, start, end) => {
  const { data } = await sb
    .from("conversations")
    .select("id, sentiment_score, created_at")
    .eq("user_id", userId)
    .not("sentiment_score", "is", null)
    .gte("created_at", start + "T00:00:00")
    .lte("created_at", end + "T23:59:59");
  const items = data || [];
  const total = items.length;

  const avgScore =
    total > 0
      ? Number(
          (items.reduce((a: number, c: any) => a + (Number(c.sentiment_score) || 0), 0) / total).toFixed(1)
        )
      : 0;

  // Categorize by score
  const byRating = {
    excelente: items.filter((c: any) => Number(c.sentiment_score) >= 8).length,
    bom: items.filter((c: any) => Number(c.sentiment_score) >= 6 && Number(c.sentiment_score) < 8).length,
    regular: items.filter((c: any) => Number(c.sentiment_score) >= 4 && Number(c.sentiment_score) < 6).length,
    ruim: items.filter((c: any) => Number(c.sentiment_score) < 4).length,
  };

  const byDate: Record<string, { sum: number; count: number }> = {};
  items.forEach((c: any) => {
    const d = c.created_at?.split("T")[0] || "unknown";
    if (!byDate[d]) byDate[d] = { sum: 0, count: 0 };
    byDate[d].sum += Number(c.sentiment_score) || 0;
    byDate[d].count++;
  });

  return {
    metrics: { avg_score: avgScore, total_responses: total, by_rating: byRating },
    breakdown: Object.entries(byDate)
      .map(([date, d]) => ({
        date,
        avg_score: Number((d.sum / d.count).toFixed(1)),
        count: d.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
};

const calcAgentsPerformance: Calculator = async (sb, userId, start, end) => {
  const { data: members } = await sb
    .from("team_members")
    .select("id, name, auth_user_id")
    .eq("user_id", userId);
  const agents = members || [];

  const { data: convs } = await sb
    .from("conversations")
    .select("id, assigned_agent_id, status")
    .eq("user_id", userId)
    .gte("created_at", start + "T00:00:00")
    .lte("created_at", end + "T23:59:59");
  const conversations = convs || [];

  const { data: rts } = await sb
    .from("response_times")
    .select("conversation_id, response_duration_seconds")
    .gte("created_at", start + "T00:00:00")
    .lte("created_at", end + "T23:59:59");
  const responseTimes = rts || [];

  const rtMap: Record<string, number[]> = {};
  responseTimes.forEach((rt: any) => {
    if (!rtMap[rt.conversation_id]) rtMap[rt.conversation_id] = [];
    rtMap[rt.conversation_id].push(Number(rt.response_duration_seconds) || 0);
  });

  let totalResolved = 0;
  let totalAvgTime = 0;
  let agentCount = 0;

  const breakdown = agents.map((agent: any) => {
    const agentConvs = conversations.filter(
      (c: any) => c.assigned_agent_id === agent.id
    );
    const resolved = agentConvs.filter(
      (c: any) => c.status === "resolved" || c.status === "closed"
    ).length;
    const pending = agentConvs.filter((c: any) => c.status === "pending").length;

    const agentRts: number[] = [];
    agentConvs.forEach((c: any) => {
      if (rtMap[c.id]) agentRts.push(...rtMap[c.id]);
    });
    const avgTime =
      agentRts.length > 0
        ? Math.round(agentRts.reduce((a, b) => a + b, 0) / agentRts.length / 60)
        : 0;

    totalResolved += resolved;
    if (avgTime > 0) { totalAvgTime += avgTime; agentCount++; }

    return { agent_name: agent.name, resolved, pending, avg_time: avgTime };
  });

  return {
    metrics: {
      total_agents: agents.length,
      avg_response_time_min: agentCount > 0 ? Math.round(totalAvgTime / agentCount) : 0,
      total_resolved: totalResolved,
    },
    breakdown,
  };
};

const calcProfessionalsPerformance: Calculator = async (sb, userId, start, end) => {
  const { data: profs } = await sb
    .from("professionals")
    .select("id, name")
    .eq("user_id", userId);
  const professionals = profs || [];

  const { data: delivs } = await sb
    .from("deliveries")
    .select("id, professional_id, stage")
    .eq("user_id", userId)
    .gte("created_at", start + "T00:00:00")
    .lte("created_at", end + "T23:59:59");
  const deliveries = delivs || [];

  const { data: appts } = await sb
    .from("appointments")
    .select("id, professional_id, price")
    .eq("user_id", userId)
    .gte("start_time", start + "T00:00:00")
    .lte("start_time", end + "T23:59:59");
  const appointments = appts || [];

  const totalProcedures = deliveries.filter(
    (d: any) => d.stage === "procedimento_concluido"
  ).length;

  const breakdown = professionals.map((p: any) => {
    const profDeliveries = deliveries.filter((d: any) => d.professional_id === p.id);
    const done = profDeliveries.filter((d: any) => d.stage === "procedimento_concluido").length;
    const profAppts = appointments.filter((a: any) => a.professional_id === p.id);
    const revenue = profAppts.reduce(
      (acc: number, a: any) => acc + (Number(a.price) || 0), 0
    );
    return { name: p.name, procedures_done: done, appointments: profAppts.length, revenue };
  });

  return {
    metrics: {
      total_professionals: professionals.length,
      total_procedures: totalProcedures,
      avg_per_professional:
        professionals.length > 0 ? Math.round(totalProcedures / professionals.length) : 0,
    },
    breakdown,
  };
};

const calcAppointments: Calculator = async (sb, userId, start, end) => {
  const { data } = await sb
    .from("appointments")
    .select("id, type, professional_id, start_time, attendance_status")
    .eq("user_id", userId)
    .gte("start_time", start + "T00:00:00")
    .lte("start_time", end + "T23:59:59");
  const items = data || [];
  const total = items.length;
  const byType = {
    appointment: items.filter((a: any) => a.type === "appointment").length,
    absence: items.filter((a: any) => a.type === "absence").length,
  };
  const byDate: Record<string, number> = {};
  items.forEach((a: any) => {
    const d = a.start_time?.split("T")[0] || "unknown";
    byDate[d] = (byDate[d] || 0) + 1;
  });

  return {
    metrics: { total, by_type: byType },
    breakdown: Object.entries(byDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
};

const calcClientsPerQueue: Calculator = async (sb, userId, start, end) => {
  const { data: queues } = await sb
    .from("queues")
    .select("id, name")
    .eq("user_id", userId);
  const queueList = queues || [];

  const { data: convs } = await sb
    .from("conversations")
    .select("id, queue_id")
    .eq("user_id", userId)
    .gte("created_at", start + "T00:00:00")
    .lte("created_at", end + "T23:59:59");
  const conversations = convs || [];
  const total = conversations.length;

  const breakdown = queueList.map((q: any) => {
    const count = conversations.filter((c: any) => c.queue_id === q.id).length;
    return {
      queue_name: q.name,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });

  const noQueue = conversations.filter((c: any) => !c.queue_id).length;
  if (noQueue > 0)
    breakdown.push({
      queue_name: "Sem fila",
      count: noQueue,
      pct: total > 0 ? Math.round((noQueue / total) * 100) : 0,
    });

  return {
    metrics: {
      total_queues: queueList.length,
      total_clients: total,
      avg_per_queue: queueList.length > 0 ? Math.round(total / queueList.length) : 0,
    },
    breakdown,
  };
};

const calcTopProducts: Calculator = async (sb, userId, start, end) => {
  // Get won stage IDs to filter won deals
  const wonStageIds = await getWonStageIds(sb, userId);

  let dealIds: string[] = [];
  if (wonStageIds.length > 0) {
    const { data: deals } = await sb
      .from("crm_deals")
      .select("id")
      .eq("user_id", userId)
      .in("stage_id", wonStageIds)
      .gte("created_at", start + "T00:00:00")
      .lte("created_at", end + "T23:59:59");
    dealIds = (deals || []).map((d: any) => d.id);
  } else {
    // Fallback: all deals without loss_reason in period
    const { data: deals } = await sb
      .from("crm_deals")
      .select("id")
      .eq("user_id", userId)
      .is("loss_reason", null)
      .gte("created_at", start + "T00:00:00")
      .lte("created_at", end + "T23:59:59");
    dealIds = (deals || []).map((d: any) => d.id);
  }

  if (dealIds.length === 0)
    return { metrics: { total_products_sold: 0 }, breakdown: [] };

  const { data: products } = await sb
    .from("crm_deal_products")
    .select(
      "product_service_id, quantity, unit_price, product_service:products_services(name, type)"
    )
    .in("deal_id", dealIds);
  const items = products || [];

  const grouped: Record<
    string,
    { name: string; type: string; quantity: number; revenue: number }
  > = {};
  items.forEach((p: any) => {
    const id = p.product_service_id;
    if (!grouped[id]) {
      grouped[id] = {
        name: p.product_service?.name || "Desconhecido",
        type: p.product_service?.type || "service",
        quantity: 0,
        revenue: 0,
      };
    }
    grouped[id].quantity += Number(p.quantity) || 0;
    grouped[id].revenue +=
      (Number(p.quantity) || 0) * (Number(p.unit_price) || 0);
  });

  const breakdown = Object.values(grouped).sort((a, b) => b.revenue - a.revenue);
  const totalSold = breakdown.reduce((a, b) => a + b.quantity, 0);
  const totalRevenue = breakdown.reduce((a, b) => a + b.revenue, 0);

  return {
    metrics: {
      total_products_sold: totalSold,
      total_revenue: totalRevenue,
      top_product: breakdown.find((p) => p.type === "product")?.name || "N/A",
      top_service: breakdown.find((p) => p.type === "service")?.name || "N/A",
    },
    breakdown: breakdown.slice(0, 20),
  };
};

const calcClientEvaluation: Calculator = async (sb, userId, start, end) => {
  // Reuses satisfaction index logic (both use sentiment_score)
  return calcSatisfactionIndex(sb, userId, start, end);
};

const calcStagnatedDeals: Calculator = async (sb, userId, start, end) => {
  const { data: funnels } = await sb
    .from("crm_funnels")
    .select("id, name")
    .eq("user_id", userId);
  const funnelList = funnels || [];
  const funnelIds = funnelList.map((f: any) => f.id);
  if (funnelIds.length === 0)
    return { metrics: { total_stagnated: 0 }, breakdown: [] };

  const { data: stages } = await sb
    .from("crm_stages")
    .select("id, name, funnel_id, stagnation_limit_days")
    .in("funnel_id", funnelIds);
  const stageList = stages || [];
  const stageMap: Record<string, any> = {};
  stageList.forEach((s: any) => (stageMap[s.id] = s));

  // Exclude won and lost stages from stagnation check
  const terminalStageIds = stageList
    .filter((s: any) => /ganh|won|fechad|perd|lost/i.test(s.name))
    .map((s: any) => s.id);

  const { data: deals } = await sb
    .from("crm_deals")
    .select("id, title, stage_id, funnel_id, value, updated_at, stage_changed_at, loss_reason")
    .in("funnel_id", funnelIds)
    .eq("user_id", userId)
    .is("loss_reason", null); // Only active deals

  const now = new Date();
  const stagnated: any[] = [];

  (deals || []).forEach((d: any) => {
    // Skip won/lost stages
    if (terminalStageIds.includes(d.stage_id)) return;
    const stage = stageMap[d.stage_id];
    if (!stage || !stage.stagnation_limit_days) return;

    const lastMoved = new Date(d.stage_changed_at || d.updated_at);
    const daysDiff = Math.floor(
      (now.getTime() - lastMoved.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysDiff > stage.stagnation_limit_days) {
      const funnel = funnelList.find((f: any) => f.id === d.funnel_id);
      stagnated.push({
        deal_title: d.title,
        funnel: funnel?.name || "Desconhecido",
        stage: stage.name,
        days_stagnated: daysDiff,
        value: Number(d.value) || 0,
      });
    }
  });

  const byFunnel: Record<string, number> = {};
  stagnated.forEach((s) => {
    byFunnel[s.funnel] = (byFunnel[s.funnel] || 0) + 1;
  });

  return {
    metrics: {
      total_stagnated: stagnated.length,
      by_funnel: Object.entries(byFunnel).map(([name, count]) => ({ name, count })),
      avg_days_stagnated:
        stagnated.length > 0
          ? Math.round(
              stagnated.reduce((a, b) => a + b.days_stagnated, 0) /
                stagnated.length
            )
          : 0,
    },
    breakdown: stagnated
      .sort((a, b) => b.days_stagnated - a.days_stagnated)
      .slice(0, 50),
  };
};

const calcAvgResponseTime: Calculator = async (sb, userId, start, end) => {
  const { data: members } = await sb
    .from("team_members")
    .select("id, name")
    .eq("user_id", userId);
  const agents = members || [];

  const { data: convs } = await sb
    .from("conversations")
    .select("id, assigned_agent_id")
    .eq("user_id", userId)
    .gte("created_at", start + "T00:00:00")
    .lte("created_at", end + "T23:59:59");
  const conversations = convs || [];
  const convIds = conversations.map((c: any) => c.id);

  if (convIds.length === 0)
    return { metrics: { overall_avg_seconds: 0 }, breakdown: [] };

  const { data: rts } = await sb
    .from("response_times")
    .select("conversation_id, response_duration_seconds")
    .in("conversation_id", convIds);
  const responseTimes = rts || [];

  const overallAvg =
    responseTimes.length > 0
      ? Math.round(
          responseTimes.reduce(
            (a: number, r: any) => a + (Number(r.response_duration_seconds) || 0),
            0
          ) / responseTimes.length
        )
      : 0;

  const convAgentMap: Record<string, string> = {};
  conversations.forEach((c: any) => (convAgentMap[c.id] = c.assigned_agent_id));

  const agentRts: Record<string, number[]> = {};
  responseTimes.forEach((rt: any) => {
    const agentId = convAgentMap[rt.conversation_id];
    if (agentId) {
      if (!agentRts[agentId]) agentRts[agentId] = [];
      agentRts[agentId].push(Number(rt.response_duration_seconds) || 0);
    }
  });

  const breakdown = agents
    .map((a: any) => {
      const times = agentRts[a.id] || [];
      const avg =
        times.length > 0
          ? Math.round(times.reduce((x, y) => x + y, 0) / times.length)
          : 0;
      return { agent_name: a.name, avg_seconds: avg, total_responses: times.length };
    })
    .sort((a, b) => a.avg_seconds - b.avg_seconds);

  return {
    metrics: {
      overall_avg_seconds: overallAvg,
      fastest_agent: breakdown.filter((a) => a.avg_seconds > 0)[0]?.agent_name || "N/A",
      slowest_agent: breakdown.filter((a) => a.avg_seconds > 0).slice(-1)[0]?.agent_name || "N/A",
    },
    breakdown,
  };
};

const calcNoShowRate: Calculator = async (sb, userId, start, end) => {
  const { data } = await sb
    .from("appointments")
    .select("id, professional_id, attendance_status, type")
    .eq("user_id", userId)
    .eq("type", "appointment")
    .gte("start_time", start + "T00:00:00")
    .lte("start_time", end + "T23:59:59");
  const items = data || [];
  const total = items.length;

  const attended = items.filter((a: any) => a.attendance_status === "attended").length;
  const noShow = items.filter((a: any) => a.attendance_status === "no_show").length;
  const cancelled = items.filter((a: any) => a.attendance_status === "cancelled").length;
  const pending = items.filter((a: any) => !a.attendance_status || a.attendance_status === "pending").length;

  const { data: profs } = await sb
    .from("professionals")
    .select("id, name")
    .eq("user_id", userId);
  const professionals = profs || [];

  const breakdown = professionals.map((p: any) => {
    const profAppts = items.filter((a: any) => a.professional_id === p.id);
    const profNoShow = profAppts.filter(
      (a: any) => a.attendance_status === "no_show"
    ).length;
    return {
      professional_name: p.name,
      total: profAppts.length,
      no_show: profNoShow,
      rate:
        profAppts.length > 0
          ? Math.round((profNoShow / profAppts.length) * 100)
          : 0,
    };
  });

  const tracked = attended + noShow + cancelled;

  return {
    metrics: {
      total_appointments: total,
      attended,
      no_show: noShow,
      cancelled,
      pending,
      rate_pct: tracked > 0 ? Math.round((noShow / tracked) * 100) : 0,
    },
    breakdown,
  };
};

const calcMarketingRoi: Calculator = async (sb, userId, start, end) => {
  const { data } = await sb
    .from("marketing_campaigns")
    .select("id, name, origin, investment, leads_count, conversions_count")
    .eq("user_id", userId)
    .gte("start_date", start)
    .lte("start_date", end);
  const campaigns = data || [];

  const totalInvestment = campaigns.reduce(
    (a: number, c: any) => a + (Number(c.investment) || 0), 0
  );
  const totalLeads = campaigns.reduce(
    (a: number, c: any) => a + (Number(c.leads_count) || 0), 0
  );
  const totalConversions = campaigns.reduce(
    (a: number, c: any) => a + (Number(c.conversions_count) || 0), 0
  );
  const costPerLead = totalLeads > 0 ? Number((totalInvestment / totalLeads).toFixed(2)) : 0;

  return {
    metrics: {
      total_investment: totalInvestment,
      total_leads: totalLeads,
      total_conversions: totalConversions,
      cost_per_lead: costPerLead,
      roi_pct:
        totalInvestment > 0
          ? Math.round(((totalConversions * costPerLead - totalInvestment) / totalInvestment) * 100)
          : 0,
    },
    breakdown: campaigns.map((c: any) => ({
      campaign_name: c.name,
      origin: c.origin,
      investment: Number(c.investment) || 0,
      leads: Number(c.leads_count) || 0,
      conversions: Number(c.conversions_count) || 0,
      roi: 0,
    })),
  };
};

const calcAvgTicket: Calculator = async (sb, userId, start, end) => {
  const wonStageIds = await getWonStageIds(sb, userId);

  let deals: any[] = [];
  if (wonStageIds.length > 0) {
    const { data } = await sb
      .from("crm_deals")
      .select("id, value")
      .eq("user_id", userId)
      .in("stage_id", wonStageIds)
      .gte("created_at", start + "T00:00:00")
      .lte("created_at", end + "T23:59:59")
      .gt("value", 0);
    deals = data || [];
  } else {
    const { data } = await sb
      .from("crm_deals")
      .select("id, value")
      .eq("user_id", userId)
      .is("loss_reason", null)
      .gte("created_at", start + "T00:00:00")
      .lte("created_at", end + "T23:59:59")
      .gt("value", 0);
    deals = data || [];
  }

  const values = deals.map((d: any) => Number(d.value) || 0).sort((a: number, b: number) => a - b);
  const total = values.length;
  const totalRevenue = values.reduce((a: number, b: number) => a + b, 0);
  const avgValue = total > 0 ? Number((totalRevenue / total).toFixed(2)) : 0;
  const medianValue =
    total > 0
      ? total % 2 === 0
        ? (values[total / 2 - 1] + values[total / 2]) / 2
        : values[Math.floor(total / 2)]
      : 0;

  const ranges = [
    { label: "R$0-100", min: 0, max: 100 },
    { label: "R$100-500", min: 100, max: 500 },
    { label: "R$500-1000", min: 500, max: 1000 },
    { label: "R$1000-5000", min: 1000, max: 5000 },
    { label: "R$5000+", min: 5000, max: Infinity },
  ];

  return {
    metrics: {
      avg_value: avgValue,
      median_value: medianValue,
      total_deals: total,
      total_revenue: totalRevenue,
    },
    breakdown: ranges.map((r) => ({
      range: r.label,
      count: values.filter((v: number) => v >= r.min && v < r.max).length,
    })),
  };
};

const calcChurn: Calculator = async (sb, userId, start, end) => {
  const { data: contacts } = await sb
    .from("contacts")
    .select("id, created_at")
    .eq("user_id", userId);
  const allContacts = contacts || [];

  const { data: recentConvs } = await sb
    .from("conversations")
    .select("contact_id")
    .eq("user_id", userId)
    .gte("created_at", start + "T00:00:00")
    .lte("created_at", end + "T23:59:59");
  const activeContactIds = new Set(
    (recentConvs || []).map((c: any) => c.contact_id)
  );
  const totalActive = activeContactIds.size;
  const totalInactive = allContacts.length - totalActive;
  const churnRate =
    allContacts.length > 0
      ? Math.round((totalInactive / allContacts.length) * 100)
      : 0;

  return {
    metrics: {
      total_active: totalActive,
      total_inactive: totalInactive,
      churn_rate: churnRate,
      retention_rate: 100 - churnRate,
    },
    breakdown: [],
  };
};

// ==================== CALCULATOR MAP ====================
const calculators: Record<string, Calculator> = {
  delivery_funnel: calcDeliveryFunnel,
  qualification_funnel: calcCrmFunnel("Qualifica"),
  ai_service: calcAiService,
  recurrence: calcCrmFunnel("Recorr"),
  new_leads: calcNewLeads,
  leads_conversions: calcLeadsConversions,
  recurrence_conversion: calcRecurrenceConversion,
  revenue: calcRevenue,
  service_status: calcServiceStatus,
  satisfaction_index: calcSatisfactionIndex,
  agents_performance: calcAgentsPerformance,
  professionals_performance: calcProfessionalsPerformance,
  appointments: calcAppointments,
  clients_per_queue: calcClientsPerQueue,
  top_products: calcTopProducts,
  client_evaluation: calcClientEvaluation,
  stagnated_deals: calcStagnatedDeals,
  avg_response_time: calcAvgResponseTime,
  no_show_rate: calcNoShowRate,
  marketing_roi: calcMarketingRoi,
  avg_ticket: calcAvgTicket,
  churn: calcChurn,
};

// ==================== PERIOD HELPERS ====================
function getPeriod(frequency: string): { start: string; end: string } {
  const now = new Date();
  if (frequency === "daily") {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const d = yesterday.toISOString().split("T")[0];
    return { start: d, end: d };
  }
  if (frequency === "weekly") {
    const end = new Date(now);
    end.setDate(end.getDate() - ((end.getDay() + 1) % 7) - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    };
  }
  // monthly: last full month
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    start: lastMonth.toISOString().split("T")[0],
    end: lastDay.toISOString().split("T")[0],
  };
}

function getPreviousPeriod(
  frequency: string,
  start: string,
  end: string
): { start: string; end: string } {
  if (frequency === "daily") {
    const d = new Date(start);
    d.setDate(d.getDate() - 7);
    const s = d.toISOString().split("T")[0];
    return { start: s, end: s };
  }
  if (frequency === "weekly") {
    const s = new Date(start);
    s.setDate(s.getDate() - 7);
    const e = new Date(end);
    e.setDate(e.getDate() - 7);
    return {
      start: s.toISOString().split("T")[0],
      end: e.toISOString().split("T")[0],
    };
  }
  // monthly: same month previous year
  const s = new Date(start);
  s.setFullYear(s.getFullYear() - 1);
  const e = new Date(end);
  e.setFullYear(e.getFullYear() - 1);
  return {
    start: s.toISOString().split("T")[0],
    end: e.toISOString().split("T")[0],
  };
}

// ==================== MAIN HANDLER ====================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const frequency = body.frequency || "daily";
    // Allow period override for manual invocations
    const period = body.period_start && body.period_end
      ? { start: body.period_start, end: body.period_end }
      : getPeriod(frequency);
    const prevPeriod = getPreviousPeriod(frequency, period.start, period.end);

    // Get all users with active report preferences
    const { data: prefs, error: prefsError } = await sb
      .from("report_preferences")
      .select("user_id, active_types")
      .not("active_types", "eq", "{}");

    if (prefsError) throw new Error(`Failed to get preferences: ${prefsError.message}`);
    if (!prefs || prefs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active preferences found", generated: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalGenerated = 0;

    for (const pref of prefs) {
      const userId = pref.user_id;
      const activeTypes: string[] = pref.active_types || [];
      if (activeTypes.length === 0) continue;

      const { data: nextNum } = await sb.rpc("get_next_report_number", {
        p_user_id: userId,
      });
      let reportNumber = nextNum || 1;

      for (const reportType of activeTypes) {
        const calc = calculators[reportType];
        if (!calc) {
          console.warn(`Unknown report type: ${reportType}`);
          continue;
        }

        try {
          const currentData = await calc(sb, userId, period.start, period.end);
          const previousData = await calc(sb, userId, prevPeriod.start, prevPeriod.end);

          const { error: insertError } = await sb
            .from("strategic_reports")
            .insert({
              user_id: userId,
              report_number: reportNumber,
              report_type: reportType,
              frequency,
              period_start: period.start,
              period_end: period.end,
              data: currentData,
              previous_data: previousData,
              status: "completed",
            });

          if (insertError) {
            console.error(`Error inserting report ${reportType} for ${userId}:`, insertError);
            continue;
          }

          reportNumber++;
          if (reportNumber > 9999) reportNumber = 1;
          totalGenerated++;
        } catch (calcError) {
          console.error(`Error calculating ${reportType} for ${userId}:`, calcError);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        generated: totalGenerated,
        frequency,
        period,
        users_processed: prefs.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[generate-strategic-reports] Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
