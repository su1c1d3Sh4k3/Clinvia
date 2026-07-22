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
import { AudienceSelection } from "../audienceTypes";

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
            onChange({ contactIds: [], invalidRows: [], config: {} });
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
            // Normaliza + dedupe por telefone
            const validByNumber = new Map<string, { push_name: string; number: string }>();
            const invalidRows: Record<string, string>[] = [];
            for (const row of parsed.rows) {
                const number = normalizePhone(row[numberHeader] || "");
                const name = normalizeName(nameHeader ? row[nameHeader] || "" : "");
                if (!number) {
                    invalidRows.push(row);
                    continue;
                }
                if (!validByNumber.has(number)) {
                    validByNumber.set(number, { push_name: name || "Cliente", number });
                }
            }

            const numbers = [...validByNumber.keys()];
            const contactIds: string[] = [];

            if (numbers.length > 0) {
                // Busca existentes
                const existingMap = new Map<string, string>();
                for (let i = 0; i < numbers.length; i += 200) {
                    const chunk = numbers.slice(i, i + 200);
                    const { data: existing } = await supabase
                        .from("contacts")
                        .select("id, number")
                        .eq("user_id", ownerId)
                        .in("number", chunk);
                    for (const c of existing || []) existingMap.set(c.number, c.id);
                }

                // Cria os que faltam
                const toInsert = numbers
                    .filter((n) => !existingMap.has(n))
                    .map((n) => ({
                        user_id: ownerId,
                        number: n,
                        push_name: validByNumber.get(n)!.push_name,
                        phone: n.replace(/@.*$/, ""),
                        channel: "whatsapp",
                        is_lead: true,
                    }));
                for (let i = 0; i < toInsert.length; i += 100) {
                    const chunk = toInsert.slice(i, i + 100);
                    const { data: inserted, error } = await supabase
                        .from("contacts")
                        .insert(chunk as any)
                        .select("id, number");
                    if (error) throw error;
                    for (const c of inserted || []) existingMap.set(c.number, c.id);
                }

                for (const n of numbers) {
                    const id = existingMap.get(n);
                    if (id) contactIds.push(id);
                }
            }

            setSummary({ valid: contactIds.length, invalid: invalidRows.length });
            onChange({
                contactIds,
                invalidRows,
                config: { file_name: fileName, total_rows: parsed.rows.length },
            });
            toast.success(`${contactIds.length} contatos prontos (${invalidRows.length} inválidos)`);
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
            {value.contactIds.length > 0 && !summary && (
                <p className="text-xs text-muted-foreground">
                    {value.contactIds.length} contatos já selecionados
                </p>
            )}
        </div>
    );
}
