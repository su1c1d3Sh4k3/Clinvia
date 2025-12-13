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

        console.log(`[TRANSCRIBE-AUDIO] ========== START ==========`);
        console.log(`[TRANSCRIBE-AUDIO] Message ID: ${messageId}`);
        console.log(`[TRANSCRIBE-AUDIO] Media URL: ${mediaUrl}`);

        if (!messageId || !mediaUrl) {
            throw new Error("Missing messageId or mediaUrl");
        }

        // 1. Check OpenAI API Key first
        const openAiKey = Deno.env.get("OPENAI_API_KEY");
        if (!openAiKey) {
            console.error("[TRANSCRIBE-AUDIO] CRITICAL: OPENAI_API_KEY is not configured!");
            throw new Error("OPENAI_API_KEY not set - please configure it in Supabase Edge Function secrets");
        }
        console.log(`[TRANSCRIBE-AUDIO] OpenAI API Key: configured (${openAiKey.substring(0, 7)}...)`);

        // 2. Download audio file
        console.log(`[TRANSCRIBE-AUDIO] Downloading audio file...`);
        const audioResponse = await fetch(mediaUrl);

        if (!audioResponse.ok) {
            console.error(`[TRANSCRIBE-AUDIO] Download failed: ${audioResponse.status} ${audioResponse.statusText}`);
            throw new Error(`Failed to download audio: ${audioResponse.status} ${audioResponse.statusText}`);
        }

        const audioBlob = await audioResponse.blob();
        const contentType = audioResponse.headers.get("content-type") || "audio/ogg";

        console.log(`[TRANSCRIBE-AUDIO] Download successful!`);
        console.log(`[TRANSCRIBE-AUDIO] Content-Type: ${contentType}`);
        console.log(`[TRANSCRIBE-AUDIO] File Size: ${audioBlob.size} bytes`);

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
        console.log(`[TRANSCRIBE-AUDIO] Using filename: ${filename}`);

        // 3. Prepare FormData for OpenAI
        console.log(`[TRANSCRIBE-AUDIO] Preparing request to OpenAI Whisper API...`);
        const formData = new FormData();
        formData.append("file", audioBlob, filename);
        formData.append("model", "whisper-1");
        formData.append("language", "pt"); // Specify Portuguese for better accuracy

        // 4. Send to OpenAI Whisper
        console.log(`[TRANSCRIBE-AUDIO] Sending to OpenAI...`);
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
        console.log(`[TRANSCRIBE-AUDIO] Result: "${transcriptionText.substring(0, 100)}${transcriptionText.length > 100 ? '...' : ''}"`);

        // 5. Update message in Supabase
        console.log(`[TRANSCRIBE-AUDIO] Saving transcription to database...`);
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

        console.log(`[TRANSCRIBE-AUDIO] Database updated successfully!`, updateData);
        console.log(`[TRANSCRIBE-AUDIO] ========== END ==========`);

        return new Response(
            JSON.stringify({ success: true, transcription: transcriptionText }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error(`[TRANSCRIBE-AUDIO] ========== ERROR ==========`);
        console.error(`[TRANSCRIBE-AUDIO] Error Type: ${error.constructor.name}`);
        console.error(`[TRANSCRIBE-AUDIO] Error Message: ${error.message}`);
        console.error(`[TRANSCRIBE-AUDIO] Full Error:`, error);

        // Attempt to write error to database for debugging visibility
        if (_messageId) {
            try {
                const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
                const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
                const supabase = createClient(supabaseUrl, supabaseKey);

                const errorMessage = `[ERRO] ${error.message}`;
                console.log(`[TRANSCRIBE-AUDIO] Writing error to database for message ${_messageId}`);

                await supabase
                    .from("messages")
                    .update({ transcription: errorMessage })
                    .eq("id", _messageId);

                console.log(`[TRANSCRIBE-AUDIO] Error logged to database`);
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
