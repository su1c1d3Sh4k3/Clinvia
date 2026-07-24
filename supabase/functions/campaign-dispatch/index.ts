import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * campaign-dispatch (worker)
 *
 * Invocado pelo pg_cron a cada minuto (invoke_campaign_dispatch, com guard).
 *
 * 1. Promoção: campanhas scheduled/awaiting_template com scheduled_at <= now().
 *    - template_mode = none (UAZAPI): vai direto para dispatching (sem template).
 *    - Meta (create/existing): sync do template → APPROVED = dispatching;
 *      PENDING = awaiting_template (erro após 48h); REJECTED/DISABLED = error.
 * 2. Envio: pick_campaign_contacts(4). Variáveis resolvidas do raw_data da entrada.
 *    - Meta: template via meta-send-message, 15s entre mensagens.
 *    - UAZAPI: texto livre via evolution-send-message, 30–45s aleatórios.
 * 3. CRM: move/cria card para 'Em Atendimento IA' ou 'Em Atendimento Humano'.
 * 4. Conclusão: dispatching sem pending/sending → dispatched.
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json; charset=utf-8",
};

const BATCH_SIZE = 4;
const META_SPACING_MS = 15_000;
const uazapiSpacingMs = () => 30_000 + Math.floor(Math.random() * 15_000); // 30–45s
const MAX_TEMPLATE_WAIT_MS = 48 * 60 * 60 * 1000; // 48h de atraso máximo

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getSupabase() {
    return createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
}

async function callFunction(name: string, payload: Record<string, unknown>) {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const resp = await fetch(`${url}/functions/v1/${name}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(payload),
    });
    const result = await resp.json().catch(() => null);
    return { ok: resp.ok, result };
}

function formatDateBR(iso: string): string {
    return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function slugVarKey(raw: string): string {
    return raw
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40);
}

/**
 * Resolve o valor de uma variável para uma entrada da campanha.
 * Prioridade: raw_data (snapshot da fonte de dados) → contato → legado servico/data.
 */
function resolveVariable(key: string, campaign: any, contact: any, rawData: any): string {
    const rd = rawData || {};
    if (rd[key] != null && String(rd[key]).trim() !== "") return String(rd[key]).trim();
    switch (key) {
        case "nome":
            return contact?.push_name?.trim() || "Cliente";
        case "telefone":
            return String(contact?.number || "").replace(/@.*$/, "");
        case "servico": {
            const names = (campaign.services || [])
                .map((s: any) => s?.name)
                .filter(Boolean);
            return names.length > 0 ? names.join(", ") : "nossos serviços";
        }
        case "data":
            return formatDateBR(campaign.scheduled_at);
        default:
            return "";
    }
}

/** Renderiza a mensagem inicial substituindo qualquer variável <chave>. */
function renderMessage(campaign: any, contact: any, rawData: any): string {
    return (campaign.initial_message || "").replace(
        /<\s*([^<>\n]{1,60}?)\s*>/g,
        (m: string, raw: string) => {
            const key = slugVarKey(raw);
            if (!key) return m;
            return resolveVariable(key, campaign, contact, rawData);
        }
    );
}

// ── Fase 1: promoção ─────────────────────────────────────────────────────────
async function promoteCampaigns(supabase: any) {
    const { data: due } = await supabase
        .from("campaigns")
        .select("*")
        .in("status", ["scheduled", "awaiting_template"])
        .lte("scheduled_at", new Date().toISOString());

    for (const camp of due || []) {
        try {
            if (!camp.instance_id) {
                await supabase
                    .from("campaigns")
                    .update({ status: "error", error_message: "Instância da campanha removida" })
                    .eq("id", camp.id);
                continue;
            }

            // API não oficial (UAZAPI): sem template — direto para dispatching
            if (camp.template_mode === "none") {
                await supabase
                    .from("campaigns")
                    .update({ status: "dispatching", error_message: null })
                    .eq("id", camp.id);
                console.log(`[campaign-dispatch] Campaign ${camp.id} (uazapi) → dispatching`);
                continue;
            }

            if (!camp.template_name) {
                await supabase
                    .from("campaigns")
                    .update({ status: "error", error_message: "Template não foi criado" })
                    .eq("id", camp.id);
                continue;
            }

            // Sync de status do template com a Meta
            await callFunction("meta-template-manage", {
                action: "sync",
                user_id: camp.user_id,
                instance_id: camp.instance_id,
            });

            const { data: tpl } = await supabase
                .from("message_templates")
                .select("id, status, rejection_reason")
                .eq("instance_id", camp.instance_id)
                .eq("name", camp.template_name)
                .maybeSingle();

            const tplStatus = tpl?.status || null;

            if (tplStatus === "APPROVED") {
                await supabase
                    .from("campaigns")
                    .update({ status: "dispatching", error_message: null })
                    .eq("id", camp.id);
                console.log(`[campaign-dispatch] Campaign ${camp.id} → dispatching`);
            } else if (tplStatus === "PENDING" || tplStatus === null) {
                const delay = Date.now() - new Date(camp.scheduled_at).getTime();
                if (delay > MAX_TEMPLATE_WAIT_MS) {
                    await supabase
                        .from("campaigns")
                        .update({
                            status: "error",
                            error_message: "Template não foi aprovado pela Meta a tempo",
                        })
                        .eq("id", camp.id);
                } else if (camp.status !== "awaiting_template") {
                    await supabase
                        .from("campaigns")
                        .update({ status: "awaiting_template" })
                        .eq("id", camp.id);
                }
            } else {
                // REJECTED / DISABLED / PAUSED
                await supabase
                    .from("campaigns")
                    .update({
                        status: "error",
                        error_message: `Template rejeitado pela Meta${tpl?.rejection_reason ? ` (${tpl.rejection_reason})` : ""} — recrie a mensagem`,
                    })
                    .eq("id", camp.id);
            }
        } catch (err) {
            console.error(`[campaign-dispatch] promote error for ${camp.id}:`, err);
        }
    }
}

// ── CRM: mover/criar card + ia_on + fila ─────────────────────────────────────
const queueCache = new Map<string, string | null>();

async function getQueueId(supabase: any, userId: string, queueName: string): Promise<string | null> {
    const cacheKey = `${userId}:${queueName}`;
    if (queueCache.has(cacheKey)) return queueCache.get(cacheKey) ?? null;
    const { data } = await supabase
        .from("queues")
        .select("id")
        .eq("user_id", userId)
        .eq("name", queueName)
        .limit(1)
        .maybeSingle();
    queueCache.set(cacheKey, data?.id ?? null);
    return data?.id ?? null;
}

async function moveCrm(supabase: any, campaign: any, contactId: string, conversationId: string | null) {
    const iaEnabled = campaign.ia_enabled !== false;
    const targetStage = iaEnabled ? "Em Atendimento IA" : "Em Atendimento Humano";
    const targetQueueName = iaEnabled ? "Atendimento IA" : "Atendimento Humano";

    try {
        const { data: activeCard } = await supabase
            .from("crm_client")
            .select("id, stage")
            .eq("contact_id", contactId)
            .eq("is_active", true)
            .maybeSingle();

        if (activeCard) {
            if (activeCard.stage !== targetStage) {
                // Trigger AFTER UPDATE cuida de ia_on (+ fila no caso Humano)
                await supabase
                    .from("crm_client")
                    .update({ stage: targetStage })
                    .eq("id", activeCard.id);
            }
        } else {
            // Trigger NÃO dispara em INSERT → setar ia_on/fila manualmente abaixo
            await supabase.from("crm_client").insert({
                user_id: campaign.user_id,
                contact_id: contactId,
                stage: targetStage,
                is_active: true,
            });
        }

        // Garantias explícitas (cobrem INSERT e o caso IA, que o trigger não enfileira)
        await supabase
            .from("contacts")
            .update({ ia_on: iaEnabled, updated_at: new Date().toISOString() })
            .eq("id", contactId);

        const queueId = await getQueueId(supabase, campaign.user_id, targetQueueName);
        if (queueId && conversationId) {
            await supabase
                .from("conversations")
                .update({ queue_id: queueId, updated_at: new Date().toISOString() })
                .eq("id", conversationId);
        }
    } catch (err) {
        console.warn(`[campaign-dispatch] CRM move failed for contact ${contactId}:`, err);
    }
}

// ── Conversa: find-or-create ─────────────────────────────────────────────────
async function findOrCreateConversation(supabase: any, campaign: any, contactId: string): Promise<string> {
    const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("contact_id", contactId)
        .eq("instance_id", campaign.instance_id)
        .eq("user_id", campaign.user_id)
        .in("status", ["pending", "open"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (existing) return existing.id;

    const iaEnabled = campaign.ia_enabled !== false;
    const queueName = iaEnabled ? "Atendimento IA" : "Atendimento Humano";
    const queueId = await getQueueId(supabase, campaign.user_id, queueName);

    const { data: newConv, error } = await supabase
        .from("conversations")
        .insert({
            contact_id: contactId,
            instance_id: campaign.instance_id,
            user_id: campaign.user_id,
            status: "pending",
            queue_id: queueId,
        })
        .select("id")
        .single();
    if (error) throw new Error(`Falha ao criar conversa: ${error.message}`);
    return newConv.id;
}

// ── Fase 2: envio ────────────────────────────────────────────────────────────
async function dispatchBatch(supabase: any) {
    const { data: picked, error: pickErr } = await supabase.rpc("pick_campaign_contacts", {
        p_limit: BATCH_SIZE,
    });
    if (pickErr) {
        console.error("[campaign-dispatch] pick RPC error:", pickErr.message);
        return;
    }
    if (!picked || picked.length === 0) return;

    console.log(`[campaign-dispatch] Picked ${picked.length} contacts`);

    const campaignCache = new Map<string, any>();
    let nextSpacingMs = META_SPACING_MS;

    for (let i = 0; i < picked.length; i++) {
        const row = picked[i];
        if (i > 0) await sleep(nextSpacingMs);

        try {
            let campaign = campaignCache.get(row.campaign_id);
            if (!campaign) {
                const { data } = await supabase
                    .from("campaigns")
                    .select("*")
                    .eq("id", row.campaign_id)
                    .single();
                campaign = data;
                campaignCache.set(row.campaign_id, campaign);
            }
            const isUazapi = campaign?.template_mode === "none";
            nextSpacingMs = isUazapi ? uazapiSpacingMs() : META_SPACING_MS;

            if (!campaign || campaign.status !== "dispatching") {
                await supabase
                    .from("campaign_contacts")
                    .update({ status: "skipped", error: "Campanha não está mais em disparo" })
                    .eq("id", row.id);
                continue;
            }

            if (!row.contact_id) {
                await supabase
                    .from("campaign_contacts")
                    .update({ status: "invalid", error: "Contato inexistente" })
                    .eq("id", row.id);
                continue;
            }

            const { data: contact } = await supabase
                .from("contacts")
                .select("id, push_name, number")
                .eq("id", row.contact_id)
                .maybeSingle();
            if (!contact?.number) {
                await supabase
                    .from("campaign_contacts")
                    .update({ status: "invalid", error: "Contato sem número válido" })
                    .eq("id", row.id);
                continue;
            }

            const conversationId = await findOrCreateConversation(supabase, campaign, row.contact_id);
            const rawData = row.raw_data || {};

            let ok: boolean;
            let result: any;

            if (isUazapi) {
                // API não oficial: texto livre renderizado (sem template)
                const renderedBody = renderMessage(campaign, contact, rawData);
                ({ ok, result } = await callFunction("evolution-send-message", {
                    conversationId,
                    body: renderedBody,
                    messageType: "text",
                    message: { wasSentByApi: true },
                }));
            } else {
                // Meta: template com parâmetros pela ordem do variable_map
                const variableMap: string[] = campaign.variable_map || [];
                const parameters = variableMap.map((key) => ({
                    type: "text",
                    text: resolveVariable(key, campaign, contact, rawData) || "-",
                }));

                const templateData: any = {
                    name: campaign.template_name,
                    language: { code: "pt_BR" },
                };
                if (parameters.length > 0) {
                    templateData.components = [{ type: "body", parameters }];
                }

                const renderedBody = `*Template enviado: ${campaign.template_name}*\n${renderMessage(campaign, contact, rawData)}`;

                ({ ok, result } = await callFunction("meta-send-message", {
                    conversationId,
                    body: renderedBody,
                    messageType: "template",
                    templateData,
                    message: { wasSentByApi: true },
                }));
            }

            if (!ok || result?.success === false) {
                const errMsg = result?.message || result?.error || "Falha no envio do template";
                await supabase
                    .from("campaign_contacts")
                    .update({ status: "failed", error: String(errMsg).slice(0, 500) })
                    .eq("id", row.id);
                console.warn(`[campaign-dispatch] Send failed for ${row.contact_id}:`, errMsg);
                continue;
            }

            await supabase
                .from("campaign_contacts")
                .update({
                    status: "sent",
                    sent_at: new Date().toISOString(),
                    message_id: result?.messageId || null,
                    error: null,
                })
                .eq("id", row.id);

            await moveCrm(supabase, campaign, row.contact_id, conversationId);

            console.log(`[campaign-dispatch] Sent to contact ${row.contact_id} (campaign ${campaign.id})`);
        } catch (err: any) {
            console.error(`[campaign-dispatch] Error on row ${row.id}:`, err);
            await supabase
                .from("campaign_contacts")
                .update({ status: "failed", error: String(err?.message || err).slice(0, 500) })
                .eq("id", row.id);
        }
    }
}

// ── Fase 3: conclusão ────────────────────────────────────────────────────────
async function finalizeCampaigns(supabase: any) {
    const { data: dispatching } = await supabase
        .from("campaigns")
        .select("id")
        .eq("status", "dispatching");

    for (const camp of dispatching || []) {
        const { count } = await supabase
            .from("campaign_contacts")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", camp.id)
            .in("status", ["pending", "sending"]);

        if ((count ?? 0) === 0) {
            await supabase
                .from("campaigns")
                .update({ status: "dispatched" })
                .eq("id", camp.id);
            console.log(`[campaign-dispatch] Campaign ${camp.id} → dispatched`);
        }
    }
}

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabase = getSupabase();

        await promoteCampaigns(supabase);
        await dispatchBatch(supabase);
        await finalizeCampaigns(supabase);

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    } catch (error: any) {
        console.error("[campaign-dispatch] Fatal error:", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 500,
            headers: corsHeaders,
        });
    }
});
