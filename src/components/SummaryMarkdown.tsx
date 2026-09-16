import ReactMarkdown from "react-markdown";

/**
 * Resumo de conversa gerado pela IA — vem em Markdown (### títulos, listas,
 * negrito). Renderizado como texto puro apareciam os "###" e "**" na tela.
 */
export const SummaryMarkdown = ({ children }: { children: string }) => (
  <ReactMarkdown
    components={{
      h1: ({ children }) => <p className="font-semibold mt-3 first:mt-0">{children}</p>,
      h2: ({ children }) => <p className="font-semibold mt-3 first:mt-0">{children}</p>,
      h3: ({ children }) => <p className="font-semibold mt-3 first:mt-0">{children}</p>,
      p: ({ children }) => <p className="mt-1">{children}</p>,
      ul: ({ children }) => <ul className="mt-1 ml-4 list-disc space-y-0.5">{children}</ul>,
      ol: ({ children }) => <ol className="mt-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    }}
  >
    {children}
  </ReactMarkdown>
);
