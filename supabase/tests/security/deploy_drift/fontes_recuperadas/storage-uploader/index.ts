import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-upload-secret"
};
serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    const secret = req.headers.get("x-upload-secret");
    if (secret !== "clinvia-upload-2026") {
      return new Response(JSON.stringify({
        error: "Unauthorized"
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const { filename, content } = await req.json();
    if (!filename || !content) {
      return new Response(JSON.stringify({
        error: "filename and content required"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    console.log("[storage-uploader] URL:", supabaseUrl);
    console.log("[storage-uploader] Key length:", serviceKey?.length ?? 0);
    const supabase = createClient(supabaseUrl, serviceKey);
    // Convert string content to Uint8Array
    const encoder = new TextEncoder();
    const bytes = encoder.encode(content);
    // Try upsert (update if exists, insert if not)
    const { data, error } = await supabase.storage.from("manuals").upload(filename, bytes, {
      contentType: "text/markdown; charset=utf-8",
      upsert: true
    });
    if (error) {
      console.error("[storage-uploader] Upload error:", error);
      return new Response(JSON.stringify({
        error: error.message,
        details: error
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    console.log("[storage-uploader] Uploaded:", filename);
    return new Response(JSON.stringify({
      success: true,
      filename,
      data
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    console.error("[storage-uploader] Fatal:", err.message);
    return new Response(JSON.stringify({
      error: err.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
