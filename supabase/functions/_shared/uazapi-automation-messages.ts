// supabase/functions/_shared/uazapi-automation-messages.ts
// -----------------------------------------------------------------------------
// Mensagens automáticas da API não oficial (UAZAPI) — espelham os 4 templates
// de sistema da Meta, mas com corpo editável por usuário (tabela
// uazapi_automation_messages) e switch liga/desliga independente do da Meta.
// Ausência de linha = habilitado + corpo default abaixo.
// Variáveis nomeadas: {{nome_cliente}}, {{horario}}, {{horarios}}, {{clinica}},
// {{servico}}, {{agendamentos}}.
//
// O nome do profissional NÃO é usado: appointments.professional_name guarda o
// nome da SALA (professionals.name), que em sala avulsa é "Sala 2" e sairia
// como "...com Sala 2" para o paciente.
// -----------------------------------------------------------------------------

export interface UazapiAutomationMessage {
    body: string | null;
    enabled: boolean;
}

export const DEFAULT_UAZAPI_BODIES: Record<string, string> = {
    sys_confirm_24h_v1:
        "Olá {{nome_cliente}}, tudo bem com você? Estou entrando em contato para confirmar seu agendamento amanhã às {{horario}} aqui na {{clinica}} para o procedimento de {{servico}}. Posso confirmar sua presença?",
    sys_confirm_multi_v1:
        "Olá {{nome_cliente}}, tudo bem com você? Estou entrando em contato para confirmar seus agendamentos de amanhã aqui na {{clinica}}:\n\n{{agendamentos}}\n\nPosso confirmar sua presença em todos?",
    sys_reminder_2h_v1:
        "Olá {{nome_cliente}}, passando para reforçar seu atendimento às {{horarios}} aqui na clínica, se puder chegar com pelo menos 30 min de antecedencia seria o ideal, estamos te aguardando.",
    sys_feedback_24h_v1:
        "Como vai {{nome_cliente}}, espero que esteja bem, estou passando para pedir seu feedback sobre seu atendimento aqui na clínica ontem, se puder por gentileza nos dar seu feedback:",
};

/** Carrega as mensagens editadas/switches do usuário (Map por template_name). */
export async function loadUazapiAutomationMessages(
    supabase: any,
    userId: string,
): Promise<Map<string, UazapiAutomationMessage>> {
    const map = new Map<string, UazapiAutomationMessage>();
    const { data } = await supabase
        .from("uazapi_automation_messages")
        .select("template_name, body, enabled")
        .eq("user_id", userId);
    for (const row of data || []) {
        map.set(row.template_name, {
            body: row.body || null,
            enabled: row.enabled !== false,
        });
    }
    return map;
}

/** Switch liga/desliga da mensagem UAZAPI (default: ligado). */
export function isUazapiMessageEnabled(
    messages: Map<string, UazapiAutomationMessage>,
    templateName: string,
): boolean {
    return messages.get(templateName)?.enabled !== false;
}

/** Corpo editado pelo usuário (fallback: default) renderizado com as variáveis. */
export function renderUazapiMessage(
    messages: Map<string, UazapiAutomationMessage>,
    templateName: string,
    values: Record<string, string>,
): string {
    const body = messages.get(templateName)?.body || DEFAULT_UAZAPI_BODIES[templateName] || "";
    return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, key) => values[key] ?? m);
}
