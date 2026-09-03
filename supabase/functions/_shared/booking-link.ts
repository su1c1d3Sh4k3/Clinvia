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
}

export function buildBookingLink(data: BookingLinkData): string {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `https://app.clinbia.ai/agendar?d=${btoa(binary)}`;
}
