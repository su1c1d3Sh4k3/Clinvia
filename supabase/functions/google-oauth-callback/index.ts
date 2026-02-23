import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const GOOGLE_REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI") || "";

interface OAuthRequest {
  code: string;
  state: string;
  redirect_uri?: string;
}

// ─── Cria um sub-calendário no Google Calendar e retorna o ID ────────────────
// Requer scope: https://www.googleapis.com/auth/calendar
async function createGoogleCalendar(
  accessToken: string,
  calendarName: string,
): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ summary: calendarName }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(
        `[GCAL OAUTH] createGoogleCalendar failed for "${calendarName}": ${res.status} — ${errBody.substring(0, 400)}`,
      );
      return null;
    }

    const data = await res.json();
    console.log(`[GCAL OAUTH] Created calendar "${calendarName}" → id=${data.id}`);
    return data.id as string;
  } catch (e) {
    console.error(`[GCAL OAUTH] createGoogleCalendar exception for "${calendarName}":`, e);
    return null;
  }
}

// ─── Serve ───────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const payload: OAuthRequest = await req.json();
    const { code, state } = payload;
    const redirectUri = payload.redirect_uri || GOOGLE_REDIRECT_URI;

    console.log("[GOOGLE OAUTH] Processing callback...");

    if (!code || !state) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing code or state" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Decodificar e validar state
    let stateData: { user_id: string; professional_id: string | null; nonce: string; timestamp: number };
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid state parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { user_id, professional_id } = stateData;

    if (!user_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing user_id in state" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!GOOGLE_CLIENT_SECRET) {
      console.error("[GOOGLE OAUTH] GOOGLE_CLIENT_SECRET not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Google client secret not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── PASSO 1: Trocar code por tokens ────────────────────────────────────
    console.log("[GOOGLE OAUTH] Step 1: Exchanging code for tokens...");

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();
    console.log("[GOOGLE OAUTH] Token response status:", tokenResponse.status);

    if (!tokenResponse.ok || tokenData.error) {
      const errorMsg = tokenData.error_description || tokenData.error || "Failed to exchange code for tokens";
      console.error("[GOOGLE OAUTH] Token exchange error:", errorMsg);
      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { access_token, refresh_token, expires_in } = tokenData;

    if (!refresh_token) {
      console.error("[GOOGLE OAUTH] No refresh_token received. User may need to revoke access and reconnect.");
      return new Response(
        JSON.stringify({
          success: false,
          error: "No refresh token received. Please revoke app access in your Google account and try again.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ─── PASSO 2: Buscar email da conta Google ───────────────────────────────
    console.log("[GOOGLE OAUTH] Step 2: Fetching Google account info...");

    let googleEmail = "";
    try {
      const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      const userInfo = await userInfoResponse.json();
      googleEmail = userInfo.email || "";
      console.log("[GOOGLE OAUTH] Account email:", googleEmail);
    } catch (e) {
      console.warn("[GOOGLE OAUTH] Could not fetch user info:", e);
    }

    const tokenExpiry = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();

    // Buscar sync_mode da connection da clínica para herança nas connections de profissionais
    let clinicSyncMode = "one_way";
    {
      const { data: clinicConnForSync } = await supabase
        .from("professional_google_calendars")
        .select("sync_mode")
        .eq("user_id", user_id)
        .is("professional_id", null)
        // Sem filtro is_active: preserva sync_mode mesmo após desconectar e reconectar
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (clinicConnForSync?.sync_mode) {
        clinicSyncMode = clinicConnForSync.sync_mode;
        console.log(`[GOOGLE OAUTH] Inheriting sync_mode="${clinicSyncMode}" from existing clinic connection`);
      } else {
        console.log(`[GOOGLE OAUTH] No existing clinic connection — using default sync_mode="one_way"`);
      }
    }

    // ─── PASSO 2.5: Criar sub-calendários por profissional ──────────────────
    // Requer scope: https://www.googleapis.com/auth/calendar
    console.log(`[GOOGLE OAUTH] Step 2.5: Creating sub-calendars (professional_id=${professional_id || "null=clinic"})...`);

    // finalCalendarId é usado no Passo 3 para a conexão principal
    let finalCalendarId = "primary"; // fallback seguro

    if (!professional_id) {
      // ── Cenário A: Conexão da clínica → criar um sub-calendário por profissional ──
      const { data: professionals, error: profErr } = await supabase
        .from("professionals")
        .select("id, name")
        .eq("user_id", user_id);

      if (profErr) {
        console.error("[GOOGLE OAUTH] Step 2.5: Could not fetch professionals:", profErr.message);
        // Não fatal — a conexão da clínica será salva normalmente
      } else if (professionals && professionals.length > 0) {
        console.log(`[GOOGLE OAUTH] Step 2.5: Processing ${professionals.length} professional(s)...`);

        for (const prof of professionals) {
          try {
            // Verificar se já tem connection com sub-calendário próprio (diferente de "primary")
            const { data: existingConn } = await supabase
              .from("professional_google_calendars")
              .select("id, calendar_id")
              .eq("user_id", user_id)
              .eq("professional_id", prof.id)
              .maybeSingle();

            if (existingConn?.calendar_id && existingConn.calendar_id !== "primary") {
              console.log(`[GOOGLE OAUTH] ${prof.name}: already has calendar ${existingConn.calendar_id}, skipping`);
              continue;
            }

            // Criar sub-calendário no Google
            const calName = prof.name || `Prof ${prof.id.slice(0, 8)}`;
            const newCalId = await createGoogleCalendar(access_token, calName);

            if (!newCalId) {
              console.warn(`[GOOGLE OAUTH] ${prof.name}: calendar creation failed, skipping`);
              continue;
            }

            const profPayload = {
              user_id,
              professional_id: prof.id,
              google_account_email: googleEmail,
              refresh_token,
              access_token,
              token_expiry: tokenExpiry,
              is_active: true,
              calendar_id: newCalId,
              sync_mode: clinicSyncMode,
              updated_at: new Date().toISOString(),
            };

            if (existingConn) {
              // Atualizar connection existente (estava com "primary") para apontar ao sub-calendário
              const { error: updErr } = await supabase
                .from("professional_google_calendars")
                .update(profPayload)
                .eq("id", existingConn.id);
              if (updErr) {
                console.error(`[GOOGLE OAUTH] ${prof.name}: update error:`, updErr.message);
              } else {
                console.log(`[GOOGLE OAUTH] ${prof.name}: updated → calendar_id=${newCalId}`);
              }
            } else {
              // Inserir nova connection para este profissional
              const { error: insErr } = await supabase
                .from("professional_google_calendars")
                .insert(profPayload);
              if (insErr) {
                console.error(`[GOOGLE OAUTH] ${prof.name}: insert error:`, insErr.message);
              } else {
                console.log(`[GOOGLE OAUTH] ${prof.name}: inserted → calendar_id=${newCalId}`);
              }
            }
          } catch (loopErr) {
            // Erro em um profissional não bloqueia os outros
            console.error(`[GOOGLE OAUTH] Exception for professional ${prof.id}:`, loopErr);
          }
        }
      } else {
        console.log("[GOOGLE OAUTH] Step 2.5: No professionals found for this user");
      }

      // A conexão da clínica (professional_id=null) sempre usa "primary"
      // finalCalendarId permanece "primary"

    } else {
      // ── Cenário B: Conexão de profissional específico → criar um sub-calendário para ele ──
      const { data: prof } = await supabase
        .from("professionals")
        .select("name")
        .eq("id", professional_id)
        .single();

      const calName = prof?.name || `Prof ${professional_id.slice(0, 8)}`;

      // Verificar se já tem sub-calendário (reconexão) para reutilizar
      const { data: existingConn } = await supabase
        .from("professional_google_calendars")
        .select("calendar_id")
        .eq("user_id", user_id)
        .eq("professional_id", professional_id)
        .maybeSingle();

      if (existingConn?.calendar_id && existingConn.calendar_id !== "primary") {
        // Reconexão: reutilizar calendário existente sem criar novo
        finalCalendarId = existingConn.calendar_id;
        console.log(`[GOOGLE OAUTH] ${calName}: reusing existing calendar ${finalCalendarId}`);
      } else {
        // Primeira conexão ou conexão com "primary": criar sub-calendário
        const newCalId = await createGoogleCalendar(access_token, calName);
        if (newCalId) {
          finalCalendarId = newCalId;
          console.log(`[GOOGLE OAUTH] ${calName}: created calendar ${finalCalendarId}`);
        } else {
          console.warn(`[GOOGLE OAUTH] ${calName}: calendar creation failed, falling back to "primary"`);
          // finalCalendarId permanece "primary"
        }
      }
    }

    // ─── PASSO 3: Salvar conexão principal no banco ──────────────────────────
    console.log("[GOOGLE OAUTH] Step 3: Saving main connection to database...");

    const upsertPayload: Record<string, unknown> = {
      user_id,
      professional_id: professional_id || null,
      google_account_email: googleEmail,
      refresh_token,
      access_token,
      token_expiry: tokenExpiry,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    // Verificar se já existe para fazer update ou insert
    let existing;
    if (professional_id) {
      const { data } = await supabase
        .from("professional_google_calendars")
        .select("id")
        .eq("user_id", user_id)
        .eq("professional_id", professional_id)
        .single();
      existing = data;
    } else {
      const { data } = await supabase
        .from("professional_google_calendars")
        .select("id")
        .eq("user_id", user_id)
        .is("professional_id", null)
        .single();
      existing = data;
    }

    let result;
    if (existing) {
      // Update: incluir calendar_id apenas para conexões de profissional individual
      // (a conexão da clínica mantém "primary" — não sobrescrever)
      const updatePayload = professional_id
        ? { ...upsertPayload, calendar_id: finalCalendarId }
        : { ...upsertPayload };
      result = await supabase
        .from("professional_google_calendars")
        .update(updatePayload)
        .eq("id", existing.id)
        .select()
        .single();
      console.log("[GOOGLE OAUTH] Updated existing connection");
    } else {
      result = await supabase
        .from("professional_google_calendars")
        .insert({ ...upsertPayload, calendar_id: finalCalendarId, sync_mode: clinicSyncMode })
        .select()
        .single();
      console.log("[GOOGLE OAUTH] Created new connection");
    }

    if (result.error) {
      console.error("[GOOGLE OAUTH] Database error:", result.error);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to save Google Calendar connection: " + result.error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[GOOGLE OAUTH] Successfully connected Google Calendar for:", googleEmail);

    return new Response(
      JSON.stringify({
        success: true,
        email: googleEmail,
        professional_id: professional_id || null,
        connection_id: result.data.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[GOOGLE OAUTH] Unexpected error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
