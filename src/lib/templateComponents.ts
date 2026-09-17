import { supabase } from "@/integrations/supabase/client";

// Fonte única do que é FIXO no template da Meta: mídia de cabeçalho, localização
// e código do botão "Copiar código". Tudo isso é escolhido UMA vez na criação do
// template e reenviado em TODO disparo — a Meta exige os parâmetros mesmo quando
// o valor nunca muda (senão erro #132000).

export type HeaderMediaFormat = "IMAGE" | "VIDEO" | "DOCUMENT";

export const HEADER_MEDIA_RULES: Record<HeaderMediaFormat, {
    mimes: string[];
    maxBytes: number;
    accept: string;
    label: string;
}> = {
    IMAGE: {
        mimes: ["image/jpeg", "image/png"],
        maxBytes: 5 * 1024 * 1024,
        accept: "image/jpeg,image/png",
        label: "JPG ou PNG de até 5 MB",
    },
    VIDEO: {
        mimes: ["video/mp4"],
        maxBytes: 16 * 1024 * 1024,
        accept: "video/mp4",
        label: "MP4 de até 16 MB",
    },
    DOCUMENT: {
        mimes: ["application/pdf"],
        maxBytes: 100 * 1024 * 1024,
        accept: "application/pdf",
        label: "PDF de até 100 MB",
    },
};

export function validateHeaderMedia(file: File, format: HeaderMediaFormat): string | null {
    const rule = HEADER_MEDIA_RULES[format];
    if (!rule) return "Formato de cabeçalho inválido.";
    if (!rule.mimes.includes(file.type)) return `Envie um arquivo ${rule.label}.`;
    if (file.size > rule.maxBytes) return `Arquivo muito grande. Limite: ${rule.label}.`;
    return null;
}

export async function uploadHeaderMediaToBucket(file: File, ownerId: string): Promise<string> {
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filePath = `template-headers/${ownerId}/${Date.now()}_${safeName}`;
    const { error } = await supabase.storage
        .from("media")
        .upload(filePath, file, { contentType: file.type });
    if (error) throw error;
    return supabase.storage.from("media").getPublicUrl(filePath).data.publicUrl;
}

export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || "");
            resolve(result.slice(result.indexOf(",") + 1));
        };
        reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
        reader.readAsDataURL(file);
    });
}

export type TemplateFixedInfo = {
    header_format?: string | null;
    header_media_url?: string | null;
    header_media_name?: string | null;
    header_location?: { latitude?: any; longitude?: any; name?: string; address?: string } | null;
    button_coupon_code?: string | null;
    components?: any;
};

export function buildHeaderParameter(tpl: TemplateFixedInfo | null | undefined): any | null {
    if (!tpl) return null;
    const format = String(tpl.header_format || "").toUpperCase();
    if (format === "IMAGE" || format === "VIDEO" || format === "DOCUMENT") {
        if (!tpl.header_media_url) return null;
        const key = format.toLowerCase();
        const media: Record<string, any> = { link: tpl.header_media_url };
        if (format === "DOCUMENT" && tpl.header_media_name) media.filename = tpl.header_media_name;
        return { type: "header", parameters: [{ type: key, [key]: media }] };
    }
    if (format === "LOCATION") {
        const loc = tpl.header_location;
        if (!loc || loc.latitude === undefined || loc.longitude === undefined) return null;
        return {
            type: "header",
            parameters: [{
                type: "location",
                location: {
                    latitude: String(loc.latitude),
                    longitude: String(loc.longitude),
                    name: loc.name || "",
                    address: loc.address || "",
                },
            }],
        };
    }
    return null;
}

function findCopyCodeIndex(components: any): number {
    const list = Array.isArray(components) ? components : [];
    const buttonsComp = list.find((c: any) => String(c?.type || "").toUpperCase() === "BUTTONS");
    const buttons = Array.isArray(buttonsComp?.buttons) ? buttonsComp.buttons : [];
    return buttons.findIndex((b: any) => String(b?.type || "").toUpperCase() === "COPY_CODE");
}

export function buildButtonParameters(tpl: TemplateFixedInfo | null | undefined): any[] {
    if (!tpl?.button_coupon_code) return [];
    const index = findCopyCodeIndex(tpl.components);
    if (index < 0) return [];
    return [{
        type: "button",
        sub_type: "copy_code",
        index: String(index),
        parameters: [{ type: "coupon_code", coupon_code: tpl.button_coupon_code }],
    }];
}

/** Anexa ao payload de envio tudo que é fixo no template (cabeçalho + botões). */
export function withTemplateParams(
    tpl: TemplateFixedInfo | null | undefined,
    components: any[] | undefined,
): any[] | undefined {
    const header = buildHeaderParameter(tpl);
    const buttons = buildButtonParameters(tpl);
    if (!header && buttons.length === 0) return components;
    return [...(header ? [header] : []), ...(components || []), ...buttons];
}
