/**
 * Resumo de uma conversa encerrada — fonte única.
 *
 * REGRA: o resumo é POR CONVERSA. Cada ticket é uma linha própria em
 * `conversations` (webhook-handle-message nunca reabre conversa resolvida), então
 * o material analisado são apenas as mensagens daquele ticket — nunca o histórico
 * do contato inteiro.
 *
 * Ao resolver, `archive_messages_before_resolve` copia as mensagens para
 * `conversations.messages_history` e `delete_messages_on_resolve` APAGA as linhas
 * de `messages`. Por isso a leitura é do histórico arquivado, com fallback para as
 * mensagens vivas (conversa ainda aberta, caso do botão "Gerar Resumo").
 *
 * Consumido por `conversation-summary-worker` e `ai-generate-summary`. O bundler
 * do Deno inclui `_shared` — editar este arquivo obriga redeploy das duas.
 */

import { trackTokenUsage, makeOpenAIRequest } from "./token-tracker.ts";

const MODEL = "gpt-4o-mini";

/** Teto de caracteres do transcript — conversa muito longa é cortada pelo começo. */
const MAX_TRANSCRIPT_CHARS = 24000;

export interface ConversationSummary {
    summary: string;
    sentiment_score: number;
    speed_score: number;
}

type ArchivedMessage = {
    role?: string;
    content?: string;
    transcription?: string | null;
    type?: string | null;
    media_url?: string | null;
    created_at?: string;
};

type LiveMessage = {
    direction?: string;
    body?: string | null;
    transcription?: string | null;
    message_type?: string | null;
    media_url?: string | null;
    created_at?: string;
};

function formatLine(quem: string, createdAt: string | undefined, texto: string): string {
    const quando = createdAt ? new Date(createdAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
    return `[${quando}] ${quem}: ${texto}`;
}

/** Corta pelo COMEÇO: o desfecho do atendimento é o que mais importa no resumo. */
function limitTranscript(texto: string): string {
    if (texto.length <= MAX_TRANSCRIPT_CHARS) return texto;
    return "[...trecho inicial omitido...]\n" + texto.slice(texto.length - MAX_TRANSCRIPT_CHARS);
}

export function transcriptFromHistory(history: ArchivedMessage[]): string {
    return limitTranscript(
        history
            .map((m) => {
                let conteudo = m.transcription || m.content || "";
                if (m.media_url && !m.transcription) conteudo += ` [${m.type || "mídia"}]`;
                return formatLine(m.role === "user" ? "Cliente" : "Atendimento", m.created_at, conteudo.trim());
            })
            .join("\n"),
    );
}

export function transcriptFromMessages(messages: LiveMessage[]): string {
    return limitTranscript(
        messages
            .map((m) => {
                let conteudo = m.transcription || m.body || "";
                if (m.media_url && !m.transcription) conteudo += ` [${m.message_type || "mídia"}]`;
                return formatLine(m.direction === "inbound" ? "Cliente" : "Atendimento", m.created_at, conteudo.trim());
            })
            .join("\n"),
    );
}

/**
 * Monta o transcript de uma conversa: histórico arquivado (ticket encerrado) e,
 * se estiver vazio, as mensagens vivas (ticket ainda aberto).
 */
export async function loadConversationTranscript(
    supabase: any,
    conversationId: string,
): Promise<{ transcript: string; ownerId: string | null }> {
    const { data: conv, error: convError } = await supabase
        .from("conversations")
        .select("user_id, messages_history")
        .eq("id", conversationId)
        .maybeSingle();

    if (convError) throw convError;
    if (!conv) throw new Error(`Conversa ${conversationId} não encontrada`);

    const history = Array.isArray(conv.messages_history) ? conv.messages_history : [];
    if (history.length > 0) {
        return { transcript: transcriptFromHistory(history), ownerId: conv.user_id ?? null };
    }

    const { data: messages, error: messagesError } = await supabase
        .from("messages")
        .select("direction, body, transcription, message_type, media_url, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

    if (messagesError) throw messagesError;

    return {
        transcript: transcriptFromMessages(messages ?? []),
        ownerId: conv.user_id ?? null,
    };
}

const PROMPT_HEADER = `Analise a conversa de atendimento abaixo e gere um resumo executivo e estruturado.

Diretrizes de Qualidade:
1. **Tema Central**: comece com uma frase sucinta definindo o motivo principal do contato.
2. **Principais Pontos**: liste os 3-5 pontos cruciais discutidos, focando em problemas, decisões e ações tomadas.
3. **Destaques Positivos**: identifique onde o atendimento foi eficaz, cordial ou resolveu o problema rapidamente.
4. **Observações**: pendências, próximos passos e presença de dados sensíveis (nunca repita senhas ou números de cartão).

Regras:
- Analise SOMENTE a conversa fornecida; não invente informação que não esteja nela.
- Escreva em português do Brasil.
- Formate em Markdown, com negrito para ênfase e emojis com moderação.

Métricas:
- Sentimento do Cliente (0-10): baseado no tom, nas palavras usadas e na satisfação final.
- Velocidade de Atendimento (0-10): baseada na fluidez e no tempo de resposta do atendimento.`;

const PROMPT_FOOTER = `Responda APENAS em formato JSON:
{
  "summary": "### 🎯 Tema Central\\n[Descrição sucinta]\\n\\n### 📌 Principais Pontos\\n- [Ponto 1]\\n- [Ponto 2]\\n\\n### ✨ Destaques Positivos\\n- [Destaque 1]\\n\\n### ⚠️ Observações\\n[Pendências, próximos passos ou dados sensíveis]",
  "sentiment_score": 8,
  "speed_score": 9
}`;

function clampScore(valor: unknown): number {
    const n = Number(valor);
    if (!Number.isFinite(n)) return 5;
    return Math.min(10, Math.max(0, Math.round(n * 10) / 10));
}

/**
 * Chama a IA e devolve o resumo. NÃO grava nada — quem chama decide onde salvar.
 */
export async function generateConversationSummary(
    supabase: any,
    params: { transcript: string; ownerId: string | null; functionName: string },
): Promise<ConversationSummary> {
    const { transcript, ownerId, functionName } = params;

    if (!transcript.trim()) {
        throw new Error("Conversa sem mensagens para analisar");
    }

    const { response, usedCustomToken } = await makeOpenAIRequest(supabase, ownerId, {
        endpoint: "https://api.openai.com/v1/chat/completions",
        body: {
            model: MODEL,
            messages: [
                { role: "system", content: "Você é um analista de qualidade de atendimento." },
                { role: "user", content: `${PROMPT_HEADER}\n\nConversa:\n${transcript}\n\n${PROMPT_FOOTER}` },
            ],
            temperature: 0.4,
            max_tokens: 1000,
            response_format: { type: "json_object" },
        },
    });

    if (!response.ok) {
        const erro = await response.text().catch(() => response.statusText);
        throw new Error(`OpenAI ${response.status}: ${erro.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    let parsed: any;
    try {
        parsed = JSON.parse(content);
    } catch {
        const match = content.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : { summary: content };
    }

    if (data.usage && ownerId) {
        await trackTokenUsage(supabase, {
            ownerId,
            teamMemberId: null,
            functionName,
            model: MODEL,
            usage: data.usage,
        });
    }

    console.log(`[${functionName}] token ${usedCustomToken ? "do cliente" : "padrão"}`);

    const summary = String(parsed?.summary ?? "").trim();
    if (!summary) throw new Error("IA respondeu sem resumo");

    return {
        summary,
        sentiment_score: clampScore(parsed?.sentiment_score),
        speed_score: clampScore(parsed?.speed_score),
    };
}
