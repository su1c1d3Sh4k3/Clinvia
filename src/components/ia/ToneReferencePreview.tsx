import { useMemo } from "react";
import { buildReferenceConversation } from "@/lib/tone";
import type { ToneSettings } from "@/lib/tone";
import { cn } from "@/lib/utils";

interface Balao {
    autor: "cliente" | "ia";
    texto: string;
}

/** Desmonta "C: ..." / "IA: ..." em balões, juntando as linhas de continuação. */
function parseConversa(conversa: string): Balao[] {
    const baloes: Balao[] = [];
    for (const linha of conversa.split("\n")) {
        if (linha.startsWith("C: ")) {
            baloes.push({ autor: "cliente", texto: linha.slice(3) });
        } else if (linha.startsWith("IA: ")) {
            baloes.push({ autor: "ia", texto: linha.slice(4) });
        } else if (baloes.length > 0) {
            baloes[baloes.length - 1].texto += `\n${linha.trim()}`;
        }
    }
    return baloes;
}

interface ToneReferencePreviewProps {
    settings: ToneSettings;
}

export function ToneReferencePreview({ settings }: ToneReferencePreviewProps) {
    const baloes = useMemo(
        () => parseConversa(buildReferenceConversation(settings, "preview")),
        [settings],
    );

    return (
        <div className="space-y-2" data-tour="tom-preview">
            {baloes.map((b, i) => (
                <div
                    key={i}
                    className={cn("flex", b.autor === "ia" ? "justify-end" : "justify-start")}
                >
                    <div
                        className={cn(
                            "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-line",
                            b.autor === "ia"
                                ? "bg-primary/10 text-foreground rounded-br-sm"
                                : "bg-muted text-foreground rounded-bl-sm",
                        )}
                    >
                        {b.texto}
                    </div>
                </div>
            ))}
        </div>
    );
}
