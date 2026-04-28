import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FAILURE_THRESHOLD = 3;

// Parseia o body de erro retornado pela UZAPI e extrai a mensagem mais
// amigável possível para o usuário final, junto com metadados úteis.
//
// Exemplo de body real (provider_code=463, WHATSAPP_REACHOUT_TIMELOCK):
//   { provider_message_ptbr: "O WhatsApp está sob uma restrição temporária...",
//     provider_code: 463, error_key: "WHATSAPP_REACHOUT_TIMELOCK", ... }
//
// Restrições de policy do WhatsApp (qualidade/quota/timelock) NÃO indicam que
// a instância UZAPI está desconectada — a sessão WhatsApp está saudável, é o
// WhatsApp que está limitando o número. Por isso retornamos isPolicyRestriction
// para o caller decidir se deve incrementar consecutive_send_failures.
function parseUzapiErrorBody(errorText: string): {
  friendly: string;
  providerCode: number | null;
  errorKey: string | null;
  isPolicyRestriction: boolean;
} {
  let parsed: any = null;
  try {
    parsed = JSON.parse(errorText);
  } catch {
    return {
      friendly: (errorText || '').trim() || 'Erro desconhecido da UZAPI',
      providerCode: null,
      errorKey: null,
      isPolicyRestriction: false,
    };
  }

  const friendly: string =
    parsed?.provider_message_ptbr ||
    parsed?.provider_message ||
    parsed?.message ||
    parsed?.error ||
    parsed?.details?.message ||
    (errorText || '').trim() ||
    'Erro desconhecido da UZAPI';

  const providerCode: number | null =
    typeof parsed?.provider_code === 'number' ? parsed.provider_code : null;
  const errorKey: string | null = parsed?.error_key ?? null;

  // Heurísticas: erros de policy/quota/qualidade do WhatsApp.
  // Códigos comuns: 463 (REACHOUT_TIMELOCK), 470 (re-engagement window),
  // 471 (spam rate limit), 472 (number quality issue).
  const policyCodes = new Set([463, 470, 471, 472, 473]);
  const policyKeyHints = ['REACHOUT', 'QUOTA', 'RATE', 'TIMELOCK', 'QUALITY', 'BLOCKED', 'TEMPLATE_LIMIT'];
  const isPolicyRestriction =
    (providerCode !== null && policyCodes.has(providerCode)) ||
    (errorKey !== null && policyKeyHints.some((k) => errorKey.toUpperCase().includes(k))) ||
    /restri[cç][aã]o/i.test(friendly);

  return { friendly, providerCode, errorKey, isPolicyRestriction };
}

// Auto-disconnect proativo: incrementa contador de falhas consecutivas e,
// ao atingir o threshold, marca a instância como disconnected + cria notificação.
// Captura o cenário do WhatsApp Multi-Device em que UZAPI continua reportando
// 'connected' mas falha em todos os envios (timeout/5xx).
async function bumpFailureAndMaybeDisconnect(
  supabaseClient: any,
  instance: { id: string; name: string; user_id: string; status: string },
  errorCode: 'uzapi_error' | 'uzapi_timeout',
): Promise<void> {
  try {
    // Lê valor atual + atualiza atomicamente via RPC seria ideal, mas como não
    // temos uma RPC dedicada, fazemos read-modify-write tolerante a corrida
    // (no pior caso, conta a mais — não é crítico).
    const { data: cur } = await supabaseClient
      .from('instances')
      .select('consecutive_send_failures, status, last_disconnect_notified_at')
      .eq('id', instance.id)
      .maybeSingle();

    const prevCount: number = cur?.consecutive_send_failures ?? 0;
    const newCount = prevCount + 1;

    const updates: Record<string, unknown> = { consecutive_send_failures: newCount };

    if (newCount >= FAILURE_THRESHOLD && cur?.status === 'connected') {
      updates.status = 'disconnected';
      updates.last_disconnect_reason =
        errorCode === 'uzapi_timeout'
          ? 'WhatsApp parou de responder (timeouts consecutivos). Reconecte escaneando o QR code.'
          : 'WhatsApp está rejeitando envios (erros consecutivos). Reconecte escaneando o QR code.';

      // Notificação 1x/24h (mesma regra do health-check)
      const lastNotified = cur?.last_disconnect_notified_at
        ? new Date(cur.last_disconnect_notified_at).getTime()
        : 0;
      const hoursSince = (Date.now() - lastNotified) / 3_600_000;
      if (hoursSince >= 24) {
        try {
          await supabaseClient.from('notifications').insert({
            type: 'instance_disconnected',
            title: `Instância "${instance.name}" desconectada`,
            description:
              `${updates.last_disconnect_reason} ` +
              `Vá em Conexões e reconecte para voltar a enviar mensagens.`,
            metadata: {
              instance_id: instance.id,
              instance_name: instance.name,
              detected_by: 'send-message-threshold',
              error_code: errorCode,
              consecutive_failures: newCount,
            },
            related_user_id: instance.user_id,
          });
          updates.last_disconnect_notified_at = new Date().toISOString();
        } catch (notifErr) {
          console.error('[bumpFailure] failed to insert notification:', notifErr);
        }
      }
    }

    await supabaseClient.from('instances').update(updates).eq('id', instance.id);
  } catch (err) {
    console.error('[bumpFailure] failed to update consecutive_send_failures:', err);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const reqData = await req.json();
    let { conversationId, body, messageType = 'text', mediaUrl, caption, replyId, quotedBody, quotedSender, contactId, groupId, mentions, forward, contactData } = reqData;
    console.log('[evolution-send-message] Start conversationId:', conversationId);

    // ✅ CONVERSATION CREATION LOGIC (Agent-initiated conversations)
    // Se não temos conversationId, mas temos contactId ou groupId, buscar/criar conversa
    if (!conversationId && (contactId || groupId)) {

      // 1. Identificar agente autenticado
      const authHeader = req.headers.get('Authorization');
      let authenticatedAgentId = null;
      let userId = null;

      if (authHeader) {
        try {
          const token = authHeader.replace('Bearer ', '');
          const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

          if (user && !userError) {
            userId = user.id;

            const { data: teamMember } = await supabaseClient
              .from('team_members')
              .select('id, user_id')
              .eq('auth_user_id', user.id)
              .single();

            if (teamMember) {
              authenticatedAgentId = teamMember.id;
              userId = teamMember.user_id; // Owner user_id
            }
          }
        } catch (authError) {
          console.error('[CONV-CREATE] ❌ Auth error:', authError);
        }
      }

      if (!userId) {
        throw new Error('Cannot create conversation: User not authenticated');
      }

      // 2. Buscar instância a partir do contactId ou groupId
      let instanceId = null;

      if (contactId) {
        const { data: contact } = await supabaseClient
          .from('contacts')
          .select('instance_id')
          .eq('id', contactId)
          .single();
        instanceId = contact?.instance_id;
      } else if (groupId) {
        const { data: group } = await supabaseClient
          .from('groups')
          .select('instance_id')
          .eq('id', groupId)
          .single();
        instanceId = group?.instance_id;
      }

      if (!instanceId) {
        throw new Error('Cannot create conversation: Instance not found for contact/group');
      }

      // 3. Buscar conversa existente
      let searchQuery = supabaseClient
        .from('conversations')
        .select('*')
        .eq('instance_id', instanceId)
        .eq('user_id', userId)
        .in('status', ['pending', 'open'])
        .order('created_at', { ascending: false })
        .limit(1);

      if (contactId) searchQuery = searchQuery.eq('contact_id', contactId);
      if (groupId) searchQuery = searchQuery.eq('group_id', groupId);

      const { data: existingConvs } = await searchQuery;

      if (existingConvs && existingConvs.length > 0) {
        conversationId = existingConvs[0].id;
      } else if (authenticatedAgentId) {
        // 4. Criar nova conversa como 'open' + assigned to agent

        const { data: newConv, error: createError } = await supabaseClient
          .from('conversations')
          .insert({
            contact_id: contactId || null,
            group_id: groupId || null,
            instance_id: instanceId,
            user_id: userId,
            status: 'open',
            source: 'panel', // Criado pelo painel
            assigned_agent_id: authenticatedAgentId
          })
          .select()
          .single();

        if (createError) throw createError;
        conversationId = newConv.id;
      } else {
        throw new Error('Cannot create conversation: Agent not authenticated');
      }
    }

    // Buscar conversation (agora com conversationId garantido)
    if (!conversationId) {
      throw new Error('Conversation ID is required');
    }

    const { data: conversation, error: convError } = await supabaseClient
      .from('conversations')
      .select('*, instance:instances(*)')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      throw new Error(`Conversation not found: ${convError?.message}`);
    }

    const instance = conversation.instance;
    if (!instance || !instance.apikey) {
      throw new Error('Instance configuration missing');
    }

    let remoteJid = '';
    let isGroup = false;

    if (conversation.group_id) {
      const { data: group, error: groupError } = await supabaseClient
        .from('groups')
        .select('remote_jid')
        .eq('id', conversation.group_id)
        .single();

      if (groupError || !group?.remote_jid) throw new Error('Group JID not found');
      remoteJid = group.remote_jid;
      isGroup = true;
    } else if (conversation.contact_id) {
      const { data: contact, error: contactError } = await supabaseClient
        .from('contacts')
        .select('number')
        .eq('id', conversation.contact_id)
        .single();

      if (contactError || !contact?.number) throw new Error('Contact number not found');
      remoteJid = contact.number;
    } else {
      throw new Error('Invalid conversation: missing group_id and contact_id');
    }

    if (instance.status !== 'connected') {
      console.warn(`Instance ${instance.name} status is ${instance.status}, attempting to send anyway.`);
    }

    const userId = instance.user_id;

    // ✅ Lógica de Auth e Status Update (Human vs API)
    // SOLUÇÃO: Passar JWT diretamente para getUser(jwt)
    const authHeader = req.headers.get('Authorization');
    let authenticatedAgentId = null;

    if (authHeader) {
      try {
        // Extrair token do header
        const token = authHeader.replace('Bearer ', '');

        // ✅ CORRETO: Usar getUser(jwt) passando o token diretamente
        // Funciona com qualquer cliente (SERVICE_ROLE ou ANON_KEY)
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

        if (user && !userError) {
          // Buscar team_member usando o cliente SERVICE_ROLE (bypass RLS)
          const { data: teamMember, error: teamError } = await supabaseClient
            .from('team_members')
            .select('id')
            .eq('auth_user_id', user.id)
            .single();

          if (teamMember && !teamError) {
            authenticatedAgentId = teamMember.id;
          } else {
            console.warn('⚠️ Team member not found for user:', user.id, teamError);
          }
        }
      } catch (authError) {
        console.error('❌ Auth error:', authError);
      }
    }

    // 3. Verificar flag wasSentByApi e Status
    // Se NÃO foi enviado pela API (ou flag não existe/false) -> É Humano
    const isApiMessage = reqData?.message?.wasSentByApi === true;

    if (!isApiMessage) {
      if (conversation.status === 'pending') {
        try {
          const updates: any = {
            status: 'open'
          };

          // Se identificamos o agente logado, atribuir a ele
          if (authenticatedAgentId) {
            updates.assigned_agent_id = authenticatedAgentId;
          } else if (conversation.assigned_agent_id) {
            // Mantém o agente atual
          }

          const { error: updateError } = await supabaseClient
            .from('conversations')
            .update(updates)
            .eq('id', conversationId);

          if (updateError) {
            console.error('[AUTO-UPDATE] Error updating conversation:', updateError);
          } else {
            conversation.status = 'open'; // Atualizar local
            if (updates.assigned_agent_id) conversation.assigned_agent_id = updates.assigned_agent_id;
          }

        } catch (statusError) {
          console.error('[AUTO-UPDATE] Exception updating status:', statusError);
        }
      }
    }

    // ✅ Assinatura do agente: prioriza quem REALMENTE está enviando (authenticatedAgentId)
    // Fallback para assigned_agent_id apenas quando não há agente autenticado (ex: envio via API)
    const signerAgentId = authenticatedAgentId || conversation.assigned_agent_id;
    let finalBody = body;

    if (conversation.status === 'open' && messageType === 'text' && signerAgentId) {
      const { data: teamMember } = await supabaseClient
        .from('team_members')
        .select('full_name, name, sign_messages')
        .eq('id', signerAgentId)
        .single();

      if (teamMember && teamMember.sign_messages !== false) {
        const senderName = teamMember.full_name || teamMember.name || "Atendente";
        finalBody = `*${senderName}:*\n${body}`;
      }
    }

    // Tratamento do JID para Uzapi
    let targetNumber = remoteJid;
    if (remoteJid.includes('@')) {
      targetNumber = remoteJid.split('@')[0];
    }

    console.log('Sending to Number:', targetNumber);

    let sendUrl;
    let payload;

    if (messageType === 'contact' && contactData) {
      // Enviar cartão de contato (vCard) via UZAPI
      sendUrl = `https://clinvia.uazapi.com/send/contact`;
      payload = {
        number: targetNumber,
        fullName: contactData.fullName || 'Contato',
        phoneNumber: contactData.phoneNumber || '',
        organization: contactData.organization || '',
        email: contactData.email || '',
        url: contactData.url || ''
      };
    } else if (messageType === 'text') {
      sendUrl = `https://clinvia.uazapi.com/send/text`;
      payload = {
        number: targetNumber,
        text: finalBody
      };
      if (replyId) {
        payload.replyid = replyId;
      }
      if (forward) {
        payload.forward = true;
      }
    } else {
      sendUrl = `https://clinvia.uazapi.com/send/media`;
      let uzapiType = messageType;
      if (messageType === 'audio') uzapiType = 'ptt';

      payload = {
        number: targetNumber,
        type: uzapiType,
        file: mediaUrl
      };

      if (caption) {
        // Uazapi aceita 'caption' para imagens/vídeos (padrão WhatsApp)
        // e alguns endpoints usam 'text' — enviamos ambos para garantir compatibilidade
        payload.caption = caption;
        payload.text = caption;
      }
      if (forward) {
        payload.forward = true;
      }
    }

    console.log('[evolution-send-message] Payload to Uazapi:', JSON.stringify(payload));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const sendStartedAt = Date.now();

    try {
      const sendResponse = await fetch(sendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'token': instance.apikey
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('Uzapi response status:', sendResponse.status);

      if (!sendResponse.ok) {
        const errorText = await sendResponse.text();
        const elapsedMs = Date.now() - sendStartedAt;
        console.error('[evolution-send-message] UZAPI error:', JSON.stringify({
          status: sendResponse.status,
          body: errorText,
          elapsed_ms: elapsedMs,
          sendUrl,
          payload,
          instance_id: instance.id,
          instance_name: instance.name,
          instance_status: instance.status,
          conversation_id: conversationId,
          contact_id: conversation.contact_id,
          group_id: conversation.group_id,
          target_number: targetNumber,
          message_type: messageType,
        }));

        // 401/403/404 = token invalido / instancia nao existe na UZAPI
        // → auto-marca como disconnected + cria notificacao + retorna erro amigavel
        if (sendResponse.status === 401 || sendResponse.status === 403 || sendResponse.status === 404) {
          try {
            await supabaseClient
              .from('instances')
              .update({
                status: 'disconnected',
                last_health_check: new Date().toISOString(),
              })
              .eq('id', instance.id);

            // Silencia spam: só notifica se não houve notificação nas últimas 24h
            const { data: existingInstance } = await supabaseClient
              .from('instances')
              .select('last_disconnect_notified_at, name, user_id')
              .eq('id', instance.id)
              .maybeSingle();

            const lastNotified = existingInstance?.last_disconnect_notified_at
              ? new Date(existingInstance.last_disconnect_notified_at).getTime()
              : 0;
            const hoursSince = (Date.now() - lastNotified) / 3600_000;

            if (hoursSince >= 24 && existingInstance) {
              await supabaseClient.from('notifications').insert({
                type: 'instance_disconnected',
                title: `Instância "${existingInstance.name}" desconectada`,
                description:
                  `Detectamos que a instância ${existingInstance.name} perdeu conexão com o WhatsApp ` +
                  `ao tentar enviar uma mensagem. Vá em Conexões e reconecte.`,
                metadata: {
                  instance_id: instance.id,
                  instance_name: existingInstance.name,
                  http_code: sendResponse.status,
                  detected_by: 'send-message',
                },
                related_user_id: existingInstance.user_id,
              });
              await supabaseClient
                .from('instances')
                .update({ last_disconnect_notified_at: new Date().toISOString() })
                .eq('id', instance.id);
            }
          } catch (markErr) {
            console.error('[evolution-send-message] failed to mark instance as disconnected:', markErr);
          }

          return new Response(
            JSON.stringify({
              success: false,
              error: 'instance_disconnected',
              message:
                'Sua instância do WhatsApp está desconectada. Vá em Conexões e reconecte para voltar a enviar mensagens.',
              http_code: sendResponse.status,
            }),
            {
              status: 502,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }

        // Parse para extrair mensagem amigável + identificar policy restriction
        const parsed = parseUzapiErrorBody(errorText);

        // Auto-disconnect proativo APENAS para falhas de infra (timeout/5xx UZAPI).
        // Policy restriction do WhatsApp (quota/qualidade/timelock) significa que
        // a sessão UZAPI está OK — é o número que está restrito. NÃO bump.
        if (!parsed.isPolicyRestriction) {
          await bumpFailureAndMaybeDisconnect(supabaseClient, instance, 'uzapi_error');
        }

        const err = new Error(`Failed to send message via Uzapi: ${parsed.friendly}`);
        (err as any).uzapiProviderCode = parsed.providerCode;
        (err as any).uzapiErrorKey = parsed.errorKey;
        (err as any).isPolicyRestriction = parsed.isPolicyRestriction;
        throw err;
      }

      const sendData = await sendResponse.json();

      let insertBody = body;
      let insertCaption = caption || null;

      if (messageType === 'contact') {
        insertBody = body; // vCard text (e.g. "Nome\nPhone: 551199999")
        insertCaption = null;
      } else if (messageType === 'document') {
        insertBody = body;
        if (caption && signerAgentId) {
          const { data: teamMember } = await supabaseClient
            .from('team_members')
            .select('full_name, name, sign_messages')
            .eq('id', signerAgentId)
            .single();

          if (teamMember && teamMember.sign_messages !== false) {
            const senderName = teamMember.full_name || teamMember.name || "Atendente";
            insertCaption = `*${senderName}:*\n${caption}`;
          } else {
            insertCaption = caption;
          }
        } else {
          insertCaption = caption || null;
        }
      } else if (messageType === 'text') {
        insertBody = finalBody;
        insertCaption = null;
      } else {
        insertBody = finalBody || `[${messageType}]`;
        insertCaption = caption || null;
      }

      // Salvar mensagem no banco
      const { data: message, error: messageError } = await supabaseClient
        .from('messages')
        .insert({
          conversation_id: conversationId,
          body: insertBody,
          direction: 'outbound',
          message_type: messageType,
          media_url: mediaUrl,
          evolution_id: sendData.messageid || sendData.id || null,
          user_id: userId,
          reply_to_id: replyId || null,
          quoted_body: quotedBody || null,
          quoted_sender: quotedSender || null,
          caption: insertCaption,
          status: 'sent'
        })
        .select('id, conversation_id, body, direction, message_type, created_at')
        .single();

      if (messageError) {
        console.error('Message insert error:', messageError);
        throw new Error(`Failed to save message: ${messageError.message}`);
      }

      console.log('Message saved to database:', message.id);

      // ✅ Sucesso: zera contador de falhas consecutivas (se houver)
      try {
        await supabaseClient
          .from('instances')
          .update({ consecutive_send_failures: 0 })
          .eq('id', instance.id)
          .gt('consecutive_send_failures', 0);
      } catch (resetErr) {
        console.warn('[evolution-send-message] failed to reset consecutive_send_failures:', resetErr);
      }

      console.log('=== [UZAPI SEND MESSAGE] SUCCESS ===');

      return new Response(
        JSON.stringify({
          success: true,
          messageId: message.id,
          providerId: sendData.messageid
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      const elapsedMs = Date.now() - sendStartedAt;
      console.error('[evolution-send-message] UZAPI fetch error:', JSON.stringify({
        name: fetchError?.name,
        message: fetchError?.message,
        elapsed_ms: elapsedMs,
        instance_id: instance.id,
        instance_name: instance.name,
        conversation_id: conversationId,
        target_number: targetNumber,
        message_type: messageType,
        sendUrl,
      }));
      if (fetchError.name === 'AbortError') {
        await bumpFailureAndMaybeDisconnect(supabaseClient, instance, 'uzapi_timeout');
        return new Response(
          JSON.stringify({
            success: false,
            error: 'uzapi_timeout',
            message: 'O servidor de WhatsApp não respondeu em 10s. Tente novamente em instantes.',
          }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw fetchError;
    }
  } catch (error: any) {
    console.error('=== [UZAPI SEND MESSAGE] ERROR ===', JSON.stringify({
      message: error?.message,
      uzapiProviderCode: error?.uzapiProviderCode,
      uzapiErrorKey: error?.uzapiErrorKey,
      isPolicyRestriction: error?.isPolicyRestriction,
      stack: error?.stack,
    }));

    const rawMsg: string = error?.message ?? 'Erro desconhecido';
    let status = 500;
    let errorCode: string = 'internal_error';
    // userMessage = mensagem que vai para o toast no frontend.
    // Por padrão, é igual a rawMsg, mas para erros de UZAPI removemos o
    // prefixo "Failed to send message via Uzapi: " e categorizamos policy
    // restriction do WhatsApp separadamente.
    let userMessage: string = rawMsg;

    if (rawMsg.includes('Conversation ID is required')) {
      status = 400; errorCode = 'missing_conversation_id';
      userMessage = 'ID da conversa não informado.';
    } else if (rawMsg.includes('Conversation not found')) {
      status = 404; errorCode = 'conversation_not_found';
      userMessage = 'Conversa não encontrada.';
    } else if (rawMsg.includes('Instance configuration missing')) {
      status = 422; errorCode = 'instance_not_configured';
      userMessage = 'Instância do WhatsApp não está configurada.';
    } else if (rawMsg.includes('Group JID not found') || rawMsg.includes('Contact number not found')) {
      status = 422; errorCode = 'recipient_not_found';
      userMessage = 'Número do destinatário não encontrado.';
    } else if (rawMsg.includes('Invalid conversation')) {
      status = 422; errorCode = 'invalid_conversation';
      userMessage = 'Conversa inválida.';
    } else if (rawMsg.startsWith('Failed to send message via Uzapi')) {
      const uzapiPrefix = 'Failed to send message via Uzapi: ';
      const friendly = rawMsg.startsWith(uzapiPrefix) ? rawMsg.slice(uzapiPrefix.length) : rawMsg;
      const isPolicy = (error as any)?.isPolicyRestriction === true;
      status = 502;
      errorCode = isPolicy ? 'whatsapp_policy_restriction' : 'uzapi_error';
      userMessage = friendly;
    } else if (rawMsg.includes('Uzapi timeout')) {
      status = 504; errorCode = 'uzapi_timeout';
      userMessage = 'O servidor de WhatsApp não respondeu em 10s. Tente novamente.';
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: errorCode,
        message: userMessage,
        provider_code: (error as any)?.uzapiProviderCode ?? null,
        error_key: (error as any)?.uzapiErrorKey ?? null,
      }),
      {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
