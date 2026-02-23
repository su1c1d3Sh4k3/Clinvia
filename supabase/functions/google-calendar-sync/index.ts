import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";

/** Garante formato RFC 3339 válido para a API do Google Calendar */
function toRFC3339(ts: string): string {
  // "2026-02-23 14:45:00+00" → "2026-02-23T14:45:00+00:00"
  return ts.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
}

// Renova o access_token usando o refresh_token
async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
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
      return { access_token: data.access_token, expires_in: data.expires_in || 3600 };
    }
    console.error("[GCAL SYNC] Token refresh failed:", data.error, data.error_description);
    return null;
  } catch (e) {
    console.error("[GCAL SYNC] Token refresh error:", e);
    return null;
  }
}

// Garante que o access_token está válido, renovando se necessário
async function getValidAccessToken(
  supabase: ReturnType<typeof createClient>,
  connection: { id: string; access_token: string | null; token_expiry: string | null; refresh_token: string }
): Promise<string | null> {
  const now = new Date();
  const expiry = connection.token_expiry ? new Date(connection.token_expiry) : null;

  if (connection.access_token && expiry && expiry.getTime() - now.getTime() > 5 * 60 * 1000) {
    return connection.access_token;
  }

  console.log("[GCAL SYNC] Refreshing access token for connection:", connection.id);
  const refreshed = await refreshAccessToken(connection.refresh_token);
  if (!refreshed) return null;

  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabase
    .from("professional_google_calendars")
    .update({ access_token: refreshed.access_token, token_expiry: newExpiry })
    .eq("id", connection.id);

  return refreshed.access_token;
}

// Formata um appointment como evento do Google Calendar
function formatGoogleEvent(appointment: {
  start_time: string;
  end_time: string;
  description?: string;
  status: string;
  price?: number;
}, contactName: string, serviceName: string, professionalName: string) {
  const statusMap: Record<string, string> = {
    pending: "Pendente",
    confirmed: "Confirmado",
    rescheduled: "Reagendado",
    completed: "Concluído",
    canceled: "Cancelado",
  };

  return {
    summary: `${serviceName} – ${contactName}`,
    description: [
      `Profissional: ${professionalName}`,
      `Serviço: ${serviceName}`,
      `Paciente: ${contactName}`,
      `Status: ${statusMap[appointment.status] || appointment.status}`,
      appointment.price ? `Valor: R$ ${Number(appointment.price).toFixed(2).replace(".", ",")}` : null,
      appointment.description ? `Obs: ${appointment.description}` : null,
      "\nAgendado via Clinvia",
    ].filter(Boolean).join("\n"),
    start: {
      dateTime: toRFC3339(appointment.start_time),
      timeZone: "America/Sao_Paulo",
    },
    end: {
      dateTime: toRFC3339(appointment.end_time),
      timeZone: "America/Sao_Paulo",
    },
    colorId: "5",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, appointment_id, user_id } = await req.json();

    if (!appointment_id || !user_id) {
      return new Response(
        JSON.stringify({ error: "Missing appointment_id or user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[GCAL SYNC] Action: ${action}, Appointment: ${appointment_id}, User: ${user_id}`);

    // Buscar dados completos do agendamento
    const { data: appointment, error: aptError } = await supabase
      .from("appointments")
      .select(`
        id, start_time, end_time, description, status, price,
        google_event_id, professional_id,
        professionals(id, name),
        contacts(push_name),
        products_services(name)
      `)
      .eq("id", appointment_id)
      .single();

    if (aptError || !appointment) {
      console.error("[GCAL SYNC] Appointment not found:", aptError);
      return new Response(
        JSON.stringify({ error: "Appointment not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const professionalName = (appointment as Record<string, unknown> & { professionals?: { name?: string } }).professionals?.name || "Profissional";
    const contactName = (appointment as Record<string, unknown> & { contacts?: { push_name?: string } }).contacts?.push_name || "Paciente";
    const serviceName = (appointment as Record<string, unknown> & { products_services?: { name?: string } }).products_services?.name || "Consulta";

    // Buscar conexões Google Calendar ativas:
    // 1) Conexão individual do profissional
    // 2) Conexão global da clínica (professional_id IS NULL)
    const { data: connections, error: connErr } = await supabase
      .from("professional_google_calendars")
      .select("*")
      .eq("user_id", user_id)
      .eq("is_active", true)
      .or(`professional_id.eq.${appointment.professional_id},professional_id.is.null`);

    if (connErr) {
      console.error("[GCAL SYNC] Error fetching connections:", connErr);
    }

    if (!connections || connections.length === 0) {
      console.log("[GCAL SYNC] No active Google Calendar connections found for user:", user_id);
      return new Response(
        JSON.stringify({ success: true, synced: 0, message: "No active connections" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[GCAL SYNC] Found ${connections.length} connection(s) to sync`);

    let synced = 0;
    const errors: string[] = [];

    for (const connection of connections) {
      try {
        const accessToken = await getValidAccessToken(supabase, connection);
        if (!accessToken) {
          errors.push(`Connection ${connection.id}: Could not refresh token`);
          continue;
        }

        const calendarId = connection.calendar_id || "primary";
        const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
        const headers = {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        };

        if (action === "delete_appointment") {
          // Remover evento do Google Calendar
          if (appointment.google_event_id) {
            const deleteRes = await fetch(`${baseUrl}/${appointment.google_event_id}`, {
              method: "DELETE",
              headers,
            });
            // 204 = sucesso, 404 = já não existe (ok)
            if (deleteRes.status !== 204 && deleteRes.status !== 404) {
              const body = await deleteRes.text();
              errors.push(`Connection ${connection.id}: Delete failed (${deleteRes.status}): ${body}`);
              continue;
            }
            console.log(`[GCAL SYNC] Deleted event ${appointment.google_event_id} from calendar ${calendarId}`);
          }
          synced++;
        } else {
          // sync_appointment: criar ou atualizar evento
          const eventBody = formatGoogleEvent(
            appointment,
            contactName,
            serviceName,
            professionalName
          );

          console.log(`[GCAL SYNC] Syncing apt ${appointment_id}: start=${eventBody.start.dateTime}`);

          let googleEventId = appointment.google_event_id;
          let syncRes: Response;

          if (googleEventId) {
            // Atualizar evento existente
            syncRes = await fetch(`${baseUrl}/${googleEventId}`, {
              method: "PUT",
              headers,
              body: JSON.stringify(eventBody),
            });
          } else {
            // Criar novo evento
            syncRes = await fetch(baseUrl, {
              method: "POST",
              headers,
              body: JSON.stringify(eventBody),
            });
          }

          if (!syncRes.ok) {
            const body = await syncRes.text();
            // Se evento não encontrado (404), criar do zero
            if (syncRes.status === 404 && googleEventId) {
              console.log(`[GCAL SYNC] Event not found (404), creating new...`);
              const createRes = await fetch(baseUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(eventBody),
              });
              if (!createRes.ok) {
                const createBody = await createRes.text();
                errors.push(`Connection ${connection.id}: Create after 404 failed (${createRes.status}): ${createBody}`);
                continue;
              }
              const created = await createRes.json();
              googleEventId = created.id;
            } else {
              errors.push(`Connection ${connection.id}: Sync failed (${syncRes.status}): ${body}`);
              console.error(`[GCAL SYNC] API error ${syncRes.status}: ${body.substring(0, 500)}`);
              continue;
            }
          } else {
            const eventData = await syncRes.json();
            googleEventId = eventData.id;
          }

          // Salvar google_event_id no appointment (apenas na primeira conexão que cria)
          if (googleEventId && !appointment.google_event_id) {
            await supabase
              .from("appointments")
              .update({
                google_event_id: googleEventId,
                google_calendar_sync_id: connection.id
              })
              .eq("id", appointment_id);
            // Atualizar local para não sobrescrever em próximas iterações
            appointment.google_event_id = googleEventId;
          }

          console.log(`[GCAL SYNC] Synced event ${googleEventId} to calendar ${calendarId}`);
          synced++;
        }
      } catch (connError: unknown) {
        const msg = connError instanceof Error ? connError.message : String(connError);
        errors.push(`Connection ${connection.id}: ${msg}`);
        console.error(`[GCAL SYNC] Exception on connection ${connection.id}:`, msg);
      }
    }

    return new Response(
      JSON.stringify({ success: true, synced, errors: errors.length > 0 ? errors : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[GCAL SYNC] Unexpected error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
