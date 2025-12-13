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

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY;

console.log("Loaded Env Keys:", Object.keys(env));
if (!supabaseUrl) console.error("Missing VITE_SUPABASE_URL");
if (!supabaseKey) console.error("Missing VITE_SUPABASE_ANON_KEY");

const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseKey);

async function analyzeTable(tableName) {
    // Try to fetch one row to see columns if information_schema is blocked
    const { data, error } = await supabase.from(tableName).select('*').limit(1);

    if (error) {
        console.error(`Error fetching ${tableName}:`, error.message);
        return null;
    }

    if (data && data.length > 0) {
        console.log(`\nTable: ${tableName} (Columns detected from data)`);
        console.log(Object.keys(data[0]).join(', '));
        return Object.keys(data[0]);
    } else {
        console.log(`\nTable: ${tableName} (Empty, cannot infer columns from data)`);
        // If empty, we really need information_schema or just assume based on error logs.
        return [];
    }
}

async function runAnalysis() {
    console.log("Starting Schema Analysis...");

    await analyzeTable('conversations');
    await analyzeTable('contacts');
    await analyzeTable('messages');
    await analyzeTable('groups');
    await analyzeTable('instances');
}

runAnalysis();
