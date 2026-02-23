import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const UZAPI_URL = 'https://clinvia.uazapi.com';

interface FollowUpToProcess {
    id: string;
    conversation_id: string;
    category_id: string;
    current_template_index: number;
    conversation: {
        id: string;
        contact_id: string;
        instance_id: string;
        user_id: string;
        contact: {
            number: string;
            push_name: string;
        };
        instance: {
            apikey: string;
            name: string;
            status: string;
        };
    };
}

interface FollowUpTemplate {
    id: string;
    name: string;
    message: string;
    time_minutes: number;
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const results = {
        processed: 0,
        sent: 0,
        errors: [] as string[],
        completed: 0
    };

    try {
        console.log('[auto-follow-up] Starting processing');
        const now = new Date();

        // 1. Find all follow ups that need processing
        const { data: pendingFollowUps, error: fetchError } = await supabase
            .from('conversation_follow_ups')
            .select(`
        id,
        conversation_id,
        category_id,
        current_template_index,
        conversation:conversations!conversation_id (
          id,
          contact_id,
          instance_id,
          user_id,
          contact:contacts!contact_id (
            number,
            push_name
          ),
          instance:instances!instance_id (
            apikey,
            name,
            status
          )
        )
      `)
            .eq('auto_send', true)
            .eq('completed', false)
            .lte('next_send_at', now.toISOString());

        if (fetchError) {
            console.error('Error fetching pending follow ups:', fetchError);
            throw new Error(`Failed to fetch pending follow ups: ${fetchError.message}`);
        }

        console.log(`Found ${pendingFollowUps?.length || 0} pending follow ups to process`);

        if (!pendingFollowUps || pendingFollowUps.length === 0) {
            return new Response(
                JSON.stringify({ success: true, message: 'No pending follow ups', ...results }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 2. Process each pending follow up
        for (const followUp of pendingFollowUps) {
            results.processed++;

            try {
                const conv = (followUp as any).conversation;
                if (!conv || !conv.instance || !conv.contact) {
                    console.log(`Skipping follow up ${followUp.id}: missing conversation data`);
                    results.errors.push(`Follow up ${followUp.id}: missing conversation data`);
                    continue;
                }

                // Check if instance is connected
                if (conv.instance.status !== 'connected') {
                    console.log(`Skipping follow up ${followUp.id}: instance ${conv.instance.name} not connected`);
                    results.errors.push(`Follow up ${followUp.id}: instance not connected`);
                    continue;
                }

                // 3. Get templates for this category, sorted by time_minutes
                const { data: templates, error: templateError } = await supabase
                    .from('follow_up_templates')
                    .select('id, name, message, time_minutes')
                    .eq('category_id', followUp.category_id)
                    .order('time_minutes', { ascending: true });

                if (templateError || !templates || templates.length === 0) {
                    console.log(`Skipping follow up ${followUp.id}: no templates found`);
                    results.errors.push(`Follow up ${followUp.id}: no templates`);
                    continue;
                }

                // 4. Get current template
                const currentIndex = followUp.current_template_index || 0;
                if (currentIndex >= templates.length) {
                    // All templates sent, mark as completed
                    await supabase
                        .from('conversation_follow_ups')
                        .update({ completed: true, auto_send: false })
                        .eq('id', followUp.id);

                    console.log(`Follow up ${followUp.id} completed all templates`);
                    results.completed++;
                    continue;
                }

                const template = templates[currentIndex];
                console.log(`Processing follow up ${followUp.id}, template ${currentIndex + 1}/${templates.length}: "${template.name}"`);

                // 5. Send message via Uzapi
                const targetNumber = conv.contact.number.includes('@')
                    ? conv.contact.number.split('@')[0]
                    : conv.contact.number;

                const sendUrl = `${UZAPI_URL}/send/text`;
                const payload = {
                    number: targetNumber,
                    text: template.message
                };

                const sendResponse = await fetch(sendUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'token': conv.instance.apikey
                    },
                    body: JSON.stringify(payload)
                });

                if (!sendResponse.ok) {
                    const errorText = await sendResponse.text();
                    console.error(`Failed to send message for follow up ${followUp.id}:`, errorText);
                    results.errors.push(`Follow up ${followUp.id}: send failed - ${errorText}`);
                    continue;
                }

                const sendData = await sendResponse.json();

                // 6. Save message to database
                await supabase
                    .from('messages')
                    .insert({
                        conversation_id: followUp.conversation_id,
                        body: template.message,
                        direction: 'outbound',
                        message_type: 'text',
                        evolution_id: sendData.messageid || sendData.id || null,
                        user_id: conv.user_id,
                        status: 'sent'
                    });

                // 7. Update conversation
                await supabase
                    .from('conversations')
                    .update({
                        updated_at: new Date().toISOString(),
                        last_message_at: new Date().toISOString()
                    })
                    .eq('id', followUp.conversation_id);

                // 8. Calculate next send time
                const nextIndex = currentIndex + 1;
                let nextSendAt = null;
                let completed = false;

                if (nextIndex < templates.length) {
                    const nextTemplate = templates[nextIndex];
                    // Calculate next send time based on next template's time_minutes from NOW
                    nextSendAt = new Date(Date.now() + nextTemplate.time_minutes * 60 * 1000);
                } else {
                    completed = true;
                }

                // 9. Update follow up record
                await supabase
                    .from('conversation_follow_ups')
                    .update({
                        current_template_index: nextIndex,
                        next_send_at: nextSendAt?.toISOString() || null,
                        completed,
                        last_seen_template_id: template.id
                    })
                    .eq('id', followUp.id);

                results.sent++;
                console.log(`Follow up ${followUp.id} message sent, next index: ${nextIndex}, completed: ${completed}`);

            } catch (itemError: any) {
                console.error(`Error processing follow up ${followUp.id}:`, itemError);
                results.errors.push(`Follow up ${followUp.id}: ${itemError.message}`);
            }
        }

        console.log('[auto-follow-up] Done. Sent:', results.sent, 'Errors:', results.errors.length);

        return new Response(
            JSON.stringify({ success: true, ...results }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('[auto-follow-up] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message, ...results }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
