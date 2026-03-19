import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * check-reminders: Edge Function chamada a cada minuto via pg_cron.
 * Verifica agendamentos e tarefas que iniciam em ~30min ou ~5min
 * e envia push notification via send-push.
 */

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const results = { reminders_sent: 0, errors: 0 };

    // Janelas de tempo para cada tipo de lembrete
    const windows = [
      { type: '30m', minMs: 28 * 60 * 1000, maxMs: 32 * 60 * 1000, label: '30 minutos' },
      { type: '5m',  minMs: 3 * 60 * 1000,  maxMs: 7 * 60 * 1000,  label: '5 minutos' },
    ];

    for (const w of windows) {
      const windowStart = new Date(now.getTime() + w.minMs).toISOString();
      const windowEnd = new Date(now.getTime() + w.maxMs).toISOString();

      // ── Agendamentos ──────────────────────────────────────────────
      const { data: appointments } = await supabase
        .from('appointments')
        .select('id, start_time, user_id, professional_id, contacts(push_name, number), products_services(name)')
        .gte('start_time', windowStart)
        .lte('start_time', windowEnd)
        .in('status', ['confirmed', 'pending']);

      for (const apt of appointments || []) {
        // Verifica se já enviou esse lembrete
        const { data: existing } = await supabase
          .from('_reminder_log')
          .select('id')
          .eq('item_type', 'appointment')
          .eq('item_id', apt.id)
          .eq('reminder_type', w.type)
          .maybeSingle();

        if (existing) continue;

        // Busca auth_user_id do profissional
        const { data: tm } = await supabase
          .from('team_members')
          .select('auth_user_id, name')
          .eq('id', apt.professional_id)
          .maybeSingle();

        if (!tm?.auth_user_id) continue;

        const clientName = (apt as any).contacts?.push_name || 'Cliente';
        const serviceName = (apt as any).products_services?.name || '';
        const startTime = new Date(apt.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        // Envia push
        const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            auth_user_id: tm.auth_user_id,
            title: `⏰ Agendamento em ${w.label}`,
            body: `${clientName}${serviceName ? ' — ' + serviceName : ''} às ${startTime}`,
            notification_type: 'appointments',
            tag: `reminder-apt-${apt.id}-${w.type}`,
          }),
        });

        if (pushRes.ok) {
          // Registra no log
          await supabase.from('_reminder_log').insert({
            item_type: 'appointment',
            item_id: apt.id,
            reminder_type: w.type,
          });
          results.reminders_sent++;
          console.log(`[REMINDER] Sent ${w.type} for appointment ${apt.id} to ${tm.name}`);
        } else {
          results.errors++;
          console.error(`[REMINDER] Failed for appointment ${apt.id}:`, await pushRes.text());
        }
      }

      // ── Tarefas ───────────────────────────────────────────────────
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title, start_time, user_id, responsible_id')
        .gte('start_time', windowStart)
        .lte('start_time', windowEnd)
        .in('status', ['pending', 'open']);

      for (const task of tasks || []) {
        const { data: existing } = await supabase
          .from('_reminder_log')
          .select('id')
          .eq('item_type', 'task')
          .eq('item_id', task.id)
          .eq('reminder_type', w.type)
          .maybeSingle();

        if (existing) continue;

        // Busca auth_user_id do responsável
        const responsibleId = task.responsible_id;
        if (!responsibleId) continue;

        const { data: tm } = await supabase
          .from('team_members')
          .select('auth_user_id, name')
          .eq('id', responsibleId)
          .maybeSingle();

        if (!tm?.auth_user_id) continue;

        const startTime = new Date(task.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            auth_user_id: tm.auth_user_id,
            title: `⏰ Tarefa em ${w.label}`,
            body: `${task.title} — ${startTime}`,
            notification_type: 'tasks',
            tag: `reminder-task-${task.id}-${w.type}`,
          }),
        });

        if (pushRes.ok) {
          await supabase.from('_reminder_log').insert({
            item_type: 'task',
            item_id: task.id,
            reminder_type: w.type,
          });
          results.reminders_sent++;
          console.log(`[REMINDER] Sent ${w.type} for task ${task.id} to ${tm.name}`);
        } else {
          results.errors++;
          console.error(`[REMINDER] Failed for task ${task.id}:`, await pushRes.text());
        }
      }
    }

    // Limpa logs antigos (mais de 7 dias)
    await supabase
      .from('_reminder_log')
      .delete()
      .lt('sent_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());

    console.log(`[REMINDER] Done: ${results.reminders_sent} sent, ${results.errors} errors`);

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error('[REMINDER] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
