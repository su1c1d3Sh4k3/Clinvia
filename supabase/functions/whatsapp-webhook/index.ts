import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const webhookData = await req.json();
        console.log('📥 Webhook recebido:', webhookData.event);

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')!;
        const evolutionApiKey = Deno.env.get('EVOLUTION_API_GLOBAL_KEY')!;

        const supabase = createClient(supabaseUrl, supabaseKey);

        // Processar apenas mensagens
        if (webhookData.event === 'messages.upsert') {
            const message = webhookData.data;
            const remoteJid = message.key.remoteJid;
            const instanceName = webhookData.instance;

            console.log('💬 Nova mensagem de:', remoteJid);

            // Não processar mensagens do próprio agente
            if (message.key.fromMe) {
                console.log('ℹ️ Mensagem do agente, ignorando');
                return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
            }

            // 1. Verificar se contato já existe e tem foto
            const { data: existingContact } = await supabase
                .from('contacts')
                .select('profile_pic_url')
                .eq('remote_jid', remoteJid)
                .single();

            let profilePicUrl = existingContact?.profile_pic_url || null;

            // Se não tiver foto, buscar na Evolution API
            if (!profilePicUrl) {
                console.log('📸 Contato sem foto, buscando na Evolution API...');
                try {
                    const encodedInstance = encodeURIComponent(instanceName);
                    const photoResponse = await fetch(
                        `${evolutionApiUrl}/chat/fetchProfilePictureURL/${encodedInstance}`,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'apikey': evolutionApiKey
                            },
                            body: JSON.stringify({ number: remoteJid })
                        }
                    );

                    if (photoResponse.ok) {
                        const photoData = await photoResponse.json();
                        if (Array.isArray(photoData) && photoData.length > 0) {
                            profilePicUrl = photoData[0].profilePictureUrl || null;
                        } else if (photoData && typeof photoData === 'object') {
                            profilePicUrl = photoData.profilePictureUrl || null;
                        }
                    }
                } catch (error) {
                    console.warn('⚠️ Erro ao buscar foto (continuando):', error);
                }
            }

            // 2. Salvar/atualizar contato
            const { error: contactError } = await supabase
                .from('contacts')
                .upsert({
                    remote_jid: remoteJid,
                    profile_pic_url: profilePicUrl,
                    push_name: message.pushName || null,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'remote_jid'
                });

            if (contactError) console.error('❌ Erro ao salvar contato:', contactError);

            // 3. Gerenciar Conversa (Ticket)
            // Buscar qualquer conversa ativa (Pendente ou Aberto)
            const { data: activeConversations } = await supabase
                .from('conversations')
                .select('*')
                .eq('contact_id', (await supabase.from('contacts').select('id').eq('remote_jid', remoteJid).single()).data?.id)
                .in('status', ['pendente', 'aberto'])
                .order('updated_at', { ascending: false })
                .limit(1);

            let conversationId;
            let ticketId;

            if (activeConversations && activeConversations.length > 0) {
                // Cenário: Existe ticket ativo (Pendente ou Aberto)
                const activeConv = activeConversations[0];
                conversationId = activeConv.id;
                ticketId = activeConv.ticket_id;
                console.log(`✅ Usando ticket ativo: ${ticketId} (ID: ${conversationId}, Status: ${activeConv.status})`);

                // Atualizar timestamp para subir na lista
                await supabase
                    .from('conversations')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('id', conversationId);
            } else {
                // Cenário: Não existe ou todos são Resolvidos -> Criar NOVO
                console.log('🆕 Criando novo ticket (Todos resolvidos ou novo contato)');

                const { data: contact } = await supabase
                    .from('contacts')
                    .select('id')
                    .eq('remote_jid', remoteJid)
                    .single();

                if (contact) {
                    // Criar nova conversa
                    const { data: newConv, error: createError } = await supabase
                        .from('conversations')
                        .insert({
                            contact_id: contact.id,
                            status: 'pendente',
                            unread_count: 1
                        })
                        .select()
                        .single();

                    if (createError) {
                        console.error('❌ Erro ao criar conversa:', createError);
                        throw createError;
                    }

                    conversationId = newConv.id;
                    ticketId = conversationId.substring(0, 5); // 5 primeiros dígitos

                    // Atualizar ticket_id
                    await supabase
                        .from('conversations')
                        .update({ ticket_id: ticketId })
                        .eq('id', conversationId);

                    console.log(`✅ Novo ticket criado: ${ticketId} (ID: ${conversationId})`);
                }
            }

            // 4. Salvar Mensagem
            if (conversationId) {
                const { error: messageError } = await supabase
                    .from('messages')
                    .insert({
                        conversation_id: conversationId,
                        body: message.conversation || message.extendedTextMessage?.text || message.imageMessage?.caption || 'Mídia',
                        message_type: message.imageMessage ? 'image' : 'text',
                        direction: 'inbound',
                        status: 'delivered',
                        media_url: null
                    });

                if (messageError) console.error('❌ Erro ao salvar mensagem:', messageError);
            }

            return new Response(
                JSON.stringify({ success: true, photoSaved: !!profilePicUrl }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ ok: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('❌ Erro no webhook:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
        );
    }
});
