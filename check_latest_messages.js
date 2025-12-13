import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manually read .env file
const envPath = path.resolve(process.cwd(), '.env');
let env = {};
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    console.log("Env file found. Length:", envContent.length);
    envContent.split('\n').forEach(line => {
        let [key, value] = line.split('=');
        if (key && value) {
            value = value.trim();
            if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            env[key.trim()] = value;
        }
    });
} else {
    console.error("No .env file found at:", envPath);
}

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY;

console.log("Loaded Env Keys:", Object.keys(env));
if (!supabaseUrl) console.error("Missing VITE_SUPABASE_URL");
if (!supabaseKey) console.error("Missing VITE_SUPABASE_ANON_KEY");

if (!supabaseUrl || !supabaseKey) {
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseKey);

async function checkData() {
    console.log("Checking instances...");
    const { data: instances, error: instError } = await supabase
        .from('instances')
        .select('*');

    if (instError) console.error("Error fetching instances:", instError);
    else console.log("Instances:", JSON.stringify(instances, null, 2));

    console.log("\nChecking latest conversations...");
    const { data: conversations, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(5);

    if (convError) console.error("Error fetching conversations:", convError);
    else console.log("Latest Conversations:", JSON.stringify(conversations, null, 2));

    if (conversations && conversations.length > 0) {
        const convId = conversations[0].id;
        console.log(`\nChecking messages for conversation ${convId}...`);
        const { data: messages, error: msgError } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', convId)
            .order('created_at', { ascending: false })
            .limit(5);

        if (msgError) console.error("Error fetching messages:", msgError);
        else console.log("Latest Messages:", JSON.stringify(messages, null, 2));
    } else {
        console.log("\nNo conversations found. Checking raw messages table...");
        const { data: messages, error: msgError } = await supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);

        if (msgError) console.error("Error fetching messages:", msgError);
        else console.log("Latest Raw Messages:", JSON.stringify(messages, null, 2));
    }
}

checkData();
