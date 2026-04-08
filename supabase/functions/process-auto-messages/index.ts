import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WINDOW_MINUTES = 15;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extrai data de query Supabase, protegendo contra null (data: null em caso de erro) */
function safeRows(result: { data: any[] | null }): any[] {
  return result.data ?? [];
}

function applyVariables(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (msg, [key, val]) => msg.replaceAll(`{${key}}`, val ?? ""),
    template
  );
}

function firstName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim().split(/\s+/)[0] || "";
}

function formatDate(dt: string): string {
  return new Date(dt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });
}

function formatTime(dt: string): string {
  return new Date(dt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

function normalizePhone(raw: string): string {
  if (raw.includes("@")) return raw.split("@")[0];
  return raw.replace(/\D/g, "");
}

/** Hora e minuto atual em Brasília */
function getBrasiliaTime(): { hour: number; minute: number } {
  const now = new Date();
  const brTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return { hour: brTime.getHours(), minute: brTime.getMinutes() };
}

/** Data atual em Brasília */
function getBrasiliaDate(): { month: number; day: number } {
  const now = new Date();
  const brTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return { month: brTime.getMonth() + 1, day: brTime.getDate() };
}

/** Verifica se o horário atual está dentro da janela de envio (15 min) */
function isInSendWindow(sendHour: number, sendMinute: number): boolean {
  const { hour, minute } = getBrasiliaTime();
  const nowTotal = hour * 60 + minute;
  const targetTotal = sendHour * 60 + sendMinute;
  return nowTotal >= targetTotal && nowTotal < targetTotal + WINDOW_MINUTES;
}

// ─── UZAPI sender ────────────────────────────────────────────────────────────

async function sendWhatsApp(
  serverUrl: string,
  _instanceName: string,
  apikey: string,
  number: string,
  text: string
): Promise<any> {
  const phone = normalizePhone(number);
  const url = `${serverUrl}/send/text`;
  console.log(`[send] ${url} → ${phone}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "token": apikey,
      },
      body: JSON.stringify({
        number: phone,
        text,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[send] Error ${resp.status}:`, errText);
      throw new Error(`UZAPI error: ${errText}`);
    }

    return await resp.json();
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") throw new Error("UZAPI timeout after 10s");
    throw e;
  }
}

/** Envia pesquisa de satisfação via send-satisfaction-survey edge function */
async function sendSatisfactionSurvey(
  contactId: string,
  contactNumber: string,
  conversationId: string,
  instanceId: string | null
) {
  const url = `${SUPABASE_URL}/functions/v1/send-satisfaction-survey`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      contact_id: contactId,
      contact_number: contactNumber,
      conversation_id: conversationId,
      instance_id: instanceId,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[satisfaction] Error:`, errText);
  }
  return resp.ok;
}

async function saveMessage(
  supabase: any,
  conversationId: string | null,
  ownerId: string,
  body: string
) {
  if (!conversationId) return;
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: ownerId,
    direction: "outbound",
    body,
    message_type: "text",
    status: "sent",
  });
}

async function logSent(supabase: any, autoMessageId: string, entityType: string, entityId: string) {
  try {
    await supabase.from("auto_message_logs").insert({
      auto_message_id: autoMessageId,
      entity_type: entityType,
      entity_id: entityId,
    });
  } catch {
    // Duplicate ignored (unique constraint)
  }
}

async function alreadySent(supabase: any, autoMessageId: string, entityId: string): Promise<boolean> {
  const { data } = await supabase
    .from("auto_message_logs")
    .select("id")
    .eq("auto_message_id", autoMessageId)
    .eq("entity_id", entityId)
    .maybeSingle();
  return !!data;
}

async function alreadySentThisYear(supabase: any, autoMessageId: string, entityId: string): Promise<boolean> {
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from("auto_message_logs")
    .select("id")
    .eq("auto_message_id", autoMessageId)
    .eq("entity_id", entityId)
    .gte("sent_at", `${year}-01-01`)
    .lte("sent_at", `${year}-12-31`)
    .maybeSingle();
  return !!data;
}

/** Busca instância: usa instance_id da config se disponível, senão primeira conectada do owner */
async function getInstance(supabase: any, userId: string, instanceId?: string | null) {
  // Se a config tem instance_id específico, usar esse
  if (instanceId) {
    const { data } = await supabase
      .from("instances")
      .select("id, server_url, apikey, instance_name, status")
      .eq("id", instanceId)
      .eq("status", "connected")
      .maybeSingle();
    if (data) return data;
    console.warn(`[instance] Configured instance ${instanceId} not connected, falling back`);
  }

  // Fallback: primeira instância conectada do owner
  const { data } = await supabase
    .from("instances")
    .select("id, server_url, apikey, instance_name, status")
    .eq("user_id", userId)
    .eq("status", "connected")
    .limit(1)
    .maybeSingle();
  return data;
}

/** Busca conversa ativa entre contato e instância */
async function findConversation(supabase: any, contactId: string, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .eq("contact_id", contactId)
    .eq("user_id", userId)
    .in("status", ["pending", "open", "resolved"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

// ─── Targeted mode (instant trigger from DB) ────────────────────────────────

async function processTargeted(
  supabase: any,
  params: { trigger_type: string; entity_id: string; auto_message_id: string }
): Promise<Response> {
  const { trigger_type, entity_id, auto_message_id } = params;
  console.log(`[targeted] ${trigger_type} for entity ${entity_id}, config ${auto_message_id}`);

  try {
    // Load config
    const { data: cfg } = await supabase
      .from("auto_messages")
      .select("*")
      .eq("id", auto_message_id)
      .eq("is_active", true)
      .maybeSingle();

    if (!cfg) {
      console.log("[targeted] Config not found or inactive");
      return new Response(JSON.stringify({ processed: 0, reason: "config_inactive" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check dedup
    if (await alreadySent(supabase, cfg.id, entity_id)) {
      console.log("[targeted] Already sent");
      return new Response(JSON.stringify({ processed: 0, reason: "already_sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get instance
    const instance = await getInstance(supabase, cfg.user_id, cfg.instance_id);
    if (!instance) {
      console.error("[targeted] No connected instance found");
      return new Response(JSON.stringify({ processed: 0, reason: "no_instance" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CRM STAGE ENTER (instant) ──
    if (trigger_type === "crm_stage_enter") {
      const { data: deal } = await supabase
        .from("crm_deals")
        .select("id, contact_id, stage_id, contacts(push_name, number), crm_stages(name), crm_funnels(name)")
        .eq("id", entity_id)
        .maybeSingle();

      if (!deal) {
        console.error("[targeted] Deal not found:", entity_id);
        return new Response(JSON.stringify({ processed: 0, reason: "deal_not_found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const phone = (deal.contacts as any)?.number;
      if (!phone) {
        console.error("[targeted] Contact has no phone number");
        return new Response(JSON.stringify({ processed: 0, reason: "no_phone" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const dealContactName = (deal.contacts as any)?.push_name ?? "";
      const msg = applyVariables(cfg.message, {
        nome_cliente: dealContactName,
        primeiro_nome: firstName(dealContactName),
        nome_etapa: (deal.crm_stages as any)?.name ?? "",
        nome_funil: (deal.crm_funnels as any)?.name ?? "",
      });

      await sendWhatsApp(instance.server_url, instance.instance_name, instance.apikey, phone, msg);
      const convId = await findConversation(supabase, deal.contact_id, cfg.user_id);
      await saveMessage(supabase, convId, cfg.user_id, msg);
      await logSent(supabase, cfg.id, "deal", deal.id);

      console.log(`[targeted] CRM message sent to ${normalizePhone(phone)}`);
      return new Response(JSON.stringify({ processed: 1, trigger_type }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── APPOINTMENT triggers (instant) ──
    if (trigger_type === "appointment_created" || trigger_type === "appointment_cancelled") {
      const { data: appt } = await supabase
        .from("appointments")
        .select("id, start_time, contact_id, contacts(push_name, number), professionals(name), products_services(name)")
        .eq("id", entity_id)
        .maybeSingle();

      if (!appt) {
        return new Response(JSON.stringify({ processed: 0, reason: "appointment_not_found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const phone = (appt.contacts as any)?.number;
      if (!phone) {
        return new Response(JSON.stringify({ processed: 0, reason: "no_phone" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const apptContactName = (appt.contacts as any)?.push_name ?? "";
      const msg = applyVariables(cfg.message, {
        nome_cliente: apptContactName,
        primeiro_nome: firstName(apptContactName),
        data_agendamento: formatDate(appt.start_time),
        hora_agendamento: formatTime(appt.start_time),
        nome_profissional: (appt.professionals as any)?.name ?? "",
        nome_servico: (appt.products_services as any)?.name ?? "",
      });

      await sendWhatsApp(instance.server_url, instance.instance_name, instance.apikey, phone, msg);
      const convId = await findConversation(supabase, appt.contact_id, cfg.user_id);
      await saveMessage(supabase, convId, cfg.user_id, msg);
      await logSent(supabase, cfg.id, "appointment", appt.id);

      console.log(`[targeted] Appointment message sent to ${normalizePhone(phone)}`);
      return new Response(JSON.stringify({ processed: 1, trigger_type }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── SATISFACTION SURVEY (instant) ──
    if (trigger_type === "conversation_resolved") {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id, contact_id, instance_id, contacts(push_name, number)")
        .eq("id", entity_id)
        .maybeSingle();

      if (!conv) {
        return new Response(JSON.stringify({ processed: 0, reason: "conversation_not_found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const phone = (conv.contacts as any)?.number;
      if (!phone) {
        return new Response(JSON.stringify({ processed: 0, reason: "no_phone" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const instanceId = cfg.instance_id || conv.instance_id;
      await sendSatisfactionSurvey(conv.contact_id, phone, conv.id, instanceId);

      await supabase
        .from("conversations")
        .update({ nps_sent_at: new Date().toISOString() })
        .eq("id", conv.id);

      await logSent(supabase, cfg.id, "conversation", conv.id);

      console.log(`[targeted] Satisfaction survey sent for conversation ${conv.id}`);
      return new Response(JSON.stringify({ processed: 1, trigger_type }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ processed: 0, reason: "unsupported_trigger" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[targeted] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const now = new Date();
    const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000);

    // Check for targeted invocation (from database trigger — instant dispatch)
    const body = await req.json().catch(() => ({}));
    if (body.trigger_type && body.entity_id && body.auto_message_id) {
      return await processTargeted(supabase, body);
    }

    // ── Full cron scan mode ──────────────────────────────────────────────────

    // Carregar todas as configs ativas
    const { data: rawConfigs } = await supabase
      .from("auto_messages")
      .select("*")
      .eq("is_active", true);
    const configs = rawConfigs ?? [];

    if (!configs.length) {
      console.log("[process-auto-messages] No active configs");
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    const errors: string[] = [];

    // Agrupar por user_id
    const userIds = [...new Set(configs.map((c: any) => c.user_id))];
    console.log(`[process-auto-messages] ${configs.length} active configs for ${userIds.length} users`);

    for (const userId of userIds) {
      const userConfigs = configs.filter((c: any) => c.user_id === userId);

      try {
        // ── 1. APPOINTMENT CREATED ──────────────────────────────────────
        const apptCreatedCfg = userConfigs.find((c: any) => c.trigger_type === "appointment_created");
        if (apptCreatedCfg) {
          const instance = await getInstance(supabase, userId, apptCreatedCfg.instance_id);
          if (instance) {
            const maxAgeCreated = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const appts = safeRows(await supabase
              .from("appointments")
              .select("id, start_time, contact_id, contacts(push_name, number), professionals(name), products_services(name)")
              .eq("user_id", userId)
              .gte("created_at", maxAgeCreated.toISOString())
              .lte("created_at", now.toISOString())
              .not("contact_id", "is", null));

            for (const appt of appts) {
              try {
                if (await alreadySent(supabase, apptCreatedCfg.id, appt.id)) continue;
                const phone = (appt.contacts as any)?.number;
                if (!phone) continue;
                const cn1 = (appt.contacts as any)?.push_name ?? "";
                const msg = applyVariables(apptCreatedCfg.message, {
                  nome_cliente: cn1,
                  primeiro_nome: firstName(cn1),
                  data_agendamento: formatDate(appt.start_time),
                  hora_agendamento: formatTime(appt.start_time),
                  nome_profissional: (appt.professionals as any)?.name ?? "",
                  nome_servico: (appt.products_services as any)?.name ?? "",
                });
                await sendWhatsApp(instance.server_url, instance.instance_name, instance.apikey, phone, msg);
                const convId = await findConversation(supabase, appt.contact_id, userId);
                await saveMessage(supabase, convId, userId, msg);
                await logSent(supabase, apptCreatedCfg.id, "appointment", appt.id);
                processed++;
              } catch (e: any) {
                errors.push(`appt_created ${appt.id}: ${e.message}`);
              }
            }
          }
        }

        // ── 2. APPOINTMENT REMINDER / DAY REMINDER ──────────────────────
        for (const reminderType of ["appointment_reminder", "appointment_day_reminder"]) {
          const cfg = userConfigs.find((c: any) => c.trigger_type === reminderType);
          if (!cfg) continue;
          const instance = await getInstance(supabase, userId, cfg.instance_id);
          if (!instance) continue;

          const hoursVal = cfg.timing_value || (reminderType === "appointment_reminder" ? 24 : 2);
          // ✅ BROAD WINDOW: busca TODOS os agendamentos que começam nas próximas hoursVal horas.
          // Deduplicação via auto_message_logs impede envio duplicado.
          // Assim, o primeiro ciclo do cron que detectar o agendamento na janela envia;
          // todos os ciclos seguintes pulam via alreadySent().
          const windowEnd = new Date(now.getTime() + hoursVal * 60 * 60 * 1000);

          console.log(`[${reminderType}] Buscando agendamentos entre NOW (${now.toISOString()}) e ${windowEnd.toISOString()} (${hoursVal}h)`);

          const appts = safeRows(await supabase
            .from("appointments")
            .select("id, start_time, contact_id, contacts(push_name, number), professionals(name), products_services(name)")
            .eq("user_id", userId)
            .gte("start_time", now.toISOString())
            .lte("start_time", windowEnd.toISOString())
            .in("status", ["confirmed", "pending"])
            .not("contact_id", "is", null));

          console.log(`[${reminderType}] Encontrados ${appts.length} agendamentos na janela`);

          for (const appt of appts) {
            try {
              if (await alreadySent(supabase, cfg.id, appt.id)) continue;
              const phone = (appt.contacts as any)?.number;
              if (!phone) continue;
              const cn2 = (appt.contacts as any)?.push_name ?? "";
              const msg = applyVariables(cfg.message, {
                nome_cliente: cn2,
                primeiro_nome: firstName(cn2),
                data_agendamento: formatDate(appt.start_time),
                hora_agendamento: formatTime(appt.start_time),
                nome_profissional: (appt.professionals as any)?.name ?? "",
                nome_servico: (appt.products_services as any)?.name ?? "",
              });
              await sendWhatsApp(instance.server_url, instance.instance_name, instance.apikey, phone, msg);
              const convId = await findConversation(supabase, appt.contact_id, userId);
              await saveMessage(supabase, convId, userId, msg);
              await logSent(supabase, cfg.id, "appointment", appt.id);
              processed++;
            } catch (e: any) {
              errors.push(`${reminderType} ${appt.id}: ${e.message}`);
            }
          }
        }

        // ── 3. APPOINTMENT CANCELLED ────────────────────────────────────
        const cancelledCfg = userConfigs.find((c: any) => c.trigger_type === "appointment_cancelled");
        if (cancelledCfg) {
          const instance = await getInstance(supabase, userId, cancelledCfg.instance_id);
          if (instance) {
            const maxAgeCancelled = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const appts = safeRows(await supabase
              .from("appointments")
              .select("id, start_time, updated_at, contact_id, contacts(push_name, number), professionals(name)")
              .eq("user_id", userId)
              .eq("status", "canceled")
              .gte("updated_at", maxAgeCancelled.toISOString())
              .lte("updated_at", now.toISOString())
              .not("contact_id", "is", null));

            for (const appt of appts) {
              try {
                if (await alreadySent(supabase, cancelledCfg.id, appt.id)) continue;
                const phone = (appt.contacts as any)?.number;
                if (!phone) continue;
                const cn3 = (appt.contacts as any)?.push_name ?? "";
                const msg = applyVariables(cancelledCfg.message, {
                  nome_cliente: cn3,
                  primeiro_nome: firstName(cn3),
                  data_agendamento: formatDate(appt.start_time),
                  hora_agendamento: formatTime(appt.start_time),
                  nome_profissional: (appt.professionals as any)?.name ?? "",
                });
                await sendWhatsApp(instance.server_url, instance.instance_name, instance.apikey, phone, msg);
                const convId = await findConversation(supabase, appt.contact_id, userId);
                await saveMessage(supabase, convId, userId, msg);
                await logSent(supabase, cancelledCfg.id, "appointment", appt.id);
                processed++;
              } catch (e: any) {
                errors.push(`appt_cancelled ${appt.id}: ${e.message}`);
              }
            }
          }
        }

        // ── 4. APPOINTMENT POST-SERVICE ─────────────────────────────────
        const postSvcCfg = userConfigs.find((c: any) => c.trigger_type === "appointment_post_service");
        if (postSvcCfg) {
          const instance = await getInstance(supabase, userId, postSvcCfg.instance_id);
          if (instance) {
            const hoursVal = postSvcCfg.timing_value || 2;
            // ✅ BROAD WINDOW: busca agendamentos completados há pelo menos hoursVal horas.
            // Limita a 7 dias para não escanear histórico inteiro.
            // Deduplicação via auto_message_logs impede envio duplicado.
            const cutoff = new Date(now.getTime() - hoursVal * 60 * 60 * 1000);
            const maxAge = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

            console.log(`[post_service] Buscando completados entre ${maxAge.toISOString()} e ${cutoff.toISOString()} (${hoursVal}h após)`);

            const appts = safeRows(await supabase
              .from("appointments")
              .select("id, start_time, updated_at, contact_id, contacts(push_name, number), professionals(name), products_services(name)")
              .eq("user_id", userId)
              .eq("status", "completed")
              .gte("updated_at", maxAge.toISOString())
              .lte("updated_at", cutoff.toISOString())
              .not("contact_id", "is", null));

            console.log(`[post_service] Encontrados ${appts.length} agendamentos completados na janela`);

            for (const appt of appts) {
              try {
                if (await alreadySent(supabase, postSvcCfg.id, appt.id)) continue;
                const phone = (appt.contacts as any)?.number;
                if (!phone) continue;
                const cn4 = (appt.contacts as any)?.push_name ?? "";
                const msg = applyVariables(postSvcCfg.message, {
                  nome_cliente: cn4,
                  primeiro_nome: firstName(cn4),
                  nome_profissional: (appt.professionals as any)?.name ?? "",
                  nome_servico: (appt.products_services as any)?.name ?? "",
                });
                await sendWhatsApp(instance.server_url, instance.instance_name, instance.apikey, phone, msg);
                const convId = await findConversation(supabase, appt.contact_id, userId);
                await saveMessage(supabase, convId, userId, msg);
                await logSent(supabase, postSvcCfg.id, "appointment", appt.id);
                processed++;
              } catch (e: any) {
                errors.push(`appt_post_service ${appt.id}: ${e.message}`);
              }
            }
          }
        }

        // ── 5. CRM STAGE ENTER ──────────────────────────────────────────
        const crmEnterCfgs = userConfigs.filter((c: any) => c.trigger_type === "crm_stage_enter");
        for (const cfg of crmEnterCfgs) {
          if (!cfg.stage_id) continue;
          const instance = await getInstance(supabase, userId, cfg.instance_id);
          if (!instance) continue;

          const maxAgeStageEnter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const deals = safeRows(await supabase
            .from("crm_deals")
            .select("id, contact_id, stage_id, stage_changed_at, contacts(push_name, number), crm_stages(name), crm_funnels(name)")
            .eq("user_id", userId)
            .eq("stage_id", cfg.stage_id)
            .gte("stage_changed_at", maxAgeStageEnter.toISOString())
            .lte("stage_changed_at", now.toISOString())
            .not("contact_id", "is", null));

          for (const deal of deals) {
            try {
              if (await alreadySent(supabase, cfg.id, deal.id)) continue;
              const phone = (deal.contacts as any)?.number;
              if (!phone) continue;
              const dcn1 = (deal.contacts as any)?.push_name ?? "";
              const msg = applyVariables(cfg.message, {
                nome_cliente: dcn1,
                primeiro_nome: firstName(dcn1),
                nome_etapa: (deal.crm_stages as any)?.name ?? "",
                nome_funil: (deal.crm_funnels as any)?.name ?? "",
              });
              await sendWhatsApp(instance.server_url, instance.instance_name, instance.apikey, phone, msg);
              const convId = await findConversation(supabase, deal.contact_id, userId);
              await saveMessage(supabase, convId, userId, msg);
              await logSent(supabase, cfg.id, "deal", deal.id);
              processed++;
            } catch (e: any) {
              errors.push(`crm_enter ${deal.id}: ${e.message}`);
            }
          }
        }

        // ── 6. CRM AFTER DAYS ───────────────────────────────────────────
        const crmAfterCfgs = userConfigs.filter((c: any) => c.trigger_type === "crm_after_days");
        for (const cfg of crmAfterCfgs) {
          if (!cfg.stage_id || !cfg.timing_value) continue;
          const instance = await getInstance(supabase, userId, cfg.instance_id);
          if (!instance) continue;

          const cutoffDate = new Date(now.getTime() - cfg.timing_value * 24 * 60 * 60 * 1000);

          const deals = safeRows(await supabase
            .from("crm_deals")
            .select("id, contact_id, stage_changed_at, contacts(push_name, number), crm_stages(name), crm_funnels(name)")
            .eq("user_id", userId)
            .eq("stage_id", cfg.stage_id)
            .lte("stage_changed_at", cutoffDate.toISOString())
            .not("contact_id", "is", null));

          for (const deal of deals) {
            try {
              if (await alreadySent(supabase, cfg.id, deal.id)) continue;
              const phone = (deal.contacts as any)?.number;
              if (!phone) continue;
              const dcn2 = (deal.contacts as any)?.push_name ?? "";
              const msg = applyVariables(cfg.message, {
                nome_cliente: dcn2,
                primeiro_nome: firstName(dcn2),
                nome_etapa: (deal.crm_stages as any)?.name ?? "",
                nome_funil: (deal.crm_funnels as any)?.name ?? "",
              });
              await sendWhatsApp(instance.server_url, instance.instance_name, instance.apikey, phone, msg);
              const convId = await findConversation(supabase, deal.contact_id, userId);
              await saveMessage(supabase, convId, userId, msg);
              await logSent(supabase, cfg.id, "deal", deal.id);
              processed++;
            } catch (e: any) {
              errors.push(`crm_after ${deal.id}: ${e.message}`);
            }
          }
        }

        // ── 7. CRM STAGNATION ───────────────────────────────────────────
        const crmStagCfgs = userConfigs.filter((c: any) => c.trigger_type === "crm_stagnation");
        for (const cfg of crmStagCfgs) {
          if (!cfg.stage_id || !cfg.timing_value) continue;
          const instance = await getInstance(supabase, userId, cfg.instance_id);
          if (!instance) continue;

          const stagnationCutoff = new Date(now.getTime() - cfg.timing_value * 24 * 60 * 60 * 1000);

          const deals = safeRows(await supabase
            .from("crm_deals")
            .select("id, contact_id, stage_changed_at, contacts(push_name, number), crm_stages(name), crm_funnels(name)")
            .eq("user_id", userId)
            .eq("stage_id", cfg.stage_id)
            .lt("stage_changed_at", stagnationCutoff.toISOString())
            .not("contact_id", "is", null));

          for (const deal of deals) {
            try {
              if (await alreadySent(supabase, cfg.id, deal.id)) continue;
              const phone = (deal.contacts as any)?.number;
              if (!phone) continue;
              const dcn3 = (deal.contacts as any)?.push_name ?? "";
              const msg = applyVariables(cfg.message, {
                nome_cliente: dcn3,
                primeiro_nome: firstName(dcn3),
                nome_etapa: (deal.crm_stages as any)?.name ?? "",
                nome_funil: (deal.crm_funnels as any)?.name ?? "",
              });
              await sendWhatsApp(instance.server_url, instance.instance_name, instance.apikey, phone, msg);
              const convId = await findConversation(supabase, deal.contact_id, userId);
              await saveMessage(supabase, convId, userId, msg);
              await logSent(supabase, cfg.id, "deal", deal.id);
              processed++;
            } catch (e: any) {
              errors.push(`crm_stagnation ${deal.id}: ${e.message}`);
            }
          }
        }

        // ── 8. SATISFACTION SURVEY (conversation_resolved) ──────────────
        const satisfactionCfg = userConfigs.find((c: any) => c.trigger_type === "conversation_resolved");
        if (satisfactionCfg) {
          const delayMs = (satisfactionCfg.timing_value || 0) * 60 * 1000;
          const resolvedBefore = new Date(now.getTime() - delayMs);
          const maxAgeSatisfaction = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

          const convs = safeRows(await supabase
            .from("conversations")
            .select("id, contact_id, instance_id, contacts(push_name, number)")
            .eq("user_id", userId)
            .eq("status", "resolved")
            .is("nps_sent_at", null)
            .gte("updated_at", maxAgeSatisfaction.toISOString())
            .lte("updated_at", resolvedBefore.toISOString())
            .not("contact_id", "is", null));

          for (const conv of convs) {
            try {
              if (await alreadySent(supabase, satisfactionCfg.id, conv.id)) continue;
              const phone = (conv.contacts as any)?.number;
              if (!phone) continue;

              // Usa a edge function send-satisfaction-survey (que já tem a lógica de botões)
              const instanceId = satisfactionCfg.instance_id || conv.instance_id;
              await sendSatisfactionSurvey(conv.contact_id, phone, conv.id, instanceId);

              // Marca a conversa como pesquisa enviada
              await supabase
                .from("conversations")
                .update({ nps_sent_at: now.toISOString() })
                .eq("id", conv.id);

              await logSent(supabase, satisfactionCfg.id, "conversation", conv.id);
              processed++;
            } catch (e: any) {
              errors.push(`satisfaction ${conv.id}: ${e.message}`);
            }
          }
        }

        // ── 9. PATIENT BIRTHDAY ─────────────────────────────────────────
        const birthdayCfg = userConfigs.find((c: any) => c.trigger_type === "patient_birthday");
        if (birthdayCfg) {
          const instance = await getInstance(supabase, userId, birthdayCfg.instance_id);
          if (instance) {
            const { month: todayMonth, day: todayDay } = getBrasiliaDate();
            const sendHour = birthdayCfg.send_hour ?? 9;
            const sendMinute = birthdayCfg.send_minute ?? 0;

            console.log(`[birthday] today=${todayMonth}/${todayDay}, target=${sendHour}:${sendMinute}`);

            // Só executa na janela do horário configurado (Brasília)
            if (isInSendWindow(sendHour, sendMinute)) {
              // IMPORTANT: explicit FK hint needed — patients has bidirectional FK with contacts
              const patients = safeRows(await supabase
                .from("patients")
                .select("id, nome, data_nascimento, contact_id, contacts!patients_contact_id_fkey(push_name, number)")
                .eq("user_id", userId)
                .not("data_nascimento", "is", null)
                .not("contact_id", "is", null));

              console.log(`[birthday] Found ${patients.length} patients with birthdate and contact`);

              for (const patient of patients) {
                try {
                  const bDate = new Date(patient.data_nascimento + "T12:00:00");
                  if (bDate.getMonth() + 1 !== todayMonth || bDate.getDate() !== todayDay) continue;
                  if (await alreadySentThisYear(supabase, birthdayCfg.id, patient.id)) continue;

                  const phone = (patient.contacts as any)?.number;
                  if (!phone) continue;

                  console.log(`[birthday] Sending to patient ${patient.id} (${patient.nome})`);

                  const patientName = patient.nome ?? (patient.contacts as any)?.push_name ?? "";
                  const msg = applyVariables(birthdayCfg.message, {
                    nome_paciente: patientName,
                    primeiro_nome: firstName(patientName),
                  });
                  await sendWhatsApp(instance.server_url, instance.instance_name, instance.apikey, phone, msg);
                  const convId = await findConversation(supabase, patient.contact_id, userId);
                  await saveMessage(supabase, convId, userId, msg);
                  await logSent(supabase, birthdayCfg.id, "patient", patient.id);
                  processed++;
                } catch (e: any) {
                  errors.push(`birthday ${patient.id}: ${e.message}`);
                }
              }
            }
          }
        }
      } catch (userError: any) {
        console.error(`[process-auto-messages] Error for user ${userId}:`, userError);
        errors.push(`user ${userId}: ${userError.message}`);
      }
    }

    console.log(`[process-auto-messages] Done. Processed: ${processed}, Errors: ${errors.length}`);

    return new Response(
      JSON.stringify({ processed, errors: errors.length, error_details: errors.slice(0, 10), ts: now.toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[process-auto-messages]", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
