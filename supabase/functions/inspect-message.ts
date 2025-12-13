
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectLatestMessage() {
    const { data: messages, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

    if (error) {
        console.error('Error fetching message:', error);
        return;
    }

    if (!messages || messages.length === 0) {
        console.log('No messages found.');
        return;
    }

    const msg = messages[0];
    console.log('Latest Message:');
    console.log('ID:', msg.id);
    console.log('Type:', msg.message_type);
    console.log('Body:', msg.body);
    console.log('Media URL:', msg.media_url);
    console.log('Created At:', msg.created_at);

    if (msg.media_url) {
        console.log('\nChecking Media URL Headers...');
        try {
            const res = await fetch(msg.media_url, { method: 'HEAD' });
            console.log('Status:', res.status);
            console.log('Content-Type:', res.headers.get('content-type'));
            console.log('Content-Length:', res.headers.get('content-length'));
        } catch (err) {
            console.error('Error fetching media URL:', err);
        }
    }
}

inspectLatestMessage();
