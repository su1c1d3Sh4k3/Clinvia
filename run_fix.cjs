const https = require('https');

const url = 'https://swfshqvvbohnahdyndch.supabase.co/functions/v1/run-migration';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3ZnNocXZ2Ym9obmFoZHluZGNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1OTAyMzIsImV4cCI6MjA3OTE2NjIzMn0.rUja2PsYj9kWODdizhJNS6HjfA9Tg7DrJJylUH8RTnY';

const options = {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
    }
};

const req = https.request(url, options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log('Body:', data);
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.end();
