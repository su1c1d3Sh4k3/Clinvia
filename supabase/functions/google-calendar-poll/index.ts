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
    console.error("[GCAL POLL] Token refresh failed:", data.error);
    return null;
  } catch {
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

  if (
    connection.access_token &&
    expiry &&
    expiry.getTime() - now.getTime() > 5 * 60 * 1000
  ) {
    return connection.access_token;
  }

  const refreshed = await refreshAccessToken(connection.refresh_token);
  if (!refreshed) return null;

  const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabase
    .from("professional_google_calendars")
    .update({ access_token: refreshed.access_token, token_expiry: newExpiry })
    .eq("id", connection.id);

  return refreshed.access_token;
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

    console.log(`[GCAL POLL] Starting sync for user ${user_id}, connection ${connection_id || "all"}`);

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

    if (connErr || !connections || connections.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active connections", synced: 0, imported: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let totalSynced = 0;
    let totalImported = 0;
    const errors: string[] = [];

    const now = new Date();
    const futureDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // +60 dias

    for (const connection of connections) {
      try {
        const accessToken = await getValidAccessToken(supabase, connection);
        if (!accessToken) {
          errors.push(`Connection ${connection.id}: Could not refresh token`);
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

        // ─── FASE 1: Plataforma → Google Calendar (push de agendamentos futuros) ──────
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
          .gte("start_time", now.toISOString())
          .lte("start_time", futureDate.toISOString());

        // Conexão individual: filtrar por profissional
        if (connection.professional_id) {
          aptQuery = aptQuery.eq("professional_id", connection.professional_id);
        }

        const { data: appointments } = await aptQuery;

        for (const apt of appointments || []) {
          try {
            const professionalName =
              (apt as Record<string, unknown> & { professionals?: { name?: string } })
                .professionals?.name || "Profissional";
            const contactName =
              (apt as Record<string, unknown> & { contacts?: { push_name?: string } })
                .contacts?.push_name || "Paciente";
            const serviceName =
              (apt as Record<string, unknown> & { products_services?: { name?: string } })
                .products_services?.name || "Consulta";

            const statusMap: Record<string, string> = {
              pending: "Pendente",
              confirmed: "Confirmado",
              rescheduled: "Reagendado",
              completed: "Concluído",
              canceled: "Cancelado",
            };

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
              start: { dateTime: apt.start_time, timeZone: "America/Sao_Paulo" },
              end: { dateTime: apt.end_time, timeZone: "America/Sao_Paulo" },
              colorId: "5",
            };

            let googleEventId = apt.google_event_id;
            let syncRes: Response;

            if (googleEventId) {
              syncRes = await fetch(`${baseUrl}/${googleEventId}`, {
                method: "PUT",
                headers: authHeaders,
                body: JSON.stringify(eventBody),
              });
              // Evento não existe mais no GCal: criar novo
              if (syncRes.status === 404) {
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
            }
          } catch (aptErr) {
            errors.push(
              `Apt ${apt.id}: ${aptErr instanceof Error ? aptErr.message : String(aptErr)}`,
            );
          }
        }

        // ─── FASE 2: Google Calendar → Plataforma (somente two_way) ──────────────────
        if (connection.sync_mode === "two_way") {
          const eventsUrl = `${baseUrl}?timeMin=${
            encodeURIComponent(now.toISOString())
          }&timeMax=${
            encodeURIComponent(futureDate.toISOString())
          }&singleEvents=true&maxResults=250`;

          const eventsRes = await fetch(eventsUrl, { headers: authHeaders });

          if (eventsRes.ok) {
            const eventsData = await eventsRes.json();
            const gcalEvents = eventsData.items || [];

            for (const event of gcalEvents) {
              if (event.status === "cancelled") continue;

              const googleEventId = event.id as string;
              const startDateTime = event.start?.dateTime || event.start?.date;
              const endDateTime = event.end?.dateTime || event.end?.date;
              if (!startDateTime || !endDateTime) continue;

              // Verificar se já existe na plataforma (tanto appointment quanto absence)
              const { data: existing } = await supabase
                .from("appointments")
                .select("id")
                .eq("google_event_id", googleEventId)
                .maybeSingle();

              if (!existing) {
                // Criar bloqueio de ausência
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
                  console.log(
                    `[GCAL POLL] Imported absence block: ${event.summary || googleEventId}`,
                  );
                }
              }
            }
          } else {
            const errText = await eventsRes.text();
            console.error(`[GCAL POLL] Failed to fetch GCal events: ${eventsRes.status} ${errText}`);
          }
        }

        console.log(
          `[GCAL POLL] Connection ${connection.id}: synced=${totalSynced}, imported=${totalImported}`,
        );
      } catch (connErr) {
        const msg = connErr instanceof Error ? connErr.message : String(connErr);
        errors.push(`Connection ${connection.id}: ${msg}`);
        console.error(`[GCAL POLL] Connection ${connection.id} error:`, msg);
      }
    }

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
    console.error("[GCAL POLL] Unexpected error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
