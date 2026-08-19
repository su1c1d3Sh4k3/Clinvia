/**
 * Resolve o nome do remetente exibido acima do balão de mensagens outbound
 * (user rule: remetente SEMPRE visível, mesmo com assinatura de WhatsApp desligada).
 *
 * Fallbacks, em ordem:
 *  1. messages.sender_name (gravado pelos send functions desde o deploy 214f53a)
 *  2. Prefixo de assinatura "*Nome:*\n" no body/caption (mensagens retroativas)
 *  3. "IA" — mas SÓ quando é seguro afirmar isso:
 *     - mensagens pós-deploy: envio humano sempre grava sender_name, logo
 *       outbound sem nome = IA/API;
 *     - mensagens pré-deploy: apenas se o webhook marcou is_ai_response=true.
 *       Mensagens humanas antigas sem assinatura ficam SEM label (antes o
 *       fallback rotulava "IA" incorretamente — caso Adrielly/Tamiris 19/08).
 *  4. Mensagens otimistas (ainda sem resposta do servidor) nunca mostram label.
 */

// Momento do deploy dos send functions que passaram a gravar sender_name (214f53a).
const SENDER_NAME_DEPLOY_MS = Date.parse("2026-08-19T16:00:00Z");

export function resolveOutboundSenderName(msg: any): string | null {
  if (msg?.direction !== "outbound") return null;

  const bodySignature = typeof msg.body === "string" ? msg.body.match(/^\*([^*]+):\*\n/) : null;
  const captionSignature = typeof msg.caption === "string" ? msg.caption.match(/^\*([^*]+):\*\n/) : null;
  const named = msg.sender_name || bodySignature?.[1] || captionSignature?.[1];
  if (named) return named;

  if (msg._optimistic || msg.status === "sending") return null;

  const createdAtMs = msg.created_at ? Date.parse(msg.created_at) : 0;
  if (createdAtMs && createdAtMs < SENDER_NAME_DEPLOY_MS) {
    return msg.is_ai_response === true ? "IA" : null;
  }
  return "IA";
}
