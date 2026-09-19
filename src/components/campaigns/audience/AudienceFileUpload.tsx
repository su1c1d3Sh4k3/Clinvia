import { useRef, useState } from "react";
import { XMLParser } from "fast-xml-parser";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { parseFile, ParsedSheet } from "@/lib/importParser";
import { autoMapColumns, FieldDef } from "@/lib/importMapper";
import { normalizePhone, normalizeName } from "@/lib/importTransformers";
import { AudienceSelection, AudienceEntry, slugVarKey } from "../audienceTypes";

const AUDIENCE_FIELDS: FieldDef[] = [
    { key: "push_name", label: "Nome", required: true, synonyms: ["nome", "name", "paciente", "cliente", "push_name", "nome_completo", "full_name"] },
    { key: "number", label: "WhatsApp", required: true, synonyms: ["whatsapp", "celular", "telefone", "phone", "tel", "mobile", "numero", "fone", "whats"] },
];

interface AudienceFileUploadProps {
    fileType: "csv" | "xml";
    value: AudienceSelection;
    onChange: (sel: AudienceSelection) => void;
}

async function parseXmlFile(file: File): Promise<ParsedSheet> {
    const text = await file.text();
    const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });
    const doc = parser.parse(text);

    // Encontra o primeiro array de objetos no documento (lista de registros)
    const findRows = (node: any): any[] | null => {
        if (Array.isArray(node)) {
            return node.length > 0 && typeof node[0] === "object" ? node : null;
        }
        if (node && typeof node === "object") {
            for (const key of Object.keys(node)) {
                const found = findRows(node[key]);
                if (found) return found;
            }
        }
        return null;
    };

    const rawRows = findRows(doc);
    if (!rawRows || rawRows.length === 0) {
        throw new Error("Nenhuma lista de registros encontrada no XML");
    }

    const headerSet = new Set<string>();
    const rows = rawRows.map((r) => {
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(r)) {
            if (typeof v === "object") continue;
            const key = k.replace(/^@_/, "");
            clean[key] = String(v ?? "").trim();
            headerSet.add(key);
        }
        return clean;
    });

    return { headers: [...headerSet], rows };
}

export function AudienceFileUpload({ fileType, value, onChange }: AudienceFileUploadProps) {
    const { data: ownerId } = useOwnerId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [parsed, setParsed] = useState<ParsedSheet | null>(null);
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [fileName, setFileName] = useState<string | null>(null);
    const [processing, setProcessing] = useState(false);
    const [summary, setSummary] = useState<{ valid: number; invalid: number } | null>(null);

    const accept = fileType === "csv" ? ".csv,.tsv,.xlsx,.xls" : ".xml";

    const handleFile = async (file: File) => {
        try {
            const sheet = fileType === "xml" ? await parseXmlFile(file) : await parseFile(file);
            if (sheet.rows.length === 0) throw new Error("Arquivo sem dados");
            setParsed(sheet);
            setFileName(file.name);
            setMapping(autoMapColumns(sheet.headers, AUDIENCE_FIELDS));
            setSummary(null);
            onChange({ entries: [], invalidRows: [], config: {} });
        } catch (err: any) {
            toast.error("Erro ao ler arquivo: " + err.message);
        }
    };

    const nameHeader = Object.keys(mapping).find((h) => mapping[h] === "push_name") || "";
    const numberHeader = Object.keys(mapping).find((h) => mapping[h] === "number") || "";

    const setFieldHeader = (fieldKey: string, header: string) => {
        setMapping((prev) => {
            const next: Record<string, string> = {};
            for (const [h, f] of Object.entries(prev)) {
                if (f !== fieldKey) next[h] = f;
            }
            if (header) next[header] = fieldKey;
            return next;
        });
        setSummary(null);
    };

    const processRows = async () => {
        if (!parsed || !ownerId || !numberHeader) return;
        setProcessing(true);
        try {
            const suffix8 = (n: string) => n.replace(/\D/g, "").slice(-8);

            // Normaliza + dedupe por telefone; guarda TODAS as colunas como variáveis
            const validByNumber = new Map<string, { push_name: string; number: string; vars: Record<string, string> }>();
            const invalidRows: Record<string, string>[] = [];
            for (const row of parsed.rows) {
                const number = normalizePhone(row[numberHeader] || "");
                const name = normalizeName(nameHeader ? row[nameHeader] || "" : "");
                if (!number || suffix8(number).length < 8) {
                    invalidRows.push(row);
                    continue;
                }
                if (!validByNumber.has(number)) {
                    const vars: Record<string, string> = { nome: name || "Cliente", telefone: number };
                    for (const h of parsed.headers) {
                        const key = slugVarKey(h);
                        if (key) vars[key] = String(row[h] ?? "").trim();
                    }
                    validByNumber.set(number, { push_name: name || "Cliente", number, vars });
                }
            }

            const numbers = [...validByNumber.keys()];
            const entries: AudienceEntry[] = [];

            if (numbers.length > 0) {
                // Match pelos ÚLTIMOS 8 DÍGITOS: carrega os contatos do dono
                // (mais recentes primeiro — em colisão de sufixo, vale o mais recente)
                const bySuffix = new Map<
                    string,
                    { id: string; push_name: string | null; edited: boolean | null }
                >();
                const PAGE = 1000;
                for (let page = 0; ; page++) {
                    const { data: batch, error } = await supabase
                        .from("contacts")
                        .select("id, number, push_name, edited")
                        .eq("user_id", ownerId)
                        .order("created_at", { ascending: false })
                        .range(page * PAGE, page * PAGE + PAGE - 1);
                    if (error) throw error;
                    for (const c of batch || []) {
                        const key = suffix8(c.number || "");
                        if (key.length === 8 && !bySuffix.has(key)) {
                            bySuffix.set(key, { id: c.id, push_name: c.push_name, edited: c.edited });
                        }
                    }
                    if (!batch || batch.length < PAGE) break;
                }

                // Existentes: só completa o nome de quem ainda não tem um definido.
                // USER RULE 2026-09-19: quem manda no nome do contato é o cliente —
                // planilha NUNCA sobrescreve nome já cadastrado (contacts.edited).
                const nameUpdates: { id: string; push_name: string }[] = [];
                for (const n of numbers) {
                    const match = bySuffix.get(suffix8(n));
                    if (!match) continue;
                    const fileName2 = validByNumber.get(n)!.push_name;
                    if (
                        fileName2 &&
                        fileName2 !== "Cliente" &&
                        fileName2 !== match.push_name &&
                        !match.edited
                    ) {
                        nameUpdates.push({ id: match.id, push_name: fileName2 });
                    }
                }
                // Não marca `edited`: o nome da planilha é só um preenchimento
                // provisório e o WhatsApp ainda pode corrigi-lo com o nome real
                for (const upd of nameUpdates) {
                    await supabase
                        .from("contacts")
                        .update({ push_name: upd.push_name, updated_at: new Date().toISOString() })
                        .eq("id", upd.id);
                }

                // USER RULE 2026-09-19: o upload NÃO cria contato. Número sem cadastro
                // viaja como entrada sem contactId e só vira contato quando a campanha
                // for criada (campaign-manage.materializeEntries) — planilha abandonada
                // no wizard não suja mais o cadastro.
                for (const n of numbers) {
                    const src = validByNumber.get(n)!;
                    const match = bySuffix.get(suffix8(n));
                    entries.push(
                        match
                            ? { contactId: match.id, vars: src.vars }
                            : { contactId: null, vars: src.vars, number: n, pushName: src.push_name }
                    );
                }
            }

            const varKeys = [...new Set(parsed.headers.map(slugVarKey).filter(Boolean))];
            setSummary({ valid: entries.length, invalid: invalidRows.length });
            onChange({
                entries,
                invalidRows,
                config: { file_name: fileName, total_rows: parsed.rows.length, var_keys: varKeys },
            });
            toast.success(`${entries.length} contatos prontos (${invalidRows.length} inválidos)`);
        } catch (err: any) {
            toast.error("Erro ao processar contatos: " + err.message);
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="space-y-3">
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = "";
                }}
            />
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 hover:bg-muted/40 transition-colors"
            >
                {fileName ? (
                    <>
                        <FileSpreadsheet className="w-6 h-6 text-primary" />
                        <span className="text-sm font-medium">{fileName}</span>
                        <span className="text-xs text-muted-foreground">
                            {parsed?.rows.length || 0} linhas — clique para trocar
                        </span>
                    </>
                ) : (
                    <>
                        <Upload className="w-6 h-6 text-muted-foreground" />
                        <span className="text-sm">
                            Enviar arquivo {fileType === "csv" ? "CSV/Excel" : "XML"}
                        </span>
                    </>
                )}
            </button>

            {parsed && (
                <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Coluna do Nome</p>
                            <Select value={nameHeader || "__none"} onValueChange={(v) => setFieldHeader("push_name", v === "__none" ? "" : v)}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Selecionar" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none">(nenhuma)</SelectItem>
                                    {parsed.headers.map((h) => (
                                        <SelectItem key={h} value={h}>{h}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground mb-1">Coluna do WhatsApp *</p>
                            <Select value={numberHeader || "__none"} onValueChange={(v) => setFieldHeader("number", v === "__none" ? "" : v)}>
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Selecionar" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none">(nenhuma)</SelectItem>
                                    {parsed.headers.map((h) => (
                                        <SelectItem key={h} value={h}>{h}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Button size="sm" onClick={processRows} disabled={!numberHeader || processing}>
                        {processing ? (
                            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Processando...</>
                        ) : (
                            "Validar e preparar contatos"
                        )}
                    </Button>
                </div>
            )}

            {summary && (
                <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        {summary.valid} válidos
                    </Badge>
                    {summary.invalid > 0 && (
                        <Badge variant="secondary" className="gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-500" />
                            {summary.invalid} inválidos (número incorreto)
                        </Badge>
                    )}
                </div>
            )}
            {value.entries.length > 0 && !summary && (
                <p className="text-xs text-muted-foreground">
                    {value.entries.length} contatos já selecionados
                </p>
            )}
        </div>
    );
}
