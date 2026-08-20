// ---------------------------------------------------------------------------
// Gerador do ai_prompt de campanhas (gpt-4o-mini) — FONTE ÚNICA usada por
// campaign-manage e recurrence-campaign-generator (R11: campanhas de
// recorrência ganham campaign_prompt pelo mesmíssimo gerador).
// ---------------------------------------------------------------------------

import { makeOpenAIRequest, trackTokenUsage } from "./token-tracker.ts";

export interface CampaignPromptContext {
    name: string;
    objective: string;
    services: Array<{ name?: string; price?: number | string }>;
    discount_pct: number | null;
    valid_until: string;
    initial_message: string;
    campaign_type?: string;
}

export async function generateCampaignAiPrompt(
    supabase: any,
    ownerId: string,
    ctx: CampaignPromptContext,
    functionName = "campaign-manage",
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
            console.error(`[${functionName}] OpenAI prompt error:`, err?.error?.message || response.status);
            return null;
        }

        const data = await response.json();
        if (data.usage) {
            await trackTokenUsage(supabase, {
                ownerId,
                functionName,
                model: "gpt-4o-mini",
                usage: data.usage,
            });
        }
        return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (err) {
        console.error(`[${functionName}] generateCampaignAiPrompt failed:`, err);
        return null;
    }
}
