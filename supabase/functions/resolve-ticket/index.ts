import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * resolve-ticket — encerra a conversa pelo botão "Finalizar" do inbox.
 *
 * O resumo da IA NÃO é gerado aqui. Ao gravar status='resolved' o trigger
 * zz_conversation_summary_enqueue enfileira a conversa e o worker
 * `conversation-summary-worker` gera o resumo daquele ticket e grava em
 * conversations.summary + ai_analysis + contacts.quality. Assim o resumo existe
 * em TODO encerramento (encerramento automático, etapa terminal do CRM,
 * campanha, API...), não só neste caminho — e finalizar deixa de esperar a
 * OpenAI responder.
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serveMonitored("resolve-ticket", async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { conversationId } = await req.json();
        console.log('Resolving ticket:', conversationId);

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('id, user_id')
            .eq('id', conversationId)
            .single();

        if (convError) throw convError;

        const conversationUserId = conversation.user_id;

        // USER RULE: quem encerra o atendimento leva a atribuição da conversa.
        // Resolve o team_member do chamador via JWT; chamadas sem usuário
        // (service role/automação) não alteram a atribuição.
        let resolverTeamMemberId: string | null = null;
        try {
            const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
            if (jwt) {
                const { data: userData } = await supabase.auth.getUser(jwt);
                if (userData?.user) {
                    const { data: tm } = await supabase
                        .from('team_members')
                        .select('id')
                        .eq('auth_user_id', userData.user.id)
                        .eq('user_id', conversationUserId)
                        .maybeSingle();
                    resolverTeamMemberId = tm?.id ?? null;
                }
            }
        } catch (e) {
            console.error('Could not resolve caller team member:', e);
        }

        const { error: updateConvError } = await supabase
            .from('conversations')
            .update({
                status: 'resolved',
                unread_count: 0,
                ...(resolverTeamMemberId ? { assigned_agent_id: resolverTeamMemberId } : {})
            })
            .eq('id', conversationId);

        if (updateConvError) throw updateConvError;

        return new Response(
            JSON.stringify({ success: true, summary_queued: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Error:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
