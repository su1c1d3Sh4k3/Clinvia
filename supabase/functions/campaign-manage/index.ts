import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { makeOpenAIRequest, trackTokenUsage } from "../_shared/token-tracker.ts";

/**
 * campaign-manage
 *
 * CRUD de campanhas de disparo em massa (templates Meta MARKETING).
 *
 * Actions:
 *   - create:            cria campanha + tag + campaign_contacts + template Meta + ai_prompt
 *   - update:            edita campanha (recria template se mensagem mudou; regenera prompt)
 *   - delete:            remove campanha (bloqueado em dispatching/dispatched)
 *   - recreate_template: sugere reescrita da mensagem via IA (template REJECTED)
 *   - regenerate_prompt: regenera apenas o ai_prompt
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json; charset=utf-8",
};

const MIN_LEAD_MS = 48 * 60 * 60 * 1000; // 48h

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
    const slug = name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40);
    return slug || "campanha";
}

/**
 * Converte mensagem com <nome>/<serviço>/<data> em corpo de template Meta
 * com {{1}}..{{n}} pela ordem de primeira aparição.
 */
function buildTemplateBody(message: string): { body: string; variableMap: string[] } {
    const variableMap: string[] = [];
    const body = message.replace(/<\s*(nome|servi[çc]o|data)\s*>/gi, (_m, raw: string) => {
        const key = raw.toLowerCase().replace("ç", "c"); // nome | servico | data
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

async function createMetaTemplate(
    ownerId: string,
    instanceId: string,
    campaignName: string,
    version: number,
    initialMessage: string
) {
    const { body, variableMap } = buildTemplateBody(initialMessage);
    const templateName = `camp_${slugify(campaignName)}_v${version}`;
    const result = await callTemplateManage({
        action: "create",
        user_id: ownerId,
        instance_id: instanceId,
        name: templateName,
        category: "MARKETING",
        language: "pt_BR",
        components: [{ type: "BODY", text: body }],
    });
    return {
        templateId: result.template?.id || null,
        templateName,
        variableMap,
    };
}

interface PromptContext {
    name: string;
    objective: string;
    services: Array<{ name?: string; price?: number | string }>;
    discount_pct: number | null;
    valid_until: string;
    initial_message: string;
}

async function generateAiPrompt(
    supabase: any,
    ownerId: string,
    ctx: PromptContext
): Promise<string | null> {
    try {
        const servicesText = (ctx.services || [])
            .map((s) => {
                const price = s.price != null && s.price !== "" ? Number(s.price) : null;
                return `- ${s.name || "Serviço"}${price != null && !isNaN(price) ? `: R$ ${price.toFixed(2)}` : ""}`;
            })
            .join("\n") || "- (nenhum serviço específico)";

        const validUntil = new Date(ctx.valid_until).toLocaleDateString("pt-BR", {
            timeZone: "America/Sao_Paulo",
        });

        const discountText = ctx.discount_pct
            ? `Há um desconto de ${ctx.discount_pct}% que DEVE ser aplicado sobre o preço dos serviços acima ao informar valores ao cliente. Sempre mencione o preço original e o preço com desconto.`
            : "Não há desconto especial nesta campanha; use os preços de tabela.";

        const userPrompt = `Gere o bloco de instruções de campanha para um agente de IA de atendimento via WhatsApp de uma clínica.

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

async function rewriteTemplateMessage(
    supabase: any,
    ownerId: string,
    originalMessage: string,
    rejectionReason: string | null
): Promise<string> {
    const userPrompt = `A mensagem de template abaixo foi REJEITADA pela Meta (WhatsApp Cloud API).

MENSAGEM ORIGINAL:
"""
${originalMessage}
"""

MOTIVO DA REJEIÇÃO INFORMADO PELA META: ${rejectionReason || "não informado"}

Reescreva a mensagem para maximizar a chance de aprovação como template MARKETING, seguindo as diretrizes da Meta:
- Sem promessas enganosas, linguagem sensacionalista, EXCESSO DE MAIÚSCULAS ou pontuação repetida (!!!, ???).
- Sem conteúdo proibido (empréstimos, apostas, saúde milagrosa, etc.).
- Sem pedir dados sensíveis (documentos, senhas, cartão).
- Tom claro, profissional e com valor para o destinatário; deixar claro quem envia.
- Variáveis não podem ficar coladas umas nas outras nem abrir/encerrar a mensagem sem texto ao redor suficiente.
- Manter o mesmo idioma (pt-BR) e a mesma intenção comercial da original.

REGRAS OBRIGATÓRIAS:
1. PRESERVE os placeholders exatamente como estão: <nome>, <serviço>, <data> (use apenas os que existem na original).
2. Responda APENAS com o texto reescrito da mensagem, sem aspas, sem explicações.`;

    const { response } = await makeOpenAIRequest(supabase, ownerId, {
        endpoint: "https://api.openai.com/v1/chat/completions",
        body: {
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content:
                        "Você é um especialista em políticas de templates do WhatsApp Business (Meta). Reescreve mensagens para aprovação, preservando placeholders.",
                },
                { role: "user", content: userPrompt },
            ],
            temperature: 0.5,
            max_tokens: 500,
        },
    });

    if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error?.message || "Falha ao gerar sugestão com a IA");
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
    const suggestion = data.choices?.[0]?.message?.content?.trim();
    if (!suggestion) throw new Error("IA não retornou sugestão");
    return suggestion;
}

async function syncContactTags(
    supabase: any,
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
        const payload = addContactIds.map((id) => ({ contact_id: id, tag_id: tagId }));
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
        throw new Error("O disparo deve ser agendado com no mínimo 48 horas de antecedência");
    }
    if (valid <= sched) {
        throw new Error("A validade deve ser posterior à data do disparo");
    }
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
                contact_ids,
                invalid_rows,
            } = body;

            if (!name) throw new Error("Missing field: name");
            if (!instance_id) throw new Error("Missing field: instance_id");
            if (!source_type) throw new Error("Missing field: source_type");
            if (!scheduled_at) throw new Error("Missing field: scheduled_at");
            if (!valid_until) throw new Error("Missing field: valid_until");
            if (!initial_message) throw new Error("Missing field: initial_message");
            if (!objective) throw new Error("Missing field: objective");
            validateDates(scheduled_at, valid_until);

            const uniqueContactIds: string[] = [...new Set((contact_ids || []) as string[])];
            if (uniqueContactIds.length === 0 && !(invalid_rows || []).length) {
                throw new Error("A campanha precisa de pelo menos um contato");
            }

            // Instância precisa ser Meta
            const { data: instance, error: instErr } = await supabase
                .from("instances")
                .select("id, user_id, provider")
                .eq("id", instance_id)
                .eq("provider", "meta")
                .single();
            if (instErr || !instance) throw new Error("Instância Meta não encontrada");

            // Tag automática com nome da campanha
            const tag = await createTag(supabase, ownerId, name);

            const { body: _tplBody, variableMap } = buildTemplateBody(initial_message);

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
                    services: services || [],
                    discount_pct: discount_pct ?? null,
                    initial_message,
                    variable_map: variableMap,
                    objective,
                    ia_enabled: ia_enabled !== false,
                    tag_id: tag.id,
                    template_version: 1,
                    status: "scheduled",
                })
                .select()
                .single();
            if (campErr) throw new Error(`Falha ao criar campanha: ${campErr.message}`);

            // campaign_contacts (válidos + inválidos)
            const rows: any[] = uniqueContactIds.map((cid) => ({
                campaign_id: campaign.id,
                user_id: ownerId,
                contact_id: cid,
                status: "pending",
            }));
            for (const inv of invalid_rows || []) {
                rows.push({
                    campaign_id: campaign.id,
                    user_id: ownerId,
                    contact_id: null,
                    raw_data: inv,
                    status: "invalid",
                    error: "Número de telefone inválido",
                });
            }
            if (rows.length > 0) {
                const { error: ccErr } = await supabase.from("campaign_contacts").insert(rows);
                if (ccErr) console.warn("[campaign-manage] campaign_contacts insert error:", ccErr.message);
            }

            // Tag em todos os contatos válidos
            await syncContactTags(supabase, tag.id, uniqueContactIds, []);

            // Template Meta (falha não destrói a campanha — marca erro)
            let templateError: string | null = null;
            try {
                const tpl = await createMetaTemplate(ownerId, instance_id, name, 1, initial_message);
                await supabase
                    .from("campaigns")
                    .update({ template_id: tpl.templateId, template_name: tpl.templateName })
                    .eq("id", campaign.id);
                campaign.template_id = tpl.templateId;
                campaign.template_name = tpl.templateName;
            } catch (err: any) {
                templateError = err.message;
                await supabase
                    .from("campaigns")
                    .update({ status: "error", error_message: `Falha ao criar template: ${err.message}` })
                    .eq("id", campaign.id);
                campaign.status = "error";
                campaign.error_message = `Falha ao criar template: ${err.message}`;
            }

            // ai_prompt (não bloqueante)
            const aiPrompt = await generateAiPrompt(supabase, ownerId, {
                name,
                objective,
                services: services || [],
                discount_pct: discount_pct ?? null,
                valid_until,
                initial_message,
            });
            if (aiPrompt) {
                await supabase.from("campaigns").update({ ai_prompt: aiPrompt }).eq("id", campaign.id);
                campaign.ai_prompt = aiPrompt;
            }

            return new Response(
                JSON.stringify({ success: true, campaign, template_error: templateError }),
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
                "initial_message",
            ];
            for (const f of fields) {
                if (body[f] !== undefined) updates[f] = body[f];
            }

            const newScheduledAt = (updates.scheduled_at as string) || campaign.scheduled_at;
            const newValidUntil = (updates.valid_until as string) || campaign.valid_until;
            const messageChanged =
                updates.initial_message !== undefined &&
                updates.initial_message !== campaign.initial_message;
            const needsNewTemplate = messageChanged || campaign.status === "error" || !campaign.template_name;

            if (updates.scheduled_at !== undefined || updates.valid_until !== undefined || needsNewTemplate) {
                validateDates(newScheduledAt, newValidUntil);
            }

            const newInstanceId = (updates.instance_id as string) || campaign.instance_id;
            if (updates.instance_id !== undefined) {
                const { data: inst } = await supabase
                    .from("instances")
                    .select("id")
                    .eq("id", newInstanceId)
                    .eq("provider", "meta")
                    .single();
                if (!inst) throw new Error("Instância Meta não encontrada");
            }

            // Recriar template se a mensagem mudou (ou se nunca foi criado / estava em erro)
            if (needsNewTemplate) {
                const newMessage = (updates.initial_message as string) || campaign.initial_message;
                if (campaign.template_name && campaign.instance_id) {
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
                const newVersion = (campaign.template_version || 1) + (campaign.template_name ? 1 : 0);
                const tpl = await createMetaTemplate(
                    ownerId,
                    newInstanceId,
                    (updates.name as string) || campaign.name,
                    newVersion,
                    newMessage
                );
                const { variableMap } = buildTemplateBody(newMessage);
                updates.template_id = tpl.templateId;
                updates.template_name = tpl.templateName;
                updates.template_version = newVersion;
                updates.variable_map = variableMap;
                updates.status = "scheduled";
                updates.error_message = null;
            }

            // Regenerar ai_prompt se contexto comercial mudou
            const promptFieldsChanged = ["objective", "services", "discount_pct", "valid_until", "initial_message"]
                .some((f) => body[f] !== undefined);
            if (promptFieldsChanged) {
                const aiPrompt = await generateAiPrompt(supabase, ownerId, {
                    name: (updates.name as string) || campaign.name,
                    objective: (updates.objective as string) || campaign.objective,
                    services: (updates.services as any[]) ?? campaign.services ?? [],
                    discount_pct: (updates.discount_pct as number | null) ?? campaign.discount_pct,
                    valid_until: newValidUntil,
                    initial_message: (updates.initial_message as string) || campaign.initial_message,
                });
                if (aiPrompt) updates.ai_prompt = aiPrompt;
            }

            // Diff de audiência
            if (body.contact_ids !== undefined) {
                const newIds: string[] = [...new Set(body.contact_ids as string[])];
                const { data: existing } = await supabase
                    .from("campaign_contacts")
                    .select("id, contact_id, status")
                    .eq("campaign_id", campaign_id)
                    .not("contact_id", "is", null);

                const existingIds = new Set((existing || []).map((r: any) => r.contact_id));
                const toAdd = newIds.filter((id) => !existingIds.has(id));
                const newSet = new Set(newIds);
                const toRemove = (existing || [])
                    .filter((r: any) => !newSet.has(r.contact_id) && r.status === "pending")
                    .map((r: any) => r.contact_id);

                if (toRemove.length > 0) {
                    await supabase
                        .from("campaign_contacts")
                        .delete()
                        .eq("campaign_id", campaign_id)
                        .in("contact_id", toRemove)
                        .eq("status", "pending");
                }
                if (toAdd.length > 0) {
                    await supabase.from("campaign_contacts").insert(
                        toAdd.map((cid) => ({
                            campaign_id,
                            user_id: ownerId,
                            contact_id: cid,
                            status: "pending",
                        }))
                    );
                }
                await syncContactTags(supabase, campaign.tag_id, toAdd, toRemove);

                if (body.invalid_rows !== undefined) {
                    await supabase
                        .from("campaign_contacts")
                        .delete()
                        .eq("campaign_id", campaign_id)
                        .eq("status", "invalid");
                    const invRows = (body.invalid_rows as any[]).map((inv) => ({
                        campaign_id,
                        user_id: ownerId,
                        contact_id: null,
                        raw_data: inv,
                        status: "invalid",
                        error: "Número de telefone inválido",
                    }));
                    if (invRows.length > 0) {
                        await supabase.from("campaign_contacts").insert(invRows);
                    }
                }
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

            if (campaign.template_name && campaign.instance_id) {
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

        // ══ RECREATE_TEMPLATE (sugestão IA para template rejeitado) ═════════
        if (action === "recreate_template") {
            let rejectionReason: string | null = null;
            if (campaign.template_id) {
                const { data: tpl } = await supabase
                    .from("message_templates")
                    .select("rejection_reason, status")
                    .eq("id", campaign.template_id)
                    .maybeSingle();
                rejectionReason = tpl?.rejection_reason || null;
            }

            const suggestion = await rewriteTemplateMessage(
                supabase,
                ownerId,
                campaign.initial_message,
                rejectionReason
            );

            return new Response(JSON.stringify({ success: true, suggestion }), {
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
            });
            if (!aiPrompt) throw new Error("Falha ao gerar o prompt com a IA");

            await supabase.from("campaigns").update({ ai_prompt: aiPrompt }).eq("id", campaign_id);

            return new Response(JSON.stringify({ success: true, ai_prompt: aiPrompt }), {
                headers: corsHeaders,
            });
        }

        throw new Error(
            `Invalid action: "${action}". Valid: create, update, delete, recreate_template, regenerate_prompt`
        );
    } catch (error: any) {
        console.error("[campaign-manage] Error:", error);
        return new Response(JSON.stringify({ success: false, error: error.message }), {
            status: 400,
            headers: corsHeaders,
        });
    }
});
