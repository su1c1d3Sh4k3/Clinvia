import { toast } from "sonner";

/**
 * Fonte única de tipos de arquivo e download de anexos do chat.
 *
 * Por que o download precisa de Blob: o atributo `download` de um <a> é
 * IGNORADO quando a URL é cross-origin — e o storage do Supabase está em
 * outro domínio. O navegador então NAVEGA até o arquivo e salva com o nome
 * (e a extensão) que o servidor deduzir do Content-Type. Foi assim que um
 * .xml foi salvo como ".excel". Baixando o conteúdo e gerando uma URL
 * `blob:` (same-origin) o `download` volta a valer e o arquivo é salvo
 * exatamente com o nome/extensão que o remetente enviou.
 */

/** Mimetype -> extensão. Usado quando o nome do arquivo veio sem extensão. */
const MIME_TO_EXT: Record<string, string> = {
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-powerpoint": "ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/rtf": "rtf",
    "application/vnd.oasis.opendocument.text": "odt",
    "application/vnd.oasis.opendocument.spreadsheet": "ods",
    "text/plain": "txt",
    "text/markdown": "md",
    "text/csv": "csv",
    "text/html": "html",
    "text/xml": "xml",
    "application/xml": "xml",
    "application/json": "json",
    "application/zip": "zip",
    "application/x-rar-compressed": "rar",
    "application/vnd.rar": "rar",
    "application/x-7z-compressed": "7z",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/heic": "heic",
    "audio/mpeg": "mp3",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/webm": "weba",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "video/3gpp": "3gp",
};

/** Ícone e rótulo por extensão. Extensão desconhecida cai no `default.png`. */
const FILE_CONFIG: Record<string, { iconUrl: string; label: string }> = {
    pdf: { iconUrl: "/assets/file-icons/pdf.png", label: "PDF" },
    doc: { iconUrl: "/assets/file-icons/doc.png", label: "Word" },
    docx: { iconUrl: "/assets/file-icons/doc.png", label: "Word" },
    odt: { iconUrl: "/assets/file-icons/doc.png", label: "Documento" },
    rtf: { iconUrl: "/assets/file-icons/doc.png", label: "Documento" },
    xls: { iconUrl: "/assets/file-icons/xls.png", label: "Excel" },
    xlsx: { iconUrl: "/assets/file-icons/xls.png", label: "Excel" },
    ods: { iconUrl: "/assets/file-icons/xls.png", label: "Planilha" },
    csv: { iconUrl: "/assets/file-icons/xls.png", label: "CSV" },
    ppt: { iconUrl: "/assets/file-icons/ppt.png", label: "PowerPoint" },
    pptx: { iconUrl: "/assets/file-icons/ppt.png", label: "PowerPoint" },
    zip: { iconUrl: "/assets/file-icons/zip.png", label: "ZIP" },
    rar: { iconUrl: "/assets/file-icons/zip.png", label: "RAR" },
    "7z": { iconUrl: "/assets/file-icons/zip.png", label: "7Z" },
    txt: { iconUrl: "/assets/file-icons/txt.png", label: "Texto" },
    md: { iconUrl: "/assets/file-icons/txt.png", label: "Markdown" },
    xml: { iconUrl: "/assets/file-icons/txt.png", label: "XML" },
    json: { iconUrl: "/assets/file-icons/txt.png", label: "JSON" },
    html: { iconUrl: "/assets/file-icons/txt.png", label: "HTML" },
    jpg: { iconUrl: "/assets/file-icons/jpg.png", label: "JPG" },
    jpeg: { iconUrl: "/assets/file-icons/jpg.png", label: "JPEG" },
    png: { iconUrl: "/assets/file-icons/png.png", label: "PNG" },
    gif: { iconUrl: "/assets/file-icons/gif.png", label: "GIF" },
    webp: { iconUrl: "/assets/file-icons/png.png", label: "WEBP" },
    svg: { iconUrl: "/assets/file-icons/png.png", label: "SVG" },
    heic: { iconUrl: "/assets/file-icons/jpg.png", label: "HEIC" },
    mp3: { iconUrl: "/assets/file-icons/mp3.png", label: "MP3" },
    m4a: { iconUrl: "/assets/file-icons/mp3.png", label: "M4A" },
    ogg: { iconUrl: "/assets/file-icons/mp3.png", label: "OGG" },
    wav: { iconUrl: "/assets/file-icons/mp3.png", label: "WAV" },
    mpg: { iconUrl: "/assets/file-icons/mpg.png", label: "MPG" },
    mpeg: { iconUrl: "/assets/file-icons/mpg.png", label: "MPEG" },
    mp4: { iconUrl: "/assets/file-icons/mpg.png", label: "MP4" },
    mov: { iconUrl: "/assets/file-icons/mpg.png", label: "MOV" },
    webm: { iconUrl: "/assets/file-icons/mpg.png", label: "WEBM" },
    "3gp": { iconUrl: "/assets/file-icons/mpg.png", label: "3GP" },
};

const DEFAULT_CONFIG = { iconUrl: "/assets/file-icons/default.png", label: "Arquivo" };

/**
 * Extensão real do arquivo. Sem ponto = SEM extensão (o velho
 * `nome.split('.').pop()` devolvia o nome inteiro em "documento").
 */
export function getFileExtension(filename?: string | null): string {
    if (!filename) return "";
    const base = filename.split(/[\\/]/).pop()?.trim() ?? "";
    const dot = base.lastIndexOf(".");
    if (dot <= 0) return "";
    const ext = base.slice(dot + 1).toLowerCase();
    return /^[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

function extFromMimetype(mimetype?: string | null): string {
    if (!mimetype) return "";
    return MIME_TO_EXT[mimetype.split(";")[0].trim().toLowerCase()] || "";
}

/** Extensão do arquivo: nome primeiro, mimetype como plano B. */
export function resolveFileExtension(filename?: string | null, mimetype?: string | null): string {
    return getFileExtension(filename) || extFromMimetype(mimetype);
}

/** Ícone + rótulo do arquivo (fallback genérico para tipos desconhecidos). */
export function getFileConfig(filename?: string | null, mimetype?: string | null) {
    return FILE_CONFIG[resolveFileExtension(filename, mimetype)] || DEFAULT_CONFIG;
}

const EXT_TO_MIME: Record<string, string> = Object.entries(MIME_TO_EXT).reduce((acc, [mime, ext]) => {
    if (!acc[ext]) acc[ext] = mime;
    return acc;
}, {} as Record<string, string>);

/**
 * Content-Type do upload. A extensão do arquivo manda, porque o navegador às
 * vezes rotula errado (no Windows um .xml chega como application/vnd.ms-excel
 * quando o Excel é o programa padrão) e o storage passa a servir o arquivo
 * como planilha.
 */
export function contentTypeForUpload(file: File): string {
    return EXT_TO_MIME[getFileExtension(file.name)] || file.type || "application/octet-stream";
}

/** Nome com que o arquivo será salvo — completa a extensão pelo mimetype se faltar. */
export function resolveDownloadName(filename?: string | null, mimetype?: string | null): string {
    const name = (filename || "").trim() || "arquivo";
    if (getFileExtension(name)) return name;
    const ext = extFromMimetype(mimetype);
    return ext ? `${name}.${ext}` : name;
}

/** Baixa o anexo preservando nome e extensão originais. */
export async function downloadFile(url: string, filename?: string | null, mimetype?: string | null) {
    const name = resolveDownloadName(filename, mimetype);
    let blobUrl: string | null = null;
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
    } catch (error) {
        console.error("Download error:", error);
        // Sem o Blob o navegador renomeia o arquivo — melhor abrir numa aba
        // e deixar o usuário salvar do que entregar a extensão errada.
        window.open(url, "_blank", "noopener");
        toast.error("Não foi possível baixar o arquivo. Ele foi aberto em uma nova aba.");
    } finally {
        if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl!), 10000);
    }
}
