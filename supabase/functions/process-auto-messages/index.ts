import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UZAPI_URL = "https://clinvia.uazapi.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WINDOW_MINUTES = 15; // frequência do cron

// ─── Helpers ─────────────────────────────────────────────────────────────────

function applyVariables(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (msg, [key, val]) => msg.replaceAll(`{${key}}`, val ?? ""),
    template
  );
}

function formatDate(dt: string): string {
  const d = new Date(dt);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTime(dt: string): string {
  const d = new Date(dt);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "");
}

async function sendWhatsApp(instanceApiKey: string, number: string, text: string) {
  const phone = normalizePhone(number);
  await fetch(`${UZAPI_URL}/send/text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "token": instanceApiKey,
    },
    body: JSON.stringify({ number: phone, text }),
  });
}

async function saveMessage(
  supabase: any,
  conversationId: string | null,
  contactId: string | null,
  instanceId: string | null,
  ownerId: string,
  body: string
) {
  if (!conversationId) return;
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    contact_id: contactId,
    instance_id: instanceId,
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

async function getActiveInstance(supabase: any, userId: string) {
  const { data } = await supabase
    .from("instances")
    .select("id, apikey, instance_name")
    .eq("user_id", userId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  return data;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const now = new Date();
    const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60 * 1000);

    // Carregar todas as configs ativas
    const { data: configs = [] } = await supabase
      .from("auto_messages")
      .select("*")
      .eq("is_active", true);

    if (!configs.length) {
      return new Response(JSON.stringify({ processed: 0 }), { headers: corsHeaders });
    }

    let processed = 0;

    // Agrupar por user_id para buscar instância uma vez por owner
    const userIds = [...new Set(configs.map((c: any) => c.user_id))];

    for (const userId of userIds) {
      const userConfigs = configs.filter((c: any) => c.user_id === userId);
      const instance = await getActiveInstance(supabase, userId);

      // ── 1. APPOINTMENT CREATED ────────────────────────────────────────────
      const apptCreatedCfg = userConfigs.find((c: any) => c.trigger_type === "appointment_created");
      if (apptCreatedCfg) {
        const { data: appts = [] } = await supabase
          .from("appointments")
          .select("id, start_time, contact_id, contacts(push_name, telefone), professionals(name), products_services(name)")
          .eq("user_id", userId)
          .gte("created_at", windowStart.toISOString())
          .lte("created_at", now.toISOString())
          .not("contact_id", "is", null);

        for (const appt of appts) {
          if (await alreadySent(supabase, apptCreatedCfg.id, appt.id)) continue;
          const phone = (appt.contacts as any)?.telefone;
          if (!phone || !instance) continue;
          const msg = applyVariables(apptCreatedCfg.message, {
            nome_cliente: (appt.contacts as any)?.push_name ?? "",
            data_agendamento: formatDate(appt.start_time),
            hora_agendamento: formatTime(appt.start_time),
            nome_profissional: (appt.professionals as any)?.name ?? "",
            nome_servico: (appt.products_services as any)?.name ?? "",
          });
          await sendWhatsApp(instance.apikey, phone, msg);
          await logSent(supabase, apptCreatedCfg.id, "appointment", appt.id);
          processed++;
        }
      }

      // ── 2. APPOINTMENT REMINDER (X horas antes) ───────────────────────────
      for (const reminderType of ["appointment_reminder", "appointment_day_reminder"]) {
        const cfg = userConfigs.find((c: any) => c.trigger_type === reminderType);
        if (!cfg || !instance) continue;
        const hoursVal = cfg.timing_value || (reminderType === "appointment_reminder" ? 24 : 2);
        const targetStart = new Date(now.getTime() + hoursVal * 60 * 60 * 1000);
        const targetEnd = new Date(targetStart.getTime() + WINDOW_MINUTES * 60 * 1000);

        const { data: appts = [] } = await supabase
          .from("appointments")
          .select("id, start_time, contact_id, contacts(push_name, telefone), professionals(name), products_services(name)")
          .eq("user_id", userId)
          .gte("start_time", targetStart.toISOString())
          .lte("start_time", targetEnd.toISOString())
          .not("contact_id", "is", null);

        for (const appt of appts) {
          if (await alreadySent(supabase, cfg.id, appt.id)) continue;
          const phone = (appt.contacts as any)?.telefone;
          if (!phone) continue;
          const msg = applyVariables(cfg.message, {
            nome_cliente: (appt.contacts as any)?.push_name ?? "",
            data_agendamento: formatDate(appt.start_time),
            hora_agendamento: formatTime(appt.start_time),
            nome_profissional: (appt.professionals as any)?.name ?? "",
            nome_servico: (appt.products_services as any)?.name ?? "",
          });
          await sendWhatsApp(instance.apikey, phone, msg);
          await logSent(supabase, cfg.id, "appointment", appt.id);
          processed++;
        }
      }

      // ── 3. APPOINTMENT CANCELLED ──────────────────────────────────────────
      const cancelledCfg = userConfigs.find((c: any) => c.trigger_type === "appointment_cancelled");
      if (cancelledCfg && instance) {
        const { data: appts = [] } = await supabase
          .from("appointments")
          .select("id, start_time, updated_at, contact_id, contacts(push_name, telefone), professionals(name)")
          .eq("user_id", userId)
          .eq("status", "canceled")
          .gte("updated_at", windowStart.toISOString())
          .lte("updated_at", now.toISOString())
          .not("contact_id", "is", null);

        for (const appt of appts) {
          if (await alreadySent(supabase, cancelledCfg.id, appt.id)) continue;
          const phone = (appt.contacts as any)?.telefone;
          if (!phone) continue;
          const msg = applyVariables(cancelledCfg.message, {
            nome_cliente: (appt.contacts as any)?.push_name ?? "",
            data_agendamento: formatDate(appt.start_time),
            hora_agendamento: formatTime(appt.start_time),
            nome_profissional: (appt.professionals as any)?.name ?? "",
          });
          await sendWhatsApp(instance.apikey, phone, msg);
          await logSent(supabase, cancelledCfg.id, "appointment", appt.id);
          processed++;
        }
      }

      // ── 4. APPOINTMENT POST-SERVICE ───────────────────────────────────────
      const postSvcCfg = userConfigs.find((c: any) => c.trigger_type === "appointment_post_service");
      if (postSvcCfg && instance) {
        const hoursVal = postSvcCfg.timing_value || 2;
        const targetStart = new Date(now.getTime() - (hoursVal + WINDOW_MINUTES / 60) * 60 * 60 * 1000);
        const targetEnd = new Date(now.getTime() - hoursVal * 60 * 60 * 1000);

        const { data: appts = [] } = await supabase
          .from("appointments")
          .select("id, start_time, updated_at, contact_id, contacts(push_name, telefone), professionals(name), products_services(name)")
          .eq("user_id", userId)
          .eq("status", "completed")
          .gte("updated_at", targetStart.toISOString())
          .lte("updated_at", targetEnd.toISOString())
          .not("contact_id", "is", null);

        for (const appt of appts) {
          if (await alreadySent(supabase, postSvcCfg.id, appt.id)) continue;
          const phone = (appt.contacts as any)?.telefone;
          if (!phone) continue;
          const msg = applyVariables(postSvcCfg.message, {
            nome_cliente: (appt.contacts as any)?.push_name ?? "",
            nome_profissional: (appt.professionals as any)?.name ?? "",
            nome_servico: (appt.products_services as any)?.name ?? "",
          });
          await sendWhatsApp(instance.apikey, phone, msg);
          await logSent(supabase, postSvcCfg.id, "appointment", appt.id);
          processed++;
        }
      }

      // ── 5. CRM STAGE ENTER ────────────────────────────────────────────────
      const crmEnterCfgs = userConfigs.filter((c: any) => c.trigger_type === "crm_stage_enter");
      for (const cfg of crmEnterCfgs) {
        if (!cfg.stage_id || !instance) continue;
        const { data: deals = [] } = await supabase
          .from("crm_deals")
          .select("id, contact_id, stage_id, stage_changed_at, contacts(push_name, telefone), crm_stages(name), crm_funnels(name)")
          .eq("user_id", userId)
          .eq("stage_id", cfg.stage_id)
          .gte("stage_changed_at", windowStart.toISOString())
          .lte("stage_changed_at", now.toISOString())
          .not("contact_id", "is", null);

        for (const deal of deals) {
          if (await alreadySent(supabase, cfg.id, deal.id)) continue;
          const phone = (deal.contacts as any)?.telefone;
          if (!phone) continue;
          const msg = applyVariables(cfg.message, {
            nome_cliente: (deal.contacts as any)?.push_name ?? "",
            nome_etapa: (deal.crm_stages as any)?.name ?? "",
            nome_funil: (deal.crm_funnels as any)?.name ?? "",
          });
          await sendWhatsApp(instance.apikey, phone, msg);
          await logSent(supabase, cfg.id, "deal", deal.id);
          processed++;
        }
      }

      // ── 6. CRM AFTER DAYS ─────────────────────────────────────────────────
      const crmAfterCfgs = userConfigs.filter((c: any) => c.trigger_type === "crm_after_days");
      for (const cfg of crmAfterCfgs) {
        if (!cfg.stage_id || !instance || !cfg.timing_value) continue;
        const targetDate = new Date(now.getTime() - cfg.timing_value * 24 * 60 * 60 * 1000);
        const targetStart = new Date(targetDate.getTime() - WINDOW_MINUTES * 60 * 1000);

        const { data: deals = [] } = await supabase
          .from("crm_deals")
          .select("id, contact_id, stage_changed_at, contacts(push_name, telefone), crm_stages(name), crm_funnels(name)")
          .eq("user_id", userId)
          .eq("stage_id", cfg.stage_id)
          .gte("stage_changed_at", targetStart.toISOString())
          .lte("stage_changed_at", targetDate.toISOString())
          .not("contact_id", "is", null);

        for (const deal of deals) {
          if (await alreadySent(supabase, cfg.id, deal.id)) continue;
          const phone = (deal.contacts as any)?.telefone;
          if (!phone) continue;
          const msg = applyVariables(cfg.message, {
            nome_cliente: (deal.contacts as any)?.push_name ?? "",
            nome_etapa: (deal.crm_stages as any)?.name ?? "",
            nome_funil: (deal.crm_funnels as any)?.name ?? "",
          });
          await sendWhatsApp(instance.apikey, phone, msg);
          await logSent(supabase, cfg.id, "deal", deal.id);
          processed++;
        }
      }

      // ── 7. CRM STAGNATION ─────────────────────────────────────────────────
      const crmStagCfgs = userConfigs.filter((c: any) => c.trigger_type === "crm_stagnation");
      for (const cfg of crmStagCfgs) {
        if (!cfg.stage_id || !instance || !cfg.timing_value) continue;
        const stagnationCutoff = new Date(now.getTime() - cfg.timing_value * 24 * 60 * 60 * 1000);

        const { data: deals = [] } = await supabase
          .from("crm_deals")
          .select("id, contact_id, stage_changed_at, contacts(push_name, telefone), crm_stages(name), crm_funnels(name)")
          .eq("user_id", userId)
          .eq("stage_id", cfg.stage_id)
          .lt("stage_changed_at", stagnationCutoff.toISOString())
          .not("contact_id", "is", null);

        for (const deal of deals) {
          if (await alreadySent(supabase, cfg.id, deal.id)) continue;
          const phone = (deal.contacts as any)?.telefone;
          if (!phone) continue;
          const msg = applyVariables(cfg.message, {
            nome_cliente: (deal.contacts as any)?.push_name ?? "",
            nome_etapa: (deal.crm_stages as any)?.name ?? "",
            nome_funil: (deal.crm_funnels as any)?.name ?? "",
          });
          await sendWhatsApp(instance.apikey, phone, msg);
          await logSent(supabase, cfg.id, "deal", deal.id);
          processed++;
        }
      }

      // ── 8. SATISFACTION SURVEY (conversation_resolved) ────────────────────
      const satisfactionCfg = userConfigs.find((c: any) => c.trigger_type === "conversation_resolved");
      if (satisfactionCfg) {
        const delayMs = (satisfactionCfg.timing_value || 0) * 60 * 1000;
        const resolvedBefore = new Date(now.getTime() - delayMs);
        const resolvedAfter = new Date(resolvedBefore.getTime() - WINDOW_MINUTES * 60 * 1000);

        const { data: convs = [] } = await supabase
          .from("conversations")
          .select("id, contact_id, instance_id, contacts(push_name, telefone), instances(apikey)")
          .eq("user_id", userId)
          .eq("status", "resolved")
          .is("nps_sent_at", null)
          .gte("updated_at", resolvedAfter.toISOString())
          .lte("updated_at", resolvedBefore.toISOString())
          .not("contact_id", "is", null);

        for (const conv of convs) {
          if (await alreadySent(supabase, satisfactionCfg.id, conv.id)) continue;
          const phone = (conv.contacts as any)?.telefone;
          const apiKey = (conv.instances as any)?.apikey;
          if (!phone || !apiKey) continue;

          // Envia via /send/menu (botões)
          const surveyText = "Sua opinião é muito importante para seguirmos melhorando. Como você avalia seu atendimento?";
          await fetch(`${UZAPI_URL}/send/menu`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "token": apiKey,
            },
            body: JSON.stringify({
              number: normalizePhone(phone),
              type: "button",
              text: surveyText,
              choices: [
                "⭐⭐⭐⭐⭐ Excelente|nps_5",
                "⭐⭐⭐⭐ Muito Bom|nps_4",
                "⭐⭐⭐ Bom|nps_3",
                "⭐⭐ Regular|nps_2",
                "⭐ Ruim|nps_1",
              ],
              track_source: "nps_survey",
              track_id: `nps_${conv.contact_id}_${conv.id}_${Date.now()}`,
            }),
          });

          // Marca a conversa como pesquisa enviada
          await supabase
            .from("conversations")
            .update({ nps_sent_at: now.toISOString() })
            .eq("id", conv.id);

          await logSent(supabase, satisfactionCfg.id, "conversation", conv.id);
          processed++;
        }
      }

      // ── 9. PATIENT BIRTHDAY ───────────────────────────────────────────────
      const birthdayCfg = userConfigs.find((c: any) => c.trigger_type === "patient_birthday");
      if (birthdayCfg && instance) {
        const todayMonth = now.getMonth() + 1;
        const todayDay = now.getDate();
        const sendHour = birthdayCfg.send_hour ?? 9;

        // Só executa na janela do horário configurado
        if (now.getHours() === sendHour) {
          const { data: patients = [] } = await supabase
            .from("patients")
            .select("id, nome, data_nascimento, contact_id, contacts(push_name, telefone)")
            .eq("user_id", userId)
            .not("data_nascimento", "is", null)
            .not("contact_id", "is", null);

          for (const patient of patients) {
            const bDate = new Date(patient.data_nascimento);
            if (bDate.getMonth() + 1 !== todayMonth || bDate.getDate() !== todayDay) continue;
            if (await alreadySentThisYear(supabase, birthdayCfg.id, patient.id)) continue;

            const phone = (patient.contacts as any)?.telefone;
            if (!phone) continue;
            const msg = applyVariables(birthdayCfg.message, {
              nome_paciente: patient.nome ?? (patient.contacts as any)?.push_name ?? "",
            });
            await sendWhatsApp(instance.apikey, phone, msg);
            await logSent(supabase, birthdayCfg.id, "patient", patient.id);
            processed++;
          }
        }
      }
    }

    return new Response(JSON.stringify({ processed, ts: now.toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[process-auto-messages]", error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
