/**
 * Link público de agendamento (/agendar?d=<base64>).
 *
 * `btoa` só aceita caracteres Latin1. O nome do contato vem do WhatsApp e pode
 * ter emoji ("✨✨✨") ou qualquer caractere fora dessa faixa — nesse caso o
 * btoa direto lança InvalidCharacterError e derruba quem estava montando o
 * link. Caso real: o forward da mensagem para o n8n morria dentro do try e o
 * payload nunca chegava na IA.
 *
 * Aqui o JSON vira bytes UTF-8 antes do base64. Para nome ASCII o resultado é
 * idêntico ao formato antigo, então links já enviados continuam válidos.
 */
export interface BookingLinkData {
    user_id: string;
    contact_id: string;
    contact_name: string;
    instance_id: string | null;
    /**
     * Canal de onde o link saiu. No Instagram o `contact_id` é o contato preso
     * ao IGSID — que não tem telefone — então a tela pede nome + telefone antes
     * de qualquer coisa e troca esse id pelo contato de WhatsApp. Ausente (ou
     * 'whatsapp') mantém o token byte a byte igual ao antigo, então todo link
     * já enviado continua valendo.
     */
    origin?: 'whatsapp' | 'instagram';
}

export function buildBookingLink(data: BookingLinkData): string {
    // Token de WhatsApp não ganha campo novo: links antigos e novos coincidem.
    const payload = data.origin === 'instagram'
        ? data
        : { user_id: data.user_id, contact_id: data.contact_id, contact_name: data.contact_name, instance_id: data.instance_id };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `https://app.clinbia.ai/agendar?d=${btoa(binary)}`;
}
