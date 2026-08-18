import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { makeOpenAIRequest, trackTokenUsage } from "../_shared/token-tracker.ts";

/**
 * campaign-manage
 *
 * CRUD de campanhas de disparo em massa.
 *  - Instâncias Meta (API oficial): SOMENTE template existente já APROVADO (template_mode = existing)
 *  - Instâncias UAZAPI (API não oficial): texto livre, sem template (template_mode = none)
 *
 * O modo "create" (criar template junto com a campanha) foi descontinuado — campanhas
 * legadas com template_mode = create seguem o fluxo atual no campaign-dispatch até o disparo.
 *
 * Actions:
 *   - create:            cria campanha + tag + campaign_contacts (com vars por entrada) + ai_prompt
 *                        (resend_from_campaign_id: encerra a campanha-mãe antes — rotina de expiry)
 *   - update:            edita campanha (revalida template existente; regenera prompt)
 *   - delete:            remove campanha (bloqueado em dispatching/dispatched)
 *   - regenerate_prompt: regenera apenas o ai_prompt
 *   - check_conflicts:   contatos já presentes em outra campanha ativa da MESMA instância
 *                        (aviso do wizard: serão encerrados da anterior em T-1h)
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json; charset=utf-8",
};

const MIN_LEAD_MS = 60 * 60 * 1000; // 1h (template já aprovado — sem espera de aprovação)

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugVarKey(raw: string): string {
    return raw
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40);
}

function isMetaInstance(inst: any): boolean {
    return inst?.provider === "meta" || (inst?.instance_name || "").startsWith("meta-");
}

/**
 * Converte mensagem com variáveis <chave> (qualquer chave da fonte de dados)
 * em corpo de template Meta com {{1}}..{{n}} pela ordem de primeira aparição.
 */
function buildTemplateBody(message: string): { body: string; variableMap: string[] } {
    const variableMap: string[] = [];
    const body = message.replace(/<\s*([^<>\n]{1,60}?)\s*>/g, (m, raw: string) => {
        const key = slugVarKey(raw);
        if (!key) return m;
        let idx = variableMap.indexOf(key);
        if (idx === -1) {
            variableMap.push(key);
            idx = variableMap.length - 1;
        }
        return `{{${idx + 1}}}`;
    });
    return { body, variableMap };
}

async function createTag(supabase: any, ownerId: string, baseName: string) {
    let candidate = baseName;
    for (let n = 2; n < 50; n++) {
        const { data: existing } = await supabase
            .from("tags")
            .select("id")
            .eq("user_id", ownerId)
            .eq("name", candidate)
            .maybeSingle();
        if (!existing) break;
        candidate = `${baseName} (${n})`;
    }
    const { data: tag, error } = await supabase
        .from("tags")
        .insert({ user_id: ownerId, name: candidate, color: "#8b5cf6", is_active: true })
        .select("id, name")
        .single();
    if (error) throw new Error(`Falha ao criar tag: ${error.message}`);
    return tag;
}

async function callTemplateManage(payload: Record<string, unknown>) {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const resp = await fetch(`${url}/functions/v1/meta-template-manage`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(payload),
    });
    const result = await resp.json();
    if (!resp.ok || result?.success === false) {
        throw new Error(result?.error || "Falha na chamada ao meta-template-manage");
    }
    return result;
}

/** Valida template existente aprovado e retorna seus dados. */
async function resolveExistingTemplate(
    supabase: any,
    ownerId: string,
    instanceId: string,
    templateRef: { id?: string; name?: string }
) {
    if (!templateRef?.id && !templateRef?.name) {
        throw new Error("Template existente não informado");
    }
    let query = supabase
        .from("message_templates")
        .select("id, name, status, language, instance_id")
        .eq("user_id", ownerId)
        .eq("instance_id", instanceId);
    query = templateRef.id ? query.eq("id", templateRef.id) : query.eq("name", templateRef.name);
    const { data: tpl } = await query.maybeSingle();
    if (!tpl) throw new Error("Template selecionado não encontrado nesta instância");
    if (tpl.status !== "APPROVED") {
        throw new Error("O template selecionado não está aprovado pela Meta");
    }
    return tpl;
}

interface PromptContext {
    name: string;
    objective: string;
    services: Array<{ name?: string; price?: number | string }>;
    discount_pct: number | null;
    valid_until: string;
    initial_message: string;
    campaign_type?: string;
}

async function generateAiPrompt(
    supabase: any,
    ownerId: string,
    ctx: PromptContext
): Promise<string | null> {
    try {
        const isNotification = ctx.campaign_type === "notification";
        const validUntil = new Date(ctx.valid_until).toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo",
        });

        let userPrompt: string;
        if (isNotification) {
            userPrompt = `Gere o bloco de instruções de campanha para um agente de IA de atendimento via WhatsApp de uma clínica.

DADOS DA CAMPANHA (NOTIFICAÇÃO / AVISO — não é uma promoção de vendas):
- Nome da campanha: ${ctx.name}
- Objetivo definido pelo gestor: ${ctx.objective}
- Validade da campanha: até ${validUntil}
- Mensagem de notificação enviada ao cliente: "${ctx.initial_message}"

REQUISITOS DO BLOCO GERADO:
1. Escrito em português (pt-BR), direto ao agente de IA (segunda pessoa: "você deve...").
2. Começar com uma linha deixando claro que estas instruções são PRIORIDADE MÁXIMA sobre o restante do prompt enquanto a campanha estiver vigente.
3. Explicar o contexto: o cliente recebeu a notificação acima e pode responder a ela com dúvidas.
4. Orientar o agente a esclarecer dúvidas sobre o conteúdo da notificação e conduzir rumo ao objetivo definido pelo gestor.
5. Instruir a nunca inventar informações, serviços ou preços que não estejam no restante do prompt.
6. Mencionar que o contexto desta notificação vale somente até ${validUntil}.
7. Máximo de 250 palavras. Responda APENAS com o texto do bloco, sem título, sem markdown de código.`;
        } else {
            const servicesText = (ctx.services || [])
                .map((s) => {
                    const price = s.price != null && s.price !== "" ? Number(s.price) : null;
                    return `- ${s.name || "Serviço"}${price != null && !isNaN(price) ? `: R$ ${price.toFixed(2)}` : ""}`;
                })
                .join("\n") || "- (nenhum serviço específico)";

            const discountText = ctx.discount_pct
                ? `Há um desconto de ${ctx.discount_pct}% que DEVE ser aplicado sobre o preço dos serviços acima ao informar valores ao cliente. Sempre mencione o preço original e o preço com desconto.`
                : "Não há desconto especial nesta campanha; use os preços de tabela.";

            userPrompt = `Gere o bloco de instruções de campanha para um agente de IA de atendimento via WhatsApp de uma clínica.

DADOS DA CAMPANHA:
- Nome da campanha: ${ctx.name}
- Objetivo definido pelo gestor: ${ctx.objective}
- Serviços da campanha (com preços de tabela):
${servicesText}
- ${discountText}
- Validade da campanha: até ${validUntil}
- Mensagem inicial enviada ao cliente: "${ctx.initial_message}"

REQUISITOS DO BLOCO GERADO:
1. Escrito em português (pt-BR), direto ao agente de IA (segunda pessoa: "você deve...").
2. Começar com uma linha deixando claro que estas instruções são PRIORIDADE MÁXIMA sobre o restante do prompt enquanto a campanha estiver vigente.
3. Explicar o contexto: o cliente recebeu a mensagem inicial da campanha e pode responder a ela.
4. Orientar o agente a conduzir a conversa rumo ao objetivo da campanha (venda/agendamento dos serviços listados).
5. Incluir os preços dos serviços e, se houver desconto, o cálculo do valor final com desconto.
6. Instruir a nunca inventar serviços ou preços fora da lista.
7. Mencionar que a condição é válida somente até ${validUntil}.
8. Máximo de 250 palavras. Responda APENAS com o texto do bloco, sem título, sem markdown de código.`;
        }

        const { response } = await makeOpenAIRequest(supabase, ownerId, {
            endpoint: "https://api.openai.com/v1/chat/completions",
            body: {
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content:
                            "Você é um especialista em engenharia de prompts para agentes de vendas por WhatsApp. Gera blocos de instrução claros, objetivos e acionáveis.",
                    },
                    { role: "user", content: userPrompt },
                ],
                temperature: 0.4,
                max_tokens: 700,
            },
        });

        if (!response.ok) {
            const err = await response.json().catch(() => null);
            console.error("[campaign-manage] OpenAI prompt error:", err?.error?.message || response.status);
            return null;
        }

        const data = await response.json();
        if (data.usage) {
            await trackTokenUsage(supabase, {
                ownerId,
                functionName: "campaign-manage",
                model: "gpt-4o-mini",
                usage: data.usage,
            });
        }
        return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
        console.error("[campaign-manage] generateAiPrompt failed:", err);
        return null;
    }
}

async function syncContactTags(
    supabase: any,
    ownerId: string,
    tagId: string | null,
    addContactIds: string[],
    removeContactIds: string[]
) {
    if (!tagId) return;
    if (removeContactIds.length > 0) {
        await supabase
            .from("contact_tags")
            .delete()
            .eq("tag_id", tagId)
            .in("contact_id", removeContactIds);
    }
    if (addContactIds.length > 0) {
        // user_id OBRIGATÓRIO: rodamos com service role, então o trigger
        // set_contact_tags_user_id não resolve o dono (auth.uid() é null) —
        // sem user_id a RLS esconde a tag do front (bug campanha 2026-08-17)
        const payload = addContactIds.map((id) => ({ contact_id: id, tag_id: tagId, user_id: ownerId }));
        const { error } = await supabase
            .from("contact_tags")
            .upsert(payload, { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
        if (error) console.warn("[campaign-manage] contact_tags upsert error:", error.message);
    }
}

function validateDates(scheduledAt: string, validUntil: string) {
    const sched = new Date(scheduledAt).getTime();
    const valid = new Date(validUntil).getTime();
    if (isNaN(sched) || isNaN(valid)) throw new Error("Datas inválidas");
    if (sched < Date.now() + MIN_LEAD_MS) {
        throw new Error("O disparo deve ser agendado com no mínimo 1 hora de antecedência");
    }
    if (valid <= sched) {
        throw new Error("A validade deve ser posterior à data do disparo");
    }
}

interface EntryPayload {
    contact_id: string;
    vars?: Record<string, string>;
}

/** Normaliza entries (novo formato) ou contact_ids (legado) em EntryPayload[].
 *  Regra: cada contato só pode ter UMA entrada por campanha — dedupe mantendo a
 *  primeira ocorrência (o frontend já envia a entrada mais relevante primeiro). */
function normalizeEntries(body: any): EntryPayload[] | undefined {
    if (body.entries !== undefined) {
        const seen = new Set<string>();
        return ((body.entries || []) as any[])
            .filter((e) => e?.contact_id)
            .filter((e) => {
                if (seen.has(e.contact_id)) return false;
                seen.add(e.contact_id);
                return true;
            })
            .map((e) => ({ contact_id: e.contact_id, vars: e.vars || {} }));
    }
    if (body.contact_ids !== undefined) {
        return [...new Set((body.contact_ids || []) as string[])].map((cid) => ({
            contact_id: cid,
            vars: {},
        }));
    }
    return undefined;
}

async function insertCampaignContacts(
    supabase: any,
    campaignId: string,
    ownerId: string,
    entries: EntryPayload[],
    invalidRows: any[]
) {
    const rows: any[] = entries.map((e) => ({
        campaign_id: campaignId,
        user_id: ownerId,
        contact_id: e.contact_id,
        raw_data: e.vars || {},
        status: "pending",
    }));
    for (const inv of invalidRows || []) {
        rows.push({
            campaign_id: campaignId,
            user_id: ownerId,
            contact_id: null,
            raw_data: inv,
            status: "invalid",
            error: "Número de telefone inválido",
        });
    }
    for (let i = 0; i < rows.length; i += 500) {
        const { error } = await supabase.from("campaign_contacts").insert(rows.slice(i, i + 500));
        if (error) console.warn("[campaign-manage] campaign_contacts insert error:", error.message);
    }
}

async function fetchInstance(supabase: any, instanceId: string) {
    const { data: instance, error } = await supabase
        .from("instances")
        .select("id, user_id, provider, instance_name")
        .eq("id", instanceId)
        .single();
    if (error || !instance) throw new Error("Instância não encontrada");
    return instance;
}

// ── Handler ──────────────────────────────────────────────────────────────────

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const body = await req.json();
        const { action, user_id } = body;
        if (!user_id) throw new Error("Missing field: user_id");
        const ownerId: string = user_id;

        // ══ CHECK_CONFLICTS ═════════════════════════════════════════════════
        // Contatos da audiência que já estão em outra campanha ativa da mesma
        // instância (janela ativa: ainda não vencida). O sweep T-1h os encerrará.
        if (action === "check_conflicts") {
            const { instance_id, contact_ids, exclude_campaign_id } = body;
            if (!instance_id) throw new Error("Missing field: instance_id");
            const ids = [...new Set(((contact_ids || []) as string[]).filter(Boolean))];

            let conflictIds: string[] = [];
            if (ids.length > 0) {
                let q = supabase
                    .from("campaigns")
                    .select("id")
                    .eq("user_id", ownerId)
                    .eq("instance_id", instance_id)
                    .in("status", ["scheduled", "awaiting_template", "dispatching", "dispatched"])
                    .gt("valid_until", new Date().toISOString());
                if (exclude_campaign_id) q = q.neq("id", exclude_campaign_id);
                const { data: camps } = await q;
                const campIds = (camps || []).map((c: any) => c.id);

                if (campIds.length > 0) {
                    const found = new Set<string>();
                    for (let i = 0; i < ids.length; i += 500) {
                        const { data } = await supabase
                            .from("campaign_contacts")
                            .select("contact_id")
                            .in("campaign_id", campIds)
                            .in("contact_id", ids.slice(i, i + 500));
                        for (const r of data || []) if (r.contact_id) found.add(r.contact_id);
                    }
                    conflictIds = [...found];
                }
            }

            return new Response(
                JSON.stringify({ success: true, conflict_contact_ids: conflictIds }),
                { headers: corsHeaders }
            );
        }

        // ══ CREATE ══════════════════════════════════════════════════════════
        if (action === "create") {
            const {
                name,
                instance_id,
                source_type,
                source_config,
                scheduled_at,
                valid_until,
                services,
                discount_pct,
                initial_message,
                objective,
                ia_enabled,
                invalid_rows,
                campaign_type,
                existing_template,
            } = body;

            if (!name) throw new Error("Missing field: name");
            if (!instance_id) throw new Error("Missing field: instance_id");
            if (!source_type) throw new Error("Missing field: source_type");
            if (!scheduled_at) throw new Error("Missing field: scheduled_at");
            if (!valid_until) throw new Error("Missing field: valid_until");
            if (!initial_message) throw new Error("Missing field: initial_message");
            if (!objective) throw new Error("Missing field: objective");

            const instance = await fetchInstance(supabase, instance_id);
            const isMeta = isMetaInstance(instance);
            validateDates(scheduled_at, valid_until);

            const campaignType = campaign_type === "notification" ? "notification" : "promotion";
            if (isMeta && body.template_mode === "create") {
                throw new Error(
                    "A criação de template junto com a campanha foi descontinuada — selecione um template já aprovado pela Meta"
                );
            }
            const templateMode = !isMeta ? "none" : "existing";

            const entries = normalizeEntries(body) || [];
            if (entries.length === 0 && !(invalid_rows || []).length) {
                throw new Error("A campanha precisa de pelo menos um contato");
            }
            const uniqueContactIds = [...new Set(entries.map((e) => e.contact_id))];

            // Template existente: valida ANTES de criar a campanha
            let existingTpl: any = null;
            if (templateMode === "existing") {
                existingTpl = await resolveExistingTemplate(supabase, ownerId, instance_id, existing_template);
            }

            // Tag automática com nome da campanha
            const tag = await createTag(supabase, ownerId, name);

            const variableMap =
                templateMode === "existing"
                    ? ((body.variable_map || []) as string[])
                    : buildTemplateBody(initial_message).variableMap;

            const { data: campaign, error: campErr } = await supabase
                .from("campaigns")
                .insert({
                    user_id: ownerId,
                    instance_id,
                    name,
                    source_type,
                    source_config: source_config || {},
                    scheduled_at,
                    valid_until,
                    services: campaignType === "promotion" ? services || [] : [],
                    discount_pct: campaignType === "promotion" ? discount_pct ?? null : null,
                    initial_message,
                    variable_map: variableMap,
                    objective,
                    ia_enabled: ia_enabled !== false,
                    tag_id: tag.id,
                    template_version: 1,
                    status: "scheduled",
                    campaign_type: campaignType,
                    template_mode: templateMode,
                    template_id: existingTpl?.id ?? null,
                    template_name: existingTpl?.name ?? null,
                })
                .select()
                .single();
            if (campErr) throw new Error(`Falha ao criar campanha: ${campErr.message}`);

            // Reenvio: encerra a campanha-mãe primeiro (mesma rotina do expiry —
            // congela entradas 'expired' respeitando conversas abertas + remove tag)
            const resendFromId = body.resend_from_campaign_id as string | undefined;
            if (resendFromId) {
                try {
                    const { data: mother } = await supabase
                        .from("campaigns")
                        .select("id, tag_id, status, expired_processed")
                        .eq("id", resendFromId)
                        .eq("user_id", ownerId)
                        .maybeSingle();
                    if (mother && !mother.expired_processed) {
                        await supabase.rpc("campaign_close_entries", { p_campaign_id: mother.id });
                        if (mother.tag_id) {
                            // Exclui a TAG da campanha-mãe (CASCADE remove contact_tags;
                            // campaigns.tag_id vira NULL) — user rule 2026-08-17
                            await supabase.from("tags").delete().eq("id", mother.tag_id);
                        }
                        await supabase
                            .from("campaigns")
                            .update({
                                expired_processed: true,
                                status: ["dispatching", "dispatched"].includes(mother.status)
                                    ? "expired"
                                    : mother.status,
                            })
                            .eq("id", mother.id);
                        console.log(`[campaign-manage] Resend: mother campaign ${mother.id} closed`);
                    }
                } catch (err: any) {
                    console.warn("[campaign-manage] resend mother close failed:", err?.message || err);
                }
            }

            // campaign_contacts (válidos com vars + inválidos)
            await insertCampaignContacts(supabase, campaign.id, ownerId, entries, invalid_rows || []);

            // Tag em todos os contatos válidos
            await syncContactTags(supabase, ownerId, tag.id, uniqueContactIds, []);

            // ai_prompt (não bloqueante)
            const aiPrompt = await generateAiPrompt(supabase, ownerId, {
                name,
                objective,
                services: campaignType === "promotion" ? services || [] : [],
                discount_pct: campaignType === "promotion" ? discount_pct ?? null : null,
                valid_until,
                initial_message,
                campaign_type: campaignType,
            });
            if (aiPrompt) {
                await supabase.from("campaigns").update({ ai_prompt: aiPrompt }).eq("id", campaign.id);
                campaign.ai_prompt = aiPrompt;
            }

            return new Response(
                JSON.stringify({ success: true, campaign }),
                { status: 201, headers: corsHeaders }
            );
        }

        // ── Demais actions exigem campaign_id ──
        const { campaign_id } = body;
        if (!campaign_id) throw new Error("Missing field: campaign_id");

        const { data: campaign, error: campErr } = await supabase
            .from("campaigns")
            .select("*")
            .eq("id", campaign_id)
            .eq("user_id", ownerId)
            .single();
        if (campErr || !campaign) throw new Error("Campanha não encontrada");

        // ══ UPDATE ══════════════════════════════════════════════════════════
        if (action === "update") {
            if (!["scheduled", "awaiting_template", "error"].includes(campaign.status)) {
                throw new Error("Campanha não pode ser editada neste status");
            }

            const updates: Record<string, unknown> = {};
            const fields = [
                "name", "instance_id", "source_type", "source_config", "scheduled_at",
                "valid_until", "services", "discount_pct", "objective", "ia_enabled",
                "initial_message", "campaign_type",
            ];
            for (const f of fields) {
                if (body[f] !== undefined) updates[f] = body[f];
            }

            const newInstanceId = (updates.instance_id as string) || campaign.instance_id;
            const instance = await fetchInstance(supabase, newInstanceId);
            const isMeta = isMetaInstance(instance);

            if (isMeta && body.template_mode === "create") {
                throw new Error(
                    "A criação de template junto com a campanha foi descontinuada — selecione um template já aprovado pela Meta"
                );
            }
            const oldMode: string = campaign.template_mode || "create";
            // Legado "create" só permanece se a edição não mexer no modo (chamadas fora do wizard)
            const newMode = !isMeta
                ? "none"
                : body.template_mode !== undefined || oldMode === "none"
                    ? "existing"
                    : oldMode;
            if (newMode !== oldMode) updates.template_mode = newMode;

            const newCampaignType =
                (updates.campaign_type as string) || campaign.campaign_type || "promotion";
            if (newCampaignType === "notification") {
                updates.services = [];
                updates.discount_pct = null;
            }

            const newScheduledAt = (updates.scheduled_at as string) || campaign.scheduled_at;
            const newValidUntil = (updates.valid_until as string) || campaign.valid_until;
            const newMessage = (updates.initial_message as string) || campaign.initial_message;
            const messageChanged =
                updates.initial_message !== undefined &&
                updates.initial_message !== campaign.initial_message;

            if (newMode === "create" && messageChanged) {
                throw new Error(
                    "Esta campanha usa um template criado pela plataforma (modo descontinuado) — para alterar a mensagem, selecione um template já aprovado pela Meta"
                );
            }

            if (
                updates.scheduled_at !== undefined ||
                updates.valid_until !== undefined ||
                newMode !== oldMode
            ) {
                validateDates(newScheduledAt, newValidUntil);
            }

            // Remove template criado anteriormente quando ele deixa de ser usado
            const dropOldCreatedTemplate = async () => {
                if (oldMode === "create" && campaign.template_name && campaign.instance_id) {
                    try {
                        await callTemplateManage({
                            action: "delete",
                            user_id: ownerId,
                            instance_id: campaign.instance_id,
                            name: campaign.template_name,
                        });
                    } catch (err: any) {
                        console.warn("[campaign-manage] old template delete failed:", err.message);
                    }
                }
            };

            if (newMode === "none") {
                if (oldMode !== "none") {
                    await dropOldCreatedTemplate();
                    updates.template_id = null;
                    updates.template_name = null;
                }
                if (campaign.status === "error" || campaign.status === "awaiting_template") {
                    updates.status = "scheduled";
                    updates.error_message = null;
                }
            } else if (newMode === "existing") {
                if (body.existing_template !== undefined || oldMode !== "existing") {
                    const tpl = await resolveExistingTemplate(
                        supabase, ownerId, newInstanceId, body.existing_template || {}
                    );
                    if (oldMode === "create") await dropOldCreatedTemplate();
                    updates.template_id = tpl.id;
                    updates.template_name = tpl.name;
                    updates.variable_map = (body.variable_map || []) as string[];
                    updates.status = "scheduled";
                    updates.error_message = null;
                } else if (body.variable_map !== undefined) {
                    updates.variable_map = body.variable_map;
                }
            }

            // Regenerar ai_prompt se contexto comercial mudou
            const promptFieldsChanged = ["objective", "services", "discount_pct", "valid_until", "initial_message", "campaign_type"]
                .some((f) => body[f] !== undefined);
            if (promptFieldsChanged) {
                const aiPrompt = await generateAiPrompt(supabase, ownerId, {
                    name: (updates.name as string) || campaign.name,
                    objective: (updates.objective as string) || campaign.objective,
                    services: (updates.services as any[]) ?? campaign.services ?? [],
                    discount_pct: (updates.discount_pct as number | null) ?? campaign.discount_pct,
                    valid_until: newValidUntil,
                    initial_message: newMessage,
                    campaign_type: newCampaignType,
                });
                if (aiPrompt) updates.ai_prompt = aiPrompt;
            }

            // Audiência: substituição das linhas pendentes (1 entrada por contato)
            const entries = normalizeEntries(body);
            if (entries !== undefined) {
                const { data: existing } = await supabase
                    .from("campaign_contacts")
                    .select("contact_id, status")
                    .eq("campaign_id", campaign_id)
                    .not("contact_id", "is", null);

                const oldIds = [...new Set((existing || []).map((r: any) => r.contact_id))] as string[];
                const keptIds = new Set(
                    (existing || [])
                        .filter((r: any) => r.status !== "pending")
                        .map((r: any) => r.contact_id)
                );
                const newIds = [...new Set(entries.map((e) => e.contact_id))];
                const newSet = new Set(newIds);

                await supabase
                    .from("campaign_contacts")
                    .delete()
                    .eq("campaign_id", campaign_id)
                    .in("status", ["pending", "invalid"]);

                // Não reinsere contato que já tem linha mantida (sent etc.) — índice único
                await insertCampaignContacts(
                    supabase, campaign_id, ownerId,
                    entries.filter((e) => !keptIds.has(e.contact_id)),
                    (body.invalid_rows as any[]) || []
                );

                const toAdd = newIds.filter((id) => !oldIds.includes(id));
                const toRemove = oldIds.filter((id) => !newSet.has(id) && !keptIds.has(id));
                await syncContactTags(supabase, ownerId, campaign.tag_id, toAdd, toRemove);
            }

            const { data: updated, error: updErr } = await supabase
                .from("campaigns")
                .update(updates)
                .eq("id", campaign_id)
                .select()
                .single();
            if (updErr) throw new Error(`Falha ao atualizar campanha: ${updErr.message}`);

            return new Response(JSON.stringify({ success: true, campaign: updated }), {
                headers: corsHeaders,
            });
        }

        // ══ DELETE ══════════════════════════════════════════════════════════
        if (action === "delete") {
            if (["dispatching", "dispatched"].includes(campaign.status)) {
                throw new Error("Campanha em disparo ou já disparada não pode ser excluída");
            }

            // Só remove o template da Meta se ele foi criado por esta campanha
            if (campaign.template_mode === "create" && campaign.template_name && campaign.instance_id) {
                try {
                    await callTemplateManage({
                        action: "delete",
                        user_id: ownerId,
                        instance_id: campaign.instance_id,
                        name: campaign.template_name,
                    });
                } catch (err: any) {
                    console.warn("[campaign-manage] template delete failed:", err.message);
                }
            }

            if (campaign.tag_id) {
                await supabase.from("contact_tags").delete().eq("tag_id", campaign.tag_id);
                await supabase.from("tags").delete().eq("id", campaign.tag_id);
            }

            const { error: delErr } = await supabase
                .from("campaigns")
                .delete()
                .eq("id", campaign_id);
            if (delErr) throw new Error(`Falha ao excluir campanha: ${delErr.message}`);

            return new Response(JSON.stringify({ success: true, deleted: campaign_id }), {
                headers: corsHeaders,
            });
        }

        // ══ REGENERATE_PROMPT ═══════════════════════════════════════════════
        if (action === "regenerate_prompt") {
            const aiPrompt = await generateAiPrompt(supabase, ownerId, {
                name: campaign.name,
                objective: campaign.objective,
                services: campaign.services || [],
                discount_pct: campaign.discount_pct,
                valid_until: campaign.valid_until,
                initial_message: campaign.initial_message,
                campaign_type: campaign.campaign_type || "promotion",
            });
            if (!aiPrompt) throw new Error("Falha ao gerar o prompt com a IA");

            await supabase.from("campaigns").update({ ai_prompt: aiPrompt }).eq("id", campaign_id);

            return new Response(JSON.stringify({ success: true, ai_prompt: aiPrompt }), {
                headers: corsHeaders,
            });
        }

        throw new Error(
            `Invalid action: "${action}". Valid: create, update, delete, regenerate_prompt, check_conflicts`
        );
    } catch (error: any) {
        console.error("[campaign-manage] Error:", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 400,
            headers: corsHeaders,
        });
    }
});
