/**
 * create-professional-calendar
 *
 * Cria automaticamente um sub-calendário no Google Calendar para um profissional
 * recém-adicionado à plataforma, aproveitando a conexão de clínica já existente.
 *
 * Chamado pelo ProfessionalModal após salvar um novo profissional quando
 * a clínica já possui uma conexão Google Calendar ativa.
 *
 * Input: { user_id, professional_id, professional_name }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";

// ─── Renovar access_token usando refresh_token ───────────────────────────────
async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token",
      }),
    });
    const data = await res.json();
    if (res.ok && data.access_token) {
      return { access_token: data.access_token, expires_in: data.expires_in || 3600 };
    }
    console.error("[CREATE-CAL] Token refresh failed:", data.error, data.error_description);
    return null;
  } catch (e) {
    console.error("[CREATE-CAL] Token refresh exception:", e);
    return null;
  }
}

// ─── Criar sub-calendário no Google Calendar ─────────────────────────────────
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
        `[CREATE-CAL] createGoogleCalendar failed for "${calendarName}": ${res.status} — ${errBody.substring(0, 400)}`,
      );
      return null;
    }

    const data = await res.json();
    console.log(`[CREATE-CAL] Created calendar "${calendarName}" → id=${data.id}`);
    return data.id as string;
  } catch (e) {
    console.error(`[CREATE-CAL] createGoogleCalendar exception:`, e);
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

    const { user_id, professional_id, professional_name } = await req.json();

    if (!user_id || !professional_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing user_id or professional_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log(`[CREATE-CAL] Creating calendar for professional ${professional_id} (${professional_name || "?"})`);

    // 1. Buscar connection da clínica (professional_id IS NULL) para obter tokens
    const { data: clinicConn, error: connErr } = await supabase
      .from("professional_google_calendars")
      .select("id, access_token, refresh_token, token_expiry, google_account_email")
      .eq("user_id", user_id)
      .is("professional_id", null)
      .eq("is_active", true)
      .maybeSingle();

    if (connErr || !clinicConn) {
      const msg = connErr?.message || "No active clinic Google Calendar connection found";
      console.log(`[CREATE-CAL] ${msg} — nothing to do`);
      return new Response(
        JSON.stringify({ success: false, error: msg }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Verificar se o profissional já tem um sub-calendário (evitar duplicação)
    const { data: existingProfConn } = await supabase
      .from("professional_google_calendars")
      .select("id, calendar_id")
      .eq("user_id", user_id)
      .eq("professional_id", professional_id)
      .maybeSingle();

    if (existingProfConn?.calendar_id && existingProfConn.calendar_id !== "primary") {
      console.log(`[CREATE-CAL] Professional already has calendar ${existingProfConn.calendar_id}, nothing to do`);
      return new Response(
        JSON.stringify({ success: true, calendar_id: existingProfConn.calendar_id, already_existed: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Obter access_token válido (renovar se expirado)
    let accessToken = clinicConn.access_token;
    const now = new Date();
    const expiry = clinicConn.token_expiry ? new Date(clinicConn.token_expiry) : null;
    const isExpired = !expiry || expiry.getTime() - now.getTime() < 5 * 60 * 1000;

    if (isExpired || !accessToken) {
      console.log("[CREATE-CAL] Access token expired or missing, refreshing...");
      const refreshed = await refreshAccessToken(clinicConn.refresh_token);
      if (!refreshed) {
        return new Response(
          JSON.stringify({ success: false, error: "Could not refresh access token" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      accessToken = refreshed.access_token;
      // Salvar novo token na connection da clínica
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await supabase
        .from("professional_google_calendars")
        .update({ access_token: accessToken, token_expiry: newExpiry })
        .eq("id", clinicConn.id);
    }

    // 4. Criar sub-calendário no Google
    const calName = professional_name || `Prof ${professional_id.slice(0, 8)}`;
    const newCalendarId = await createGoogleCalendar(accessToken, calName);

    if (!newCalendarId) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create Google Calendar" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 5. Upsert da connection do profissional com o novo calendar_id
    const profPayload = {
      user_id,
      professional_id,
      google_account_email: clinicConn.google_account_email,
      refresh_token: clinicConn.refresh_token,
      access_token: accessToken,
      token_expiry: clinicConn.token_expiry,
      is_active: true,
      calendar_id: newCalendarId,
      sync_mode: "one_way",
      updated_at: new Date().toISOString(),
    };

    if (existingProfConn) {
      // Atualizar connection existente (estava com "primary")
      const { error: updErr } = await supabase
        .from("professional_google_calendars")
        .update(profPayload)
        .eq("id", existingProfConn.id);
      if (updErr) {
        console.error("[CREATE-CAL] Update error:", updErr.message);
        return new Response(
          JSON.stringify({ success: false, error: updErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else {
      // Inserir nova connection
      const { error: insErr } = await supabase
        .from("professional_google_calendars")
        .insert(profPayload);
      if (insErr) {
        console.error("[CREATE-CAL] Insert error:", insErr.message);
        return new Response(
          JSON.stringify({ success: false, error: insErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    console.log(`[CREATE-CAL] Done: professional ${professional_id} → calendar_id=${newCalendarId}`);

    return new Response(
      JSON.stringify({ success: true, calendar_id: newCalendarId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[CREATE-CAL] Unexpected error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
