import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const url = "https://swfshqvvbohnahdyndch.supabase.co/functions/v1/run-migration";
const key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3ZnNocXZ2Ym9obmFoZHluZGNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1OTAyMzIsImV4cCI6MjA3OTE2NjIzMn0.rUja2PsYj9kWODdizhJNS6HjfA9Tg7DrJJylUH8RTnY";

async function run() {
    try {
        const filename = process.argv[2];
        if (!filename) {
            console.error("Please provide a migration filename.");
            process.exit(1);
        }
        const migrationPath = path.join(__dirname, 'supabase', 'migrations', filename);
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log("Executing migration:", migrationPath);

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${key}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ sql: sql })
        });

        const text = await response.text();
        console.log("Status:", response.status);
        console.log("Response:", text);
    } catch (error) {
        console.error("Error:", error);
    }
}

run();
