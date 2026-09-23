// Entrega a chave OpenAI DA CONTA para o n8n, por conversa ou por conta.
//
// Existe porque a credencial do n8n e por fluxo e a chave passou a ser por
// cliente: o fluxo pede a chave da conta daquela conversa em vez de usar a
// credencial global. Enquanto a troca da credencial no n8n nao for feita a mao,
// a conta continua rodando na chave compartilhada e o painel mostra "estimado".
//
// So devolve chave quando `openai_key_source = 'platform'`:
//   - 'customer'  -> a chave e do cliente, nao e nossa para distribuir
//   - null        -> a conta ainda esta na chave compartilhada, sem chave propria
//
// Autenticacao: x-api-key = SCHEDULING_API_KEY (mesmo padrao das outras api-*).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptToken } from "../_shared/token-tracker.ts";
import {
    apiError,
    dbErrorResponse,
    missingFields,
    readJsonBody,
    requireApiKey,
    unexpectedErrorResponse,
} from "../_shared/api-errors.ts";
import { setIncidentComponent } from "../_shared/report-incident.ts";

setIncidentComponent("get-account-openai-key");

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
    'Content-Type': 'application/json; charset=utf-8',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers });

    try {
        const keyError = requireApiKey(req, headers);
        if (keyError) return keyError;

        const { body, response } = await readJsonBody(req, headers);
        if (response) return response;

        const conversationId: string | undefined = body?.conversation_id;
        const ownerIdInput: string | undefined = body?.owner_id || body?.user_id;

        if (!conversationId && !ownerIdInput) {
            const missing = missingFields(headers, body!, ['conversation_id'],
                'Informe conversation_id (preferido) ou owner_id da conta.');
            if (missing) return missing;
        }

        const supabase = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );

        let ownerId = ownerIdInput ?? '';
        if (conversationId) {
            const { data: conv, error } = await supabase
                .from('conversations')
                .select('user_id')
                .eq('id', conversationId)
                .maybeSingle();
            if (error) return dbErrorResponse(headers, 'conversation_lookup_failed', 'buscar a conversa', error, req);
            if (!conv) {
                return apiError(headers, {
                    status: 404,
                    code: 'conversation_not_found',
                    message: `Conversa ${conversationId} não existe.`,
                });
            }
            ownerId = conv.user_id;
        }

        const { data: profile, error: profErr } = await supabase
            .from('profiles')
            .select('id, company_name, openai_token, openai_key_source, openai_project_id, openai_token_invalid')
            .eq('id', ownerId)
            .maybeSingle();
        if (profErr) return dbErrorResponse(headers, 'account_lookup_failed', 'buscar a conta', profErr, req);
        if (!profile) {
            return apiError(headers, {
                status: 404,
                code: 'account_not_found',
                message: `Conta ${ownerId} não existe.`,
            });
        }

        if (profile.openai_key_source !== 'platform') {
            return new Response(JSON.stringify({
                success: true,
                has_key: false,
                key_source: profile.openai_key_source ?? null,
                owner_id: profile.id,
                message: profile.openai_key_source === 'customer'
                    ? 'A conta usa a chave do próprio cliente; ela não é distribuída por esta API.'
                    : 'A conta ainda não tem projeto próprio na OpenAI: usar a chave compartilhada da plataforma.',
            }), { headers });
        }

        const stored = typeof profile.openai_token === 'string' ? profile.openai_token : '';
        const plain = stored.trim() ? await decryptToken(stored) : '';
        if (!plain) {
            return apiError(headers, {
                status: 500,
                code: 'key_unavailable',
                message: 'A conta está marcada como provisionada pela plataforma, mas a chave não pôde ser lida. Reprovisionar a conta no Super Admin.',
            });
        }

        console.log('[get-account-openai-key] entregue para', profile.id, 'projeto', profile.openai_project_id);

        return new Response(JSON.stringify({
            success: true,
            has_key: true,
            key_source: 'platform',
            owner_id: profile.id,
            company: profile.company_name ?? null,
            project_id: profile.openai_project_id,
            api_key: plain,
            token_invalid: profile.openai_token_invalid === true,
        }), { headers });
    } catch (err) {
        return unexpectedErrorResponse(headers, 'get-account-openai-key', err, req);
    }
});
