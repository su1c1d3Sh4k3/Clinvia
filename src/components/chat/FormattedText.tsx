import React from "react";

/**
 * Formatação de corpo de mensagem compartilhada entre o Inbox (MessageList)
 * e os modais de conversa (MessageBubble). FONTE ÚNICA — qualquer regra nova
 * de formatação (negrito, itálico, links, menções) deve ser feita AQUI.
 */

/** Detecta mensagens de template: "*Template enviado: name*\nbody" → [full, name, body] */
export const parseTemplateBody = (body: string): RegExpMatchArray | null =>
    body.match(/^\*Template enviado: ([^*]+)\*\n([\s\S]*)$/);

interface FormattedTextProps {
    text: string;
    /** Termo de busca a destacar (amarelo) */
    highlight?: string;
    /**
     * Renderização opcional de menções @numero (grupos).
     * Recebe o id cru (dígitos após o @) e o token original; retornar null cai no texto normal.
     */
    renderMention?: (rawId: string, original: string) => React.ReactNode | null;
}

export function FormattedText({ text, highlight = "", renderMention }: FormattedTextProps) {
    // URLs | menções @numero | negrito *x* | itálico _x_
    const tokenRegex = /(https?:\/\/[^\s]+)|(@\d+)|(\*[^*\n]+\*)|(_[^_\n]+_)/gi;
    const parts = text.split(tokenRegex).filter((part) => part !== undefined && part !== "");

    return (
        <span>
            {parts.map((part, i) => {
                // URL
                if (/^https?:\/\//i.test(part)) {
                    return (
                        <a
                            key={i}
                            href={part}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline break-all"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {part}
                        </a>
                    );
                }

                // Menção @digits (grupos)
                if (renderMention && /^@\d+(@[a-zA-Z.]+)?$/.test(part)) {
                    const rawId = part.substring(1).split("@")[0];
                    const node = renderMention(rawId, part);
                    if (node) return <React.Fragment key={i}>{node}</React.Fragment>;
                }

                // Negrito *texto*
                if (/^\*[^*\n]+\*$/.test(part)) {
                    return <strong key={i}>{part.slice(1, -1)}</strong>;
                }

                // Itálico _texto_
                if (/^_[^_\n]+_$/.test(part)) {
                    return <em key={i}>{part.slice(1, -1)}</em>;
                }

                // Destaque do termo de busca
                if (!highlight.trim()) return <span key={i}>{part}</span>;
                const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const highlightParts = part.split(new RegExp(`(${escaped})`, "gi"));
                return (
                    <span key={i}>
                        {highlightParts.map((hPart, j) =>
                            hPart.toLowerCase() === highlight.toLowerCase() ? (
                                <span key={j} className="bg-yellow-200 text-black font-medium px-0.5 rounded">
                                    {hPart}
                                </span>
                            ) : (
                                hPart
                            )
                        )}
                    </span>
                );
            })}
        </span>
    );
}
