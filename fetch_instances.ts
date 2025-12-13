import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "http://localhost:54321";
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "your-service-role-key";

const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchInstances() {
    const { data, error } = await supabase.from("instances").select("*");
    if (error) {
        console.error("Error fetching instances:", error);
    } else {
        console.log("Instances:", JSON.stringify(data, null, 2));
    }
}

fetchInstances();
