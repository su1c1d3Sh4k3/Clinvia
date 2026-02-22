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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Decodificar e validar state
    let stateData: { user_id: string; professional_id: string | null; nonce: string; timestamp: number };
    try {
      stateData = JSON.parse(atob(state));
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid state parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { user_id, professional_id } = stateData;

    if (!user_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing user_id in state" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!GOOGLE_CLIENT_SECRET) {
      console.error("[GOOGLE OAUTH] GOOGLE_CLIENT_SECRET not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Google client secret not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PASSO 1: Trocar code por tokens
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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { access_token, refresh_token, expires_in } = tokenData;

    if (!refresh_token) {
      console.error("[GOOGLE OAUTH] No refresh_token received. User may need to revoke access and reconnect.");
      return new Response(
        JSON.stringify({
          success: false,
          error: "No refresh token received. Please revoke app access in your Google account and try again."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // PASSO 2: Buscar email da conta Google
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

    // PASSO 3: Salvar no banco
    console.log("[GOOGLE OAUTH] Step 3: Saving to database...");

    const tokenExpiry = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();

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
      result = await supabase
        .from("professional_google_calendars")
        .update(upsertPayload)
        .eq("id", existing.id)
        .select()
        .single();
      console.log("[GOOGLE OAUTH] Updated existing connection");
    } else {
      result = await supabase
        .from("professional_google_calendars")
        .insert({ ...upsertPayload, calendar_id: "primary", sync_mode: "one_way" })
        .select()
        .single();
      console.log("[GOOGLE OAUTH] Created new connection");
    }

    if (result.error) {
      console.error("[GOOGLE OAUTH] Database error:", result.error);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to save Google Calendar connection: " + result.error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[GOOGLE OAUTH] Unexpected error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
