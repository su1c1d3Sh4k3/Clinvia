import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Manually read .env file
const envPath = path.resolve(process.cwd(), '.env');
let env = {};
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
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
}

const supabaseUrl = env.VITE_SUPABASE_URL || "http://localhost:54321";
const supabaseKey = env.VITE_SUPABASE_ANON_KEY || "your-anon-key";

console.log("Loaded Env Keys:", Object.keys(env));
console.log("Supabase URL:", supabaseUrl);
// console.log("Supabase Key:", supabaseKey); // Don't log key

if (!supabaseUrl.startsWith('http')) {
    console.error("Invalid Supabase URL. Please check .env file.");
    process.exit(1);
}

console.log("Connecting to Supabase at:", supabaseUrl);

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
