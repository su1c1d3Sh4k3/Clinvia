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

const functionUrl = `${supabaseUrl}/functions/v1/evolution-webhook`;

console.log("Target URL:", functionUrl);

const payload = {
    event: "messages.upsert",
    instance: "Minha_instancia_2",
    data: {
        key: {
            remoteJid: "5511999999999@s.whatsapp.net",
            fromMe: false,
            id: "TEST_MSG_" + Date.now()
        },
        pushName: "Test User",
        message: {
            conversation: "Test message from reproduction script " + new Date().toISOString()
        },
        messageType: "conversation"
    }
};

async function sendWebhook() {
    try {
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
            },
            body: JSON.stringify(payload)
        });

        const text = await response.text();
        console.log("Response Status:", response.status);
        console.log("Response Body:", text);
    } catch (error) {
        console.error("Error sending webhook:", error);
    }
}

sendWebhook();
