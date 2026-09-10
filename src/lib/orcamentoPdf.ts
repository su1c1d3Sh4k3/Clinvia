/**
 * Orçamento em PDF (A4 retrato).
 *
 * O documento é montado como HTML com estilo INLINE e rasterizado pelo
 * html2pdf.js. Estilo inline porque o app tem tema escuro: qualquer classe do
 * Tailwind entraria no PDF com as cores do tema do usuário.
 *
 * Regra de negócio (decisão do user): o PDF é o documento que vai para a mão do
 * paciente, então lista SÓ os itens pendentes — o que ele já comprou ou recusou
 * não aparece.
 */

/** Faixa do cabeçalho na folha: 210mm de largura por 35mm de altura. */
export const HEADER_WIDTH_MM = 210;
export const HEADER_HEIGHT_MM = 35;
/** Tamanho recomendado do PNG (mesma proporção 6:1 da faixa, ~290 DPI). */
export const HEADER_RECOMMENDED_WIDTH = 2400;
export const HEADER_RECOMMENDED_HEIGHT = 400;
export const HEADER_MAX_BYTES = 2 * 1024 * 1024;

const BLUE = "#1668C1";
const DARK = "#3C4650";
const BODY = "#5B6670";
const MUTED = "#7A848E";
const LINE = "#E2E8EE";

export interface OrcamentoPdfBranding {
    headerUrl?: string | null;
    footerText?: string | null;
    companyName?: string | null;
    companyPhone?: string | null;
}

export interface OrcamentoPdfItem {
    /** Nome já composto ("Serviço - Aplicação"). */
    nome: string;
    valor: number;
}

export interface OrcamentoPdfData {
    id: string;
    criadoEm: string;
    validade?: string | null;
    indicacao?: string | null;
    notes?: string | null;
    clienteNome: string;
    clienteTelefone?: string | null;
    profissional?: string | null;
    profissionalCargo?: string | null;
    criadoPor?: string | null;
    itens: OrcamentoPdfItem[];
}

const brl = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

const dia = (d: string) =>
    new Date(d.includes("T") ? d : `${d}T00:00:00`).toLocaleDateString("pt-BR");

const esc = (v: unknown) =>
    String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

const nl2br = (v: string) => esc(v).replace(/\n/g, "<br>");

/**
 * Baixa a imagem e devolve data URL. O html2canvas desenha a imagem num
 * <canvas>; se ela vier de outra origem sem CORS o canvas fica "tainted" e o
 * PDF sai SEM o cabeçalho, sem erro nenhum. Embutir os bytes elimina o risco.
 */
async function toDataUrl(url: string): Promise<string | null> {
    try {
        const res = await fetch(url, { cache: "no-cache" });
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

/** Cabeçalho de texto usado enquanto a conta não sobe um PNG. */
function headerFallback(b: OrcamentoPdfBranding): string {
    const nome = b.companyName?.trim() || "Orçamento";
    const tel = b.companyPhone?.trim();
    return `
<div style="background:${BLUE};color:#fff;padding:9mm 16mm;height:${HEADER_HEIGHT_MM}mm;box-sizing:border-box">
  <div style="font-size:19px;font-weight:700;line-height:26px">${esc(nome)}</div>
  ${tel ? `<div style="font-size:12px;line-height:18px;opacity:.85">${esc(tel)}</div>` : ""}
</div>`;
}

function buildHtml(data: OrcamentoPdfData, branding: OrcamentoPdfBranding, headerData: string | null): string {
    const total = data.itens.reduce((acc, i) => acc + (Number(i.valor) || 0), 0);

    const header = headerData
        ? `<img src="${headerData}" alt="" style="display:block;width:${HEADER_WIDTH_MM}mm;height:${HEADER_HEIGHT_MM}mm;object-fit:contain;object-position:center">`
        : headerFallback(branding);

    const info = (label: string, value: string) => `
    <div style="margin-bottom:7px">
      <div style="font-size:9px;letter-spacing:.6px;text-transform:uppercase;color:${MUTED}">${esc(label)}</div>
      <div style="font-size:12px;color:${DARK};font-weight:600">${esc(value)}</div>
    </div>`;

    const linhas = data.itens
        .map(
            (i) => `
      <tr>
        <td style="padding:9px 0;border-bottom:1px solid ${LINE};font-size:12px;color:${BODY}">${esc(i.nome)}</td>
        <td style="padding:9px 0;border-bottom:1px solid ${LINE};font-size:12px;color:${DARK};font-weight:600;text-align:right;white-space:nowrap">${brl(i.valor)}</td>
      </tr>`,
        )
        .join("");

    const observacoes = [
        data.indicacao ? `<b style="color:${DARK}">Indicação:</b> ${esc(data.indicacao)}` : "",
        data.notes ? nl2br(data.notes) : "",
    ]
        .filter(Boolean)
        .join("<br>");

    return `
<div style="width:${HEADER_WIDTH_MM}mm;background:#fff;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:${BODY}">
  ${header}

  <div style="padding:11mm 16mm 0 16mm">
    <table style="width:100%;border-collapse:collapse;margin-bottom:9mm">
      <tr>
        <td style="vertical-align:top">
          <div style="font-size:23px;font-weight:700;color:${DARK};line-height:30px">Orçamento</div>
          <div style="font-size:11px;color:${MUTED}">Emitido em ${dia(data.criadoEm)}</div>
        </td>
        <td style="vertical-align:top;text-align:right">
          <div style="font-size:9px;letter-spacing:.6px;text-transform:uppercase;color:${MUTED}">Documento</div>
          <div style="font-size:12px;font-weight:600;color:${DARK}">#${esc(data.id.slice(0, 8).toUpperCase())}</div>
        </td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse;margin-bottom:8mm">
      <tr>
        <td style="vertical-align:top;width:50%;padding-right:8mm">
          ${info("Cliente", data.clienteNome || "—")}
          ${data.clienteTelefone ? info("Telefone", data.clienteTelefone) : ""}
        </td>
        <td style="vertical-align:top;width:50%">
          ${info("Profissional", data.profissional || "—")}
          ${data.profissionalCargo ? info("Especialidade", data.profissionalCargo) : ""}
          ${data.validade ? info("Válido até", dia(data.validade)) : ""}
        </td>
      </tr>
    </table>

    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr>
          <th style="text-align:left;padding-bottom:7px;border-bottom:2px solid ${BLUE};font-size:9px;letter-spacing:.6px;text-transform:uppercase;color:${MUTED};font-weight:600">Procedimento</th>
          <th style="text-align:right;padding-bottom:7px;border-bottom:2px solid ${BLUE};font-size:9px;letter-spacing:.6px;text-transform:uppercase;color:${MUTED};font-weight:600">Valor</th>
        </tr>
      </thead>
      <tbody>${linhas}</tbody>
      <tfoot>
        <tr>
          <td style="padding-top:11px;font-size:13px;font-weight:700;color:${DARK}">Total</td>
          <td style="padding-top:11px;font-size:17px;font-weight:700;color:${BLUE};text-align:right;white-space:nowrap">${brl(total)}</td>
        </tr>
      </tfoot>
    </table>

    ${observacoes
            ? `<div style="margin-top:9mm;padding:5mm 6mm;background:#F4F7FA;border-left:3px solid ${BLUE};font-size:11px;line-height:18px;color:${BODY}">${observacoes}</div>`
            : ""
        }

    ${branding.footerText?.trim()
            ? `<div style="margin-top:9mm;padding-top:5mm;border-top:1px solid ${LINE};font-size:10px;line-height:17px;color:${MUTED};white-space:pre-wrap">${nl2br(branding.footerText.trim())}</div>`
            : ""
        }

    <div style="margin-top:6mm;padding-bottom:12mm;font-size:9px;color:${MUTED}">
      ${data.criadoPor ? `Elaborado por ${esc(data.criadoPor)} · ` : ""}Documento gerado em ${new Date().toLocaleDateString("pt-BR")}
    </div>
  </div>
</div>`;
}

/** Nome do arquivo: Orcamento_Maria_Silva_10-09-2026.pdf */
function filename(data: OrcamentoPdfData): string {
    const nome = (data.clienteNome || "cliente")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40);
    return `Orcamento_${nome || "cliente"}_${dia(data.criadoEm).replace(/\//g, "-")}.pdf`;
}

export async function exportOrcamentoPdf(
    data: OrcamentoPdfData,
    branding: OrcamentoPdfBranding = {},
): Promise<void> {
    const headerData = branding.headerUrl ? await toDataUrl(branding.headerUrl) : null;

    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed;left:-10000px;top:0;background:#ffffff";
    holder.innerHTML = buildHtml(data, branding, headerData);
    document.body.appendChild(holder);

    try {
        const html2pdf = (await import("html2pdf.js")).default;
        await html2pdf()
            .set({
                margin: 0,
                filename: filename(data),
                image: { type: "jpeg" as const, quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
                jsPDF: { unit: "mm" as const, format: "a4" as const, orientation: "portrait" as const },
                pagebreak: { mode: ["avoid-all", "css", "legacy"] as const },
            })
            .from(holder.firstElementChild as HTMLElement)
            .save();
    } finally {
        holder.remove();
    }
}
