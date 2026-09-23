// Worker da fila de provisionamento OpenAI (pg_cron a cada 5 minutos).
//
// `claim_openai_provision_jobs()` devolve ZERO linhas enquanto
// `llm_platform_settings.provisioning_enabled = false` — enquanto a chave geral
// estiver desligada este worker roda e sai sem fazer nada, mesmo com jobs na fila.
//
// Nenhuma criacao de conta depende disto: o trigger so enfileira. Se a OpenAI
// estiver fora, a conta e aprovada normalmente e o job e retentado (ate 5 vezes).

import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reportIncident } from "../_shared/report-incident.ts";
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json; charset=utf-8',
};

/** Teto por rodada: provisionar e chamada de rede, o cron escoa a fila sozinho. */
const BATCH_SIZE = 3;

serveMonitored("openai-provision-worker", async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const stats = { claimed: 0, done: 0, skipped: 0, failed: 0 };
    const report: unknown[] = [];

    try {
        const { data: claimed, error: claimError } = await supabase
            .rpc('claim_openai_provision_jobs', { p_limit: BATCH_SIZE });
        if (claimError) throw claimError;

        const fila = (claimed ?? []) as { id: string; profile_id: string; attempts: number }[];
        stats.claimed = fila.length;

        for (const job of fila) {
            try {
                const res = await fetch(`${supabaseUrl}/functions/v1/provision-openai-project`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${serviceKey}`,
                        'x-service-key': serviceKey,
                    },
                    body: JSON.stringify({ profileId: job.profile_id }),
                });
                const out = await res.json().catch(() => ({}));

                if (!res.ok || out?.success !== true) {
                    throw new Error(`${out?.code || res.status}: ${out?.error || 'falha no provisionamento'}`);
                }

                const skipped = out.status === 'skipped_customer_key' || out.status === 'already_provisioned';
                await supabase
                    .from('openai_provision_queue')
                    .update({
                        status: skipped ? 'skipped' : 'done',
                        last_error: null,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', job.id);

                if (skipped) stats.skipped++; else stats.done++;
                report.push({ profile_id: job.profile_id, status: out.status, project_id: out.project_id ?? null });
            } catch (err: any) {
                const message = (err?.message || 'erro desconhecido').slice(0, 500);
                // attempts < 5 e checado pelo claim: passando de 5 o job para de voltar.
                await supabase
                    .from('openai_provision_queue')
                    .update({
                        status: 'pending',
                        last_error: message,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', job.id);
                stats.failed++;
                report.push({ profile_id: job.profile_id, status: 'failed', error: message });
                console.error('[openai-provision-worker]', job.profile_id, message);
            }
        }

        return new Response(JSON.stringify({ success: true, ...stats, report }), { headers: corsHeaders });
    } catch (err: any) {
        console.error('[openai-provision-worker] erro geral:', err?.message || err);
        reportIncident({ route: "provision", httpCode: 500, error: err });
        return new Response(
            JSON.stringify({ success: false, error: err?.message || 'Erro inesperado', ...stats }),
            { status: 500, headers: corsHeaders },
        );
    }
});
