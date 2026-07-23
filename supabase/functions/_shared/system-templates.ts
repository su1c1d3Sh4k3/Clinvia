// supabase/functions/_shared/system-templates.ts
// -----------------------------------------------------------------------------
// Templates Meta de sistema usados pelas automações de agendamento
// (confirmação 24h, lembrete 2h, feedback 24h). Quando uma instância Meta é
// conectada, todos são criados e submetidos à aprovação automaticamente.
// Envio só ocorre quando o template está APPROVED (sem fallback).
//
// Regras Meta respeitadas:
//  - Parâmetros {{n}} não podem conter quebras de linha nem 4+ espaços
//  - Body não pode começar/terminar com parâmetro
//  - QUICK_REPLY: máx. 25 caracteres por botão
// -----------------------------------------------------------------------------

export interface SystemTemplateDef {
    name: string;
    category: "UTILITY";
    language: "pt_BR";
    components: Record<string, unknown>[];
}

const CONFIRM_BUTTONS = [
    { type: "QUICK_REPLY", text: "Sim, pode confirmar" },
    { type: "QUICK_REPLY", text: "Vou precisar reagendar" },
    { type: "QUICK_REPLY", text: "Não vou poder ir" },
];

const FEEDBACK_BUTTONS = [
    { type: "QUICK_REPLY", text: "Excelente" },
    { type: "QUICK_REPLY", text: "Muito bom" },
    { type: "QUICK_REPLY", text: "Regular" },
    { type: "QUICK_REPLY", text: "Precisa melhorar" },
    { type: "QUICK_REPLY", text: "Insatisfeito" },
];

export const TPL_CONFIRM_SINGLE = "sys_confirm_24h_v1";
export const TPL_CONFIRM_MULTI = "sys_confirm_multi_v1";
export const TPL_REMINDER = "sys_reminder_2h_v1";
export const TPL_FEEDBACK = "sys_feedback_24h_v1";

export const SYSTEM_TEMPLATES: SystemTemplateDef[] = [
    {
        // {{1}} nome, {{2}} hora, {{3}} clínica, {{4}} procedimento, {{5}} profissional
        name: TPL_CONFIRM_SINGLE,
        category: "UTILITY",
        language: "pt_BR",
        components: [
            {
                type: "BODY",
                text: "Olá {{1}}, tudo bem com você? Estou entrando em contato para confirmar seu agendamento amanhã às {{2}} aqui na {{3}} para o procedimento de {{4}} com {{5}}. Posso confirmar sua presença?",
            },
            { type: "BUTTONS", buttons: CONFIRM_BUTTONS },
        ],
    },
    {
        // {{1}} nome, {{2}} clínica, {{3}} lista de agendamentos (linha única)
        name: TPL_CONFIRM_MULTI,
        category: "UTILITY",
        language: "pt_BR",
        components: [
            {
                type: "BODY",
                text: "Olá {{1}}, tudo bem com você? Estou entrando em contato para confirmar seus agendamentos de amanhã aqui na {{2}}: {{3}}. Posso confirmar sua presença em todos?",
            },
            { type: "BUTTONS", buttons: CONFIRM_BUTTONS },
        ],
    },
    {
        // {{1}} nome, {{2}} horário(s)
        name: TPL_REMINDER,
        category: "UTILITY",
        language: "pt_BR",
        components: [
            {
                type: "BODY",
                text: "Olá {{1}}, passando para reforçar seu atendimento às {{2}} aqui na clínica, se puder chegar com pelo menos 30 min de antecedencia seria o ideal, estamos te aguardando.",
            },
        ],
    },
    {
        // {{1}} nome
        name: TPL_FEEDBACK,
        category: "UTILITY",
        language: "pt_BR",
        components: [
            {
                type: "BODY",
                text: "Como vai {{1}}, espero que esteja bem, estou passando para pedir seu feedback sobre seu atendimento aqui na clínica ontem, se puder por gentileza nos dar seu feedback:",
            },
            { type: "BUTTONS", buttons: FEEDBACK_BUTTONS },
        ],
    },
];

export const SYSTEM_TEMPLATE_NAMES = SYSTEM_TEMPLATES.map((t) => t.name);

// ---------------------------------------------------------------------------
// Chamada interna a outra edge function (service role)
// ---------------------------------------------------------------------------

export async function callFunction(
    name: string,
    payload: Record<string, unknown>,
): Promise<{ ok: boolean; result: any }> {
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
    let result: any = null;
    try {
        result = await resp.json();
    } catch { /* resposta não-JSON */ }
    return { ok: resp.ok, result };
}

// ---------------------------------------------------------------------------
// Criação/verificação dos templates de sistema em uma instância Meta
// ---------------------------------------------------------------------------

/**
 * Garante que todos os templates de sistema existem na instância Meta.
 * 1. Sincroniza os templates da instância com a Graph API (atualiza status)
 * 2. Cria os que estiverem faltando (submetidos à aprovação da Meta)
 * Retorna Map name → status (PENDING/APPROVED/REJECTED/...).
 *
 * Anti-duplicata: templates Meta pertencem à WABA (não ao número). A checagem
 * de existência é feita por waba_id — se duas instâncias compartilham a mesma
 * WABA, o template criado por uma vale para a outra e não é recriado. Erro
 * "already exists" da Meta é tratado como benigno (resolve via sync).
 */
export async function ensureSystemTemplates(
    supabase: any,
    userId: string,
    instanceId: string,
): Promise<Map<string, string>> {
    const { data: inst } = await supabase
        .from("instances")
        .select("id, meta_waba_id")
        .eq("id", instanceId)
        .maybeSingle();
    const instanceRef = { id: instanceId, meta_waba_id: inst?.meta_waba_id ?? null };

    // Sync com a Graph API (não-fatal se falhar — usa estado local)
    try {
        await callFunction("meta-template-manage", {
            action: "sync",
            user_id: userId,
            instance_id: instanceId,
        });
    } catch (err) {
        console.warn("[system-templates] sync failed:", err);
    }

    const statuses = await getSystemTemplateStatuses(supabase, instanceRef);

    for (const def of SYSTEM_TEMPLATES) {
        if (statuses.has(def.name)) continue;
        try {
            const { ok, result } = await callFunction("meta-template-manage", {
                action: "create",
                user_id: userId,
                instance_id: instanceId,
                name: def.name,
                category: def.category,
                language: def.language,
                components: def.components,
            });
            if (!ok || result?.success === false) {
                const errMsg = String(result?.error || "unknown");
                if (/already exists|já existe/i.test(errMsg)) {
                    // Template já existe na WABA (ex.: criado por outra instância) —
                    // não é erro; o sync seguinte traz o status real
                    console.log(`[system-templates] ${def.name} already exists on WABA — skipping`);
                } else {
                    console.error(`[system-templates] create ${def.name} failed:`, errMsg);
                }
            } else {
                statuses.set(def.name, result?.template?.status || "PENDING");
                console.log(`[system-templates] created ${def.name} (instance ${instanceId})`);
            }
        } catch (err) {
            console.error(`[system-templates] create ${def.name} error:`, err);
        }
    }

    return statuses;
}

/**
 * Status locais dos templates de sistema (Map name → status).
 * Busca por waba_id quando disponível (templates são por WABA na Meta);
 * fallback por instance_id.
 */
export async function getSystemTemplateStatuses(
    supabase: any,
    instanceRef: { id: string; meta_waba_id?: string | null },
): Promise<Map<string, string>> {
    let query = supabase
        .from("message_templates")
        .select("name, status")
        .in("name", SYSTEM_TEMPLATE_NAMES);
    query = instanceRef.meta_waba_id
        ? query.eq("waba_id", instanceRef.meta_waba_id)
        : query.eq("instance_id", instanceRef.id);
    const { data } = await query;
    const map = new Map<string, string>();
    for (const t of data || []) map.set(t.name, t.status);
    return map;
}

// ---------------------------------------------------------------------------
// Envio via Meta (template ou texto livre) através de meta-send-message
// ---------------------------------------------------------------------------

/** Remove quebras de linha e espaços múltiplos (proibidos em parâmetros Meta). */
export function sanitizeParam(value: string): string {
    return (value || "").replace(/\s+/g, " ").trim();
}

export async function sendMetaTemplate(params: {
    conversationId: string;
    templateName: string;
    parameters: string[];
    bodyPreview: string;
}): Promise<{ messageId: string | null }> {
    const templateData: any = {
        name: params.templateName,
        language: { code: "pt_BR" },
    };
    if (params.parameters.length > 0) {
        templateData.components = [
            {
                type: "body",
                parameters: params.parameters.map((text) => ({
                    type: "text",
                    text: sanitizeParam(text),
                })),
            },
        ];
    }

    const { ok, result } = await callFunction("meta-send-message", {
        conversationId: params.conversationId,
        body: `*Template enviado: ${params.templateName}*\n${params.bodyPreview}`,
        messageType: "template",
        templateData,
        message: { wasSentByApi: true },
    });
    if (!ok || result?.success === false) {
        throw new Error(result?.message || result?.error || "Falha no envio do template Meta");
    }
    return { messageId: result?.messageId || null };
}

export async function sendMetaText(params: {
    conversationId: string;
    text: string;
}): Promise<{ messageId: string | null }> {
    const { ok, result } = await callFunction("meta-send-message", {
        conversationId: params.conversationId,
        body: params.text,
        messageType: "text",
        message: { wasSentByApi: true },
    });
    if (!ok || result?.success === false) {
        throw new Error(result?.message || result?.error || "Falha no envio de texto via Meta");
    }
    return { messageId: result?.messageId || null };
}
