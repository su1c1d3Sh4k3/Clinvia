import { FileText, MapPin } from "lucide-react";
import type { TemplateFixedInfo } from "@/lib/templateComponents";

// Preview do cabeçalho FIXO do template (mídia ou localização gravadas no cadastro).
// Usado no seletor do chat, no envio avulso e na revisão da campanha.
export function TemplateHeaderPreview({ tpl, className }: { tpl: TemplateFixedInfo | null | undefined; className?: string }) {
    const format = String(tpl?.header_format || "").toUpperCase();
    const url = tpl?.header_media_url || "";
    const wrapper = className || "mb-2";

    if (format === "LOCATION") {
        const loc = tpl?.header_location;
        if (!loc) return null;
        return (
            <div className={`flex items-start gap-2 rounded bg-black/5 dark:bg-white/10 p-2 text-xs ${wrapper}`}>
                <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="min-w-0">
                    {loc.name && <p className="font-medium truncate">{loc.name}</p>}
                    {loc.address && <p className="text-muted-foreground truncate">{loc.address}</p>}
                </div>
            </div>
        );
    }

    if (!url) return null;

    if (format === "IMAGE") {
        return <img src={url} alt="Cabeçalho do template" className={`rounded max-h-40 w-full object-cover ${wrapper}`} />;
    }
    if (format === "VIDEO") {
        return <video src={url} controls className={`rounded max-h-40 w-full ${wrapper}`} />;
    }
    if (format === "DOCUMENT") {
        return (
            <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className={`flex items-center gap-2 rounded bg-black/5 dark:bg-white/10 p-2 text-xs underline ${wrapper}`}
            >
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate">{tpl?.header_media_name || "Documento anexado"}</span>
            </a>
        );
    }
    return null;
}
