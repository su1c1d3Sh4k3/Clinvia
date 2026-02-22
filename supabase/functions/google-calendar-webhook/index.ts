import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";

async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token",
      }),
    });
    const data = await response.json();
    if (response.ok && data.access_token) {
      return data.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  // O Google exige resposta 200 imediata para confirmar recebimento
  const channelId = req.headers.get("x-goog-channel-id");
  const resourceState = req.headers.get("x-goog-resource-state");
  const resourceId = req.headers.get("x-goog-resource-id");

  console.log(`[GCAL WEBHOOK] Received notification: channel=${channelId}, state=${resourceState}`);

  // Responder 200 imediatamente (requisito do Google)
  const response = new Response("OK", { status: 200 });

  // Processar em background para não bloquear a resposta
  if (channelId && resourceState && resourceState !== "sync") {
    const processPromise = processWebhookNotification(channelId, resourceState, resourceId);
    // deno-lint-ignore no-explicit-any
    (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil(processPromise);
  }

  return response;
});

async function processWebhookNotification(
  channelId: string,
  resourceState: string,
  _resourceId: string | null
) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar a conexão pelo channel_id
    const { data: connection, error: connError } = await supabase
      .from("professional_google_calendars")
      .select("*")
      .eq("webhook_channel_id", channelId)
      .eq("is_active", true)
      .single();

    if (connError || !connection) {
      console.warn("[GCAL WEBHOOK] Connection not found for channel:", channelId);
      return;
    }

    console.log(`[GCAL WEBHOOK] Processing for connection ${connection.id}, user ${connection.user_id}`);

    // Renovar access token se necessário
    const now = new Date();
    const expiry = connection.token_expiry ? new Date(connection.token_expiry) : null;
    let accessToken = connection.access_token;

    if (!accessToken || !expiry || expiry.getTime() - now.getTime() < 5 * 60 * 1000) {
      accessToken = await refreshAccessToken(connection.refresh_token);
      if (!accessToken) {
        console.error("[GCAL WEBHOOK] Could not refresh token for connection:", connection.id);
        return;
      }
      await supabase
        .from("professional_google_calendars")
        .update({ access_token: accessToken, token_expiry: new Date(Date.now() + 3600 * 1000).toISOString() })
        .eq("id", connection.id);
    }

    const calendarId = connection.calendar_id || "primary";

    // Buscar eventos modificados nas últimas 24h
    const timeMin = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const eventsUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(timeMin)}&singleEvents=true&orderBy=updated&maxResults=50`;

    const eventsRes = await fetch(eventsUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!eventsRes.ok) {
      console.error("[GCAL WEBHOOK] Failed to fetch events:", eventsRes.status);
      return;
    }

    const eventsData = await eventsRes.json();
    const events = eventsData.items || [];

    console.log(`[GCAL WEBHOOK] Processing ${events.length} events from Google Calendar`);

    for (const event of events) {
      await processGoogleEvent(supabase, connection, event);
    }

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[GCAL WEBHOOK] Processing error:", message);
  }
}

async function processGoogleEvent(
  supabase: ReturnType<typeof createClient>,
  connection: { id: string; user_id: string; professional_id: string | null; sync_mode: string },
  event: Record<string, unknown>
) {
  const googleEventId = event.id as string;
  const eventStatus = event.status as string; // 'confirmed', 'tentative', 'cancelled'

  // Buscar agendamento correspondente pelo google_event_id
  const { data: appointment } = await supabase
    .from("appointments")
    .select("id, status, start_time, end_time")
    .eq("google_event_id", googleEventId)
    .eq("user_id", connection.user_id)
    .single();

  if (appointment) {
    // Agendamento existente na plataforma

    if (eventStatus === "cancelled") {
      // Evento cancelado no Google → cancelar na plataforma
      if (appointment.status !== "canceled") {
        await supabase
          .from("appointments")
          .update({ status: "canceled" })
          .eq("id", appointment.id);
        console.log(`[GCAL WEBHOOK] Cancelled appointment ${appointment.id} (event deleted in GCal)`);
      }
    } else if (event.start && event.end) {
      // Evento movido → atualizar horários na plataforma
      const startDateTime = (event.start as Record<string, string>).dateTime;
      const endDateTime = (event.end as Record<string, string>).dateTime;

      if (startDateTime && endDateTime &&
        (startDateTime !== appointment.start_time || endDateTime !== appointment.end_time)) {
        await supabase
          .from("appointments")
          .update({
            start_time: startDateTime,
            end_time: endDateTime,
            status: "rescheduled"
          })
          .eq("id", appointment.id);
        console.log(`[GCAL WEBHOOK] Rescheduled appointment ${appointment.id}`);
      }
    }
  } else if (eventStatus !== "cancelled" && connection.sync_mode === "two_way") {
    // Evento externo (não vem da plataforma) em modo bidirecional
    // Criar um bloqueio de ausência na plataforma para esse horário
    const startDateTime = event.start ? (event.start as Record<string, string>).dateTime : null;
    const endDateTime = event.end ? (event.end as Record<string, string>).dateTime : null;

    if (!startDateTime || !endDateTime) return;

    // Verificar se já existe ausência com esse google_event_id
    const { data: existingAbsence } = await supabase
      .from("appointments")
      .select("id")
      .eq("google_event_id", googleEventId)
      .single();

    if (!existingAbsence) {
      // Criar ausência (bloqueio de horário)
      const absencePayload: Record<string, unknown> = {
        user_id: connection.user_id,
        start_time: startDateTime,
        end_time: endDateTime,
        type: "absence",
        status: "confirmed",
        google_event_id: googleEventId,
        google_calendar_sync_id: connection.id,
        description: `Bloqueio importado do Google Calendar: ${event.summary || "Evento externo"}`,
      };

      // Se a conexão é de um profissional específico, associar a ele
      if (connection.professional_id) {
        absencePayload.professional_id = connection.professional_id;
      }

      await supabase.from("appointments").insert(absencePayload);
      console.log(`[GCAL WEBHOOK] Created absence block from external GCal event: ${event.summary}`);
    }
  }
}
