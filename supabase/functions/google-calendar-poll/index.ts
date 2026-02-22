import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    console.log("[GCAL POLL] Attempting token refresh...");
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error("[GCAL POLL] CRITICAL: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set!");
      return null;
    }
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
      console.log("[GCAL POLL] Token refresh successful, expires_in:", data.expires_in);
      return { access_token: data.access_token, expires_in: data.expires_in || 3600 };
    }
    console.error("[GCAL POLL] Token refresh failed. Status:", response.status, "Error:", data.error, "Description:", data.error_description);
    return null;
  } catch (e) {
    console.error("[GCAL POLL] Token refresh exception:", e);
    return null;
  }
}

async function getValidAccessToken(
  supabase: ReturnType<typeof createClient>,
  connection: {
    id: string;
    access_token: string | null;
    token_expiry: string | null;
    refresh_token: string;
  },
): Promise<string | null> {
  const now = new Date();
  const expiry = connection.token_expiry ? new Date(connection.token_expiry) : null;
  const minutesLeft = expiry ? Math.round((expiry.getTime() - now.getTime()) / 60000) : null;

  console.log(`[GCAL POLL] Token status: expiry=${connection.token_expiry}, minutesLeft=${minutesLeft}`);

  if (
    connection.access_token &&
    expiry &&
    expiry.getTime() - now.getTime() > 5 * 60 * 1000
  ) {
    console.log("[GCAL POLL] Using cached access token (still valid)");
    return connection.access_token;
  }

  console.log("[GCAL POLL] Token expired or missing, refreshing...");
  const refreshed = await refreshAccessToken(connection.refresh_token);
  if (!refreshed) return null;

  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  const { error: updateErr } = await supabase
    .from("professional_google_calendars")
    .update({ access_token: refreshed.access_token, token_expiry: newExpiry })
    .eq("id", connection.id);

  if (updateErr) {
    console.error("[GCAL POLL] Failed to save refreshed token:", updateErr);
  } else {
    console.log("[GCAL POLL] New token saved, new expiry:", newExpiry);
  }

  return refreshed.access_token;
}

/** Garante formato RFC 3339 com T e offset explícito */
function toRFC3339(ts: string): string {
  // "2026-02-23 14:45:00+00" → "2026-02-23T14:45:00+00:00"
  // "2026-02-23T14:45:00+00:00" → mantém
  return ts.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { user_id, connection_id } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "Missing user_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[GCAL POLL] ===== START sync for user=${user_id}, connection=${connection_id || "all"} =====`);
    console.log(`[GCAL POLL] GOOGLE_CLIENT_ID set: ${!!GOOGLE_CLIENT_ID}, GOOGLE_CLIENT_SECRET set: ${!!GOOGLE_CLIENT_SECRET}`);

    // Buscar conexões ativas
    let query = supabase
      .from("professional_google_calendars")
      .select("*")
      .eq("user_id", user_id)
      .eq("is_active", true);

    if (connection_id) {
      query = query.eq("id", connection_id);
    }

    const { data: connections, error: connErr } = await query;

    if (connErr) {
      console.error("[GCAL POLL] Error fetching connections:", connErr);
      return new Response(
        JSON.stringify({ success: false, error: `DB error: ${connErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!connections || connections.length === 0) {
      console.log("[GCAL POLL] No active connections found for user:", user_id);
      return new Response(
        JSON.stringify({ success: true, message: "No active connections", synced: 0, imported: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[GCAL POLL] Found ${connections.length} active connection(s)`);

    let totalSynced = 0;
    let totalImported = 0;
    const errors: string[] = [];

    // Início do dia atual (para incluir agendamentos de hoje)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const futureDate = new Date(todayStart.getTime() + 60 * 24 * 60 * 60 * 1000); // +60 dias

    for (const connection of connections) {
      try {
        console.log(`[GCAL POLL] Processing connection ${connection.id} (email: ${connection.google_account_email}, mode: ${connection.sync_mode})`);

        const accessToken = await getValidAccessToken(supabase, connection);
        if (!accessToken) {
          const msg = `Connection ${connection.id}: Could not get valid access token`;
          errors.push(msg);
          console.error(`[GCAL POLL] ${msg}`);
          continue;
        }

        const calendarId = connection.calendar_id || "primary";
        const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${
          encodeURIComponent(calendarId)
        }/events`;
        const authHeaders = {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        };

        // ─── PRÉ-VALIDAÇÃO: testar token usando endpoint calendar.events ──────────
        // IMPORTANTE: usar /calendars/primary/events (scope: calendar.events)
        // NÃO usar /users/me/calendarList (requer scope: calendar ou calendar.readonly)
        const testRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (!testRes.ok) {
          const testBody = await testRes.text();
          const msg = `Connection ${connection.id}: Token validation failed (${testRes.status}): ${testBody.substring(0, 400)}`;
          errors.push(msg);
          console.error(`[GCAL POLL] ${msg}`);
          continue;
        }
        console.log(`[GCAL POLL] Token validated successfully for connection ${connection.id}`);

        // ─── FASE 1: Plataforma → Google Calendar ────────────────────────────────
        let aptQuery = supabase
          .from("appointments")
          .select(`
            id, start_time, end_time, description, status, price,
            google_event_id, professional_id,
            professionals(id, name),
            contacts(push_name),
            products_services(name)
          `)
          .eq("user_id", user_id)
          .eq("type", "appointment")
          .neq("status", "canceled")
          .gte("start_time", todayStart.toISOString())
          .lte("start_time", futureDate.toISOString());

        // Conexão individual: filtrar por profissional
        if (connection.professional_id) {
          aptQuery = aptQuery.eq("professional_id", connection.professional_id);
        }

        const { data: appointments, error: aptErr } = await aptQuery;

        if (aptErr) {
          console.error(`[GCAL POLL] Error fetching appointments:`, aptErr);
        }

        console.log(`[GCAL POLL] Found ${appointments?.length || 0} appointment(s) to sync (professional_id filter: ${connection.professional_id || "none"})`);

        for (const apt of appointments || []) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const professionalName = (apt as any).professionals?.name || "Profissional";
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const contactName = (apt as any).contacts?.push_name || "Paciente";
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const serviceName = (apt as any).products_services?.name || "Consulta";

            const statusMap: Record<string, string> = {
              pending: "Pendente",
              confirmed: "Confirmado",
              rescheduled: "Reagendado",
              completed: "Concluído",
              canceled: "Cancelado",
            };

            const startTime = toRFC3339(apt.start_time);
            const endTime = toRFC3339(apt.end_time);

            const eventBody = {
              summary: `${serviceName} – ${contactName}`,
              description: [
                `Profissional: ${professionalName}`,
                `Status: ${statusMap[apt.status] || apt.status}`,
                apt.price
                  ? `Valor: R$ ${Number(apt.price).toFixed(2).replace(".", ",")}`
                  : null,
                apt.description ? `Obs: ${apt.description}` : null,
                "\nAgendado via Clinvia",
              ]
                .filter(Boolean)
                .join("\n"),
              start: { dateTime: startTime, timeZone: "America/Sao_Paulo" },
              end: { dateTime: endTime, timeZone: "America/Sao_Paulo" },
              colorId: "5",
            };

            console.log(`[GCAL POLL] Syncing apt ${apt.id}: "${eventBody.summary}", start=${startTime}, google_event_id=${apt.google_event_id || "none"}`);

            let googleEventId = apt.google_event_id;
            let syncRes: Response;

            if (googleEventId) {
              syncRes = await fetch(`${baseUrl}/${googleEventId}`, {
                method: "PUT",
                headers: authHeaders,
                body: JSON.stringify(eventBody),
              });
              if (syncRes.status === 404) {
                console.log(`[GCAL POLL] Event ${googleEventId} not found in GCal, creating new one`);
                syncRes = await fetch(baseUrl, {
                  method: "POST",
                  headers: authHeaders,
                  body: JSON.stringify(eventBody),
                });
              }
            } else {
              syncRes = await fetch(baseUrl, {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify(eventBody),
              });
            }

            if (syncRes.ok) {
              const eventData = await syncRes.json();
              console.log(`[GCAL POLL] OK: event ${eventData.id} synced to GCal`);
              if (!apt.google_event_id && eventData.id) {
                await supabase
                  .from("appointments")
                  .update({
                    google_event_id: eventData.id,
                    google_calendar_sync_id: connection.id,
                  })
                  .eq("id", apt.id);
              }
              totalSynced++;
            } else {
              const errBody = await syncRes.text();
              const errMsg = `Apt ${apt.id}: GCal API ${syncRes.status} → ${errBody.substring(0, 500)}`;
              errors.push(errMsg);
              console.error(`[GCAL POLL] FAILED to sync: ${errMsg}`);
            }
          } catch (aptErr) {
            const msg = `Apt ${apt.id}: ${aptErr instanceof Error ? aptErr.message : String(aptErr)}`;
            errors.push(msg);
            console.error(`[GCAL POLL] Exception on apt:`, msg);
          }
        }

        // ─── FASE 2: Google Calendar → Plataforma (somente two_way) ──────────────
        if (connection.sync_mode === "two_way") {
          console.log(`[GCAL POLL] Phase 2: fetching GCal events for two_way sync...`);
          const eventsUrl = `${baseUrl}?timeMin=${
            encodeURIComponent(todayStart.toISOString())
          }&timeMax=${
            encodeURIComponent(futureDate.toISOString())
          }&singleEvents=true&maxResults=250`;

          const eventsRes = await fetch(eventsUrl, { headers: authHeaders });

          if (eventsRes.ok) {
            const eventsData = await eventsRes.json();
            const gcalEvents = eventsData.items || [];
            console.log(`[GCAL POLL] Found ${gcalEvents.length} GCal event(s) in date range`);

            for (const event of gcalEvents) {
              if (event.status === "cancelled") continue;

              const googleEventId = event.id as string;
              const startDateTime = event.start?.dateTime || event.start?.date;
              const endDateTime = event.end?.dateTime || event.end?.date;
              if (!startDateTime || !endDateTime) continue;

              const { data: existing } = await supabase
                .from("appointments")
                .select("id")
                .eq("google_event_id", googleEventId)
                .maybeSingle();

              if (!existing) {
                const absencePayload: Record<string, unknown> = {
                  user_id,
                  start_time: startDateTime,
                  end_time: endDateTime,
                  type: "absence",
                  status: "confirmed",
                  google_event_id: googleEventId,
                  google_calendar_sync_id: connection.id,
                  description: `Bloqueio importado do Google Calendar: ${
                    event.summary || "Evento externo"
                  }`,
                };

                if (connection.professional_id) {
                  absencePayload.professional_id = connection.professional_id;
                }

                const { error: insErr } = await supabase
                  .from("appointments")
                  .insert(absencePayload);

                if (!insErr) {
                  totalImported++;
                  console.log(`[GCAL POLL] Imported absence: "${event.summary || googleEventId}"`);
                } else {
                  console.error(`[GCAL POLL] Failed to insert absence block:`, insErr);
                }
              }
            }
          } else {
            const errText = await eventsRes.text();
            console.error(`[GCAL POLL] Failed to fetch GCal events: ${eventsRes.status} ${errText.substring(0, 400)}`);
          }
        }

        console.log(`[GCAL POLL] Connection ${connection.id} done: synced=${totalSynced}, imported=${totalImported}`);
      } catch (connErr) {
        const msg = connErr instanceof Error ? connErr.message : String(connErr);
        errors.push(`Connection ${connection.id}: ${msg}`);
        console.error(`[GCAL POLL] Connection ${connection.id} exception:`, msg);
      }
    }

    console.log(`[GCAL POLL] ===== DONE: synced=${totalSynced}, imported=${totalImported}, errors=${errors.length} =====`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: totalSynced,
        imported: totalImported,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[GCAL POLL] Unexpected top-level error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
