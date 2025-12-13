
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const { data: messages, error } = await supabase
    .from("messages")
    .select("id, body, message_type, media_url, transcription, created_at")
    .order("created_at", { ascending: false })
    .limit(5);

if (error) {
    console.error("Error fetching messages:", error);
} else {
    console.log("Latest 5 messages:");
    messages.forEach(m => {
        console.log(`ID: ${m.id}`);
        console.log(`Type: ${m.message_type}`);
        console.log(`Body: ${m.body}`);
        console.log(`Media URL: ${m.media_url}`);
        console.log(`Transcription: ${m.transcription}`);
        console.log(`Created At: ${m.created_at}`);
        console.log("-------------------");
    });
}
