import { supabase } from "@/integrations/supabase/client";

/**
 * Cabeçalho de imagem nos templates da Meta.
 *
 * A imagem é FIXA por template: o cliente sobe uma vez e todo envio daquele
 * template reusa a mesma URL. Existem DOIS artefatos diferentes:
 *
 *   - handle  → obtido pela Resumable Upload API, só serve para a Meta APROVAR
 *               o template (vai em components[HEADER].example.header_handle).
 *   - URL     → link público no bucket `media`, obrigatório em TODO envio como
 *               parâmetro de header. Sem ele a Meta recusa com o erro #132000.
 */

export const HEADER_IMAGE_MIME = ["image/jpeg", "image/png"];
export const HEADER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export function validateHeaderImage(file: File): string | null {
    if (!HEADER_IMAGE_MIME.includes(file.type.toLowerCase())) {
        return "A imagem do cabeçalho precisa ser JPG ou PNG.";
    }
    if (file.size > HEADER_IMAGE_MAX_BYTES) {
        return "A imagem do cabeçalho precisa ter no máximo 5 MB.";
    }
    return null;
}

/** Sobe a imagem para o bucket público `media` e devolve a URL usada nos envios. */
export async function uploadHeaderImageToBucket(file: File, ownerId: string): Promise<string> {
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filePath = `template-headers/${ownerId}/${Date.now()}_${safeName}`;
    const { error } = await supabase.storage
        .from("media")
        .upload(filePath, file, { contentType: file.type });
    if (error) throw error;
    return supabase.storage.from("media").getPublicUrl(filePath).data.publicUrl;
}

/** Lê o arquivo como base64 puro (sem o prefixo `data:`) para mandar à edge function. */
export function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]+,/, ""));
        reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
        reader.readAsDataURL(file);
    });
}

type TemplateHeaderInfo = {
    header_format?: string | null;
    header_media_url?: string | null;
};

/**
 * Parâmetro de header exigido em todo envio de template com cabeçalho de imagem.
 * Devolve null quando o template não tem cabeçalho de imagem.
 */
export function buildHeaderImageParameter(tpl: TemplateHeaderInfo | null | undefined): any | null {
    if (!tpl) return null;
    if (String(tpl.header_format || "").toUpperCase() !== "IMAGE") return null;
    if (!tpl.header_media_url) return null;
    return {
        type: "header",
        parameters: [{ type: "image", image: { link: tpl.header_media_url } }],
    };
}

/**
 * Monta a lista de components do envio já com o cabeçalho de imagem na frente
 * (a Meta exige header antes de body).
 */
export function withHeaderImage(
    tpl: TemplateHeaderInfo | null | undefined,
    components: any[] | undefined,
): any[] | undefined {
    const header = buildHeaderImageParameter(tpl);
    if (!header) return components;
    return [header, ...(components || [])];
}
