import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    let _messageId: string | null = null;

    try {
        const { messageId, mediaUrl } = await req.json();
        _messageId = messageId;

        console.log(`[TRANSCRIBE-AUDIO] Message ID: ${messageId}`);

        if (!messageId || !mediaUrl) {
            throw new Error("Missing messageId or mediaUrl");
        }

        // 1. Check OpenAI API Key first
        const openAiKey = Deno.env.get("OPENAI_API_KEY");
        if (!openAiKey) {
            console.error("[TRANSCRIBE-AUDIO] CRITICAL: OPENAI_API_KEY is not configured!");
            throw new Error("OPENAI_API_KEY not set - please configure it in Supabase Edge Function secrets");
        }
        // 2. Download audio file
        const audioResponse = await fetch(mediaUrl);

        if (!audioResponse.ok) {
            console.error(`[TRANSCRIBE-AUDIO] Download failed: ${audioResponse.status} ${audioResponse.statusText}`);
            throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
        }

        const audioBlob = await audioResponse.blob();
        const contentType = audioResponse.headers.get("content-type") || "audio/ogg";

        console.log(`[TRANSCRIBE-AUDIO] Downloaded ${audioBlob.size} bytes`);

        // Validate audio file
        if (audioBlob.size === 0) {
            throw new Error("Downloaded audio file is empty (0 bytes)");
        }

        if (audioBlob.size < 100) {
            console.warn(`[TRANSCRIBE-AUDIO] Warning: Audio file is very small (${audioBlob.size} bytes)`);
        }

        // Determine extension based on content type
        let extension = "ogg";
        if (contentType.includes("mpeg") || contentType.includes("mp3")) extension = "mp3";
        else if (contentType.includes("mp4") || contentType.includes("m4a")) extension = "m4a";
        else if (contentType.includes("wav")) extension = "wav";
        else if (contentType.includes("webm")) extension = "webm";

        const filename = `audio.${extension}`;

        // 3. Prepare FormData for OpenAI
        const formData = new FormData();
        formData.append("file", audioBlob, filename);
        formData.append("model", "whisper-1");
        formData.append("language", "pt"); // Specify Portuguese for better accuracy

        // 4. Send to OpenAI Whisper
        const transcriptionResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${openAiKey}`,
            },
            body: formData,
        });

        console.log(`[TRANSCRIBE-AUDIO] OpenAI Response Status: ${transcriptionResponse.status}`);

        if (!transcriptionResponse.ok) {
            const errorText = await transcriptionResponse.text();
            console.error(`[TRANSCRIBE-AUDIO] OpenAI API Error: ${errorText}`);
            throw new Error(`OpenAI API error (${transcriptionResponse.status}): ${errorText}`);
        }

        const transcriptionData = await transcriptionResponse.json();
        const transcriptionText = transcriptionData.text;

        console.log(`[TRANSCRIBE-AUDIO] Transcription successful!`);

        // 5. Update message in Supabase
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { error: updateError, data: updateData } = await supabase
            .from("messages")
            .update({ transcription: transcriptionText })
            .eq("id", messageId)
            .select("id, transcription");

        if (updateError) {
            console.error(`[TRANSCRIBE-AUDIO] Database update failed:`, updateError);
            throw updateError;
        }

        console.log(`[TRANSCRIBE-AUDIO] Done for message:`, messageId);

        return new Response(
            JSON.stringify({ success: true, transcription: transcriptionText }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error(`[TRANSCRIBE-AUDIO] Error for message`, _messageId, ':', error.message);

        // Attempt to write error to database for debugging visibility
        if (_messageId) {
            try {
                const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
                const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
                const supabase = createClient(supabaseUrl, supabaseKey);

                const errorMessage = `[ERRO] ${error.message}`;

                await supabase
                    .from("messages")
                    .update({ transcription: errorMessage })
                    .eq("id", _messageId);
            } catch (dbError) {
                console.error("[TRANSCRIBE-AUDIO] Failed to log error to DB:", dbError);
            }
        }

        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
