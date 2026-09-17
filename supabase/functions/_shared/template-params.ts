// Gêmeo Deno de src/lib/templateComponents.ts — MANTER EM SINCRONIA.
//
// Cabeçalho de mídia/localização e botão "Copiar código" são FIXOS no template,
// mas a Meta exige os parâmetros em TODO disparo (senão erro #132000).

export type TemplateFixedInfo = {
    header_format?: string | null;
    header_media_url?: string | null;
    header_media_name?: string | null;
    header_location?: { latitude?: unknown; longitude?: unknown; name?: string; address?: string } | null;
    button_coupon_code?: string | null;
    components?: unknown;
};

export function buildHeaderParameter(tpl: TemplateFixedInfo | null | undefined): any | null {
    if (!tpl) return null;
    const format = String(tpl.header_format || "").toUpperCase();
    if (format === "IMAGE" || format === "VIDEO" || format === "DOCUMENT") {
        if (!tpl.header_media_url) return null;
        const key = format.toLowerCase();
        const media: Record<string, unknown> = { link: tpl.header_media_url };
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

function findCopyCodeIndex(components: unknown): number {
    const list = Array.isArray(components) ? components : [];
    const buttonsComp = list.find((c: any) => String(c?.type || "").toUpperCase() === "BUTTONS") as any;
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
