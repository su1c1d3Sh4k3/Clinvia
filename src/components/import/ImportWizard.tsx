import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Upload, ArrowRight, ArrowLeft, Check, AlertTriangle, XCircle, Download, Loader2, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseFile, ParsedSheet } from "@/lib/importParser";
import { autoMapColumns, FieldDef, CONTACT_FIELDS, SERVICE_FIELDS } from "@/lib/importMapper";
import { validateContactRow, validateServiceRow, ValidatedRow } from "@/lib/importTransformers";
import { importContacts, ImportResult as ContactImportResult } from "@/lib/importContacts";
import { importServices, ImportResult as ServiceImportResult } from "@/lib/importServices";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type ImportType = "contacts" | "services";
type Step = "upload" | "mapping" | "preview" | "result";

interface ImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: ImportType;
}

const STEP_LABELS: Record<Step, string> = {
  upload: "Upload",
  mapping: "Mapeamento",
  preview: "Validação",
  result: "Resultado",
};

const STEPS: Step[] = ["upload", "mapping", "preview", "result"];

export function ImportWizard({ open, onOpenChange, type }: ImportWizardProps) {
  const { data: ownerId } = useOwnerId();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [validated, setValidated] = useState<ValidatedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ContactImportResult | ServiceImportResult | null>(null);

  const fields: FieldDef[] = type === "contacts" ? CONTACT_FIELDS : SERVICE_FIELDS;
  const title = type === "contacts" ? "Importar Contatos" : "Importar Serviços";

  const reset = () => {
    setStep("upload");
    setFile(null);
    setParsed(null);
    setMapping({});
    setValidated([]);
    setResult(null);
    setProgress(0);
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  };

  // ─── Step 1: Upload ──────────────────────────────────────────────

  const handleFileDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) await processFile(f);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) await processFile(f);
    e.target.value = "";
  };

  const processFile = async (f: File) => {
    try {
      setFile(f);
      const data = await parseFile(f);
      setParsed(data);
      const autoMap = autoMapColumns(data.headers, fields);
      setMapping(autoMap);
      setStep("mapping");
    } catch (err: any) {
      toast.error(err.message);
      setFile(null);
    }
  };

  const downloadTemplate = () => {
    const headers = fields.map((f) => f.label);
    const example = fields.map((f) => {
      if (f.key === "push_name") return "Ana Silva";
      if (f.key === "number") return "(11) 99999-9999";
      if (f.key === "email") return "ana@email.com";
      if (f.key === "cpf") return "123.456.789-00";
      if (f.key === "category") return "Injetáveis";
      if (f.key === "service") return "Toxina Botulínica";
      if (f.key === "application") return "Botox Face Feminino";
      if (f.key === "price") return "1290,00";
      if (f.key === "duration") return "30";
      return "";
    });
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, `modelo_${type}.xlsx`);
  };

  // ─── Step 2: Mapping ─────────────────────────────────────────────

  const updateMapping = (header: string, fieldKey: string) => {
    setMapping((prev) => {
      const next = { ...prev };
      // Remove any other header mapped to this field
      if (fieldKey) {
        for (const [h, f] of Object.entries(next)) {
          if (f === fieldKey && h !== header) delete next[h];
        }
        next[header] = fieldKey;
      } else {
        delete next[header];
      }
      return next;
    });
  };

  const requiredFieldsMapped = fields
    .filter((f) => f.required)
    .every((f) => Object.values(mapping).includes(f.key));

  const goToPreview = () => {
    if (!parsed) return;
    const validator = type === "contacts" ? validateContactRow : validateServiceRow;
    const rows = parsed.rows.map((row) => validator(row, mapping));
    setValidated(rows);
    setStep("preview");
  };

  // ─── Step 3: Preview ─────────────────────────────────────────────

  const validCount = validated.filter((r) => r.status === "valid").length;
  const warningCount = validated.filter((r) => r.status === "warning").length;
  const errorCount = validated.filter((r) => r.status === "error").length;
  const importableRows = validated.filter((r) => r.status !== "error");

  const startImport = async () => {
    if (!ownerId || importableRows.length === 0) return;
    setImporting(true);
    setProgress(0);

    try {
      const onProgress = (current: number, total: number) => {
        setProgress(Math.round((current / total) * 100));
      };

      let res;
      if (type === "contacts") {
        res = await importContacts(importableRows, ownerId, onProgress);
        queryClient.invalidateQueries({ queryKey: ["contacts"] });
      } else {
        res = await importServices(importableRows, ownerId, onProgress);
        queryClient.invalidateQueries({ queryKey: ["services-categories"] });
        queryClient.invalidateQueries({ queryKey: ["services-client-active"] });
      }
      setResult(res);
      setStep("result");
    } catch (err: any) {
      toast.error("Erro na importação: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────

  const stepIndex = STEPS.indexOf(step);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-1 px-1">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1 flex-1">
              <div className={cn(
                "flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold shrink-0",
                i < stepIndex ? "bg-primary text-primary-foreground" :
                i === stepIndex ? "bg-primary text-primary-foreground" :
                "bg-muted text-muted-foreground"
              )}>
                {i < stepIndex ? <Check className="w-3 h-3" /> : i + 1}
              </div>
              <span className={cn("text-[11px] truncate", i === stepIndex ? "font-semibold" : "text-muted-foreground")}>
                {STEP_LABELS[s]}
              </span>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border mx-1" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-2">

          {/* ── STEP 1: Upload ── */}
          {step === "upload" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Exporte os dados do seu sistema atual e faça o upload aqui. Aceitamos arquivos <strong>.xlsx</strong>, <strong>.xls</strong> e <strong>.csv</strong>.
              </p>

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                className="border-2 border-dashed rounded-lg p-10 text-center hover:border-primary/50 hover:bg-accent/30 transition-colors cursor-pointer"
                onClick={() => document.getElementById("import-file-input")?.click()}
              >
                <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">Arraste seu arquivo aqui</p>
                <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar</p>
                <input id="import-file-input" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect} />
              </div>

              <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
                <Download className="w-4 h-4" />
                Baixar modelo de exemplo (.xlsx)
              </Button>
            </div>
          )}

          {/* ── STEP 2: Mapping ── */}
          {step === "mapping" && parsed && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Associe cada coluna da planilha ao campo correspondente. Campos com <Badge variant="outline" className="text-[9px] ml-1">auto</Badge> foram detectados automaticamente.
                </p>
                <Badge variant="secondary" className="text-xs shrink-0">{parsed.rows.length} linhas</Badge>
              </div>

              <div className="space-y-2">
                {parsed.headers.map((header) => {
                  const mappedField = mapping[header] || "";
                  const isAuto = !!mappedField;
                  const sampleValues = parsed.rows.slice(0, 3).map((r) => r[header]).filter(Boolean);

                  return (
                    <div key={header} className="flex items-center gap-3 p-2.5 border rounded-md bg-background">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium truncate">{header}</span>
                          {isAuto && <Badge variant="outline" className="text-[8px] px-1 py-0">auto</Badge>}
                        </div>
                        {sampleValues.length > 0 && (
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                            ex: {sampleValues.join(", ")}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      <select
                        className="h-8 w-40 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                        value={mappedField}
                        onChange={(e) => updateMapping(header, e.target.value)}
                      >
                        <option value="">Ignorar</option>
                        {fields.map((f) => (
                          <option key={f.key} value={f.key} disabled={Object.values(mapping).includes(f.key) && mapping[header] !== f.key}>
                            {f.label} {f.required ? "*" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {!requiredFieldsMapped && (
                <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Campos obrigatórios (*) precisam ser mapeados para continuar.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Preview ── */}
          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 flex-wrap">
                <Badge className="gap-1 bg-green-100 text-green-700 border-green-200">
                  <Check className="w-3 h-3" /> {validCount} válidos
                </Badge>
                {warningCount > 0 && (
                  <Badge className="gap-1 bg-amber-100 text-amber-700 border-amber-200">
                    <AlertTriangle className="w-3 h-3" /> {warningCount} avisos
                  </Badge>
                )}
                {errorCount > 0 && (
                  <Badge className="gap-1 bg-red-100 text-red-700 border-red-200">
                    <XCircle className="w-3 h-3" /> {errorCount} erros
                  </Badge>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Linhas com <span className="text-red-600 font-medium">erros</span> não serão importadas.
                Linhas com <span className="text-amber-600 font-medium">avisos</span> serão importadas com dados parciais.
              </p>

              {/* Table preview */}
              <div className="border rounded-md overflow-x-auto max-h-[300px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium w-10">#</th>
                      {fields.filter((f) => Object.values(mapping).includes(f.key)).map((f) => (
                        <th key={f.key} className="px-2 py-1.5 text-left font-medium whitespace-nowrap">{f.label}</th>
                      ))}
                      <th className="px-2 py-1.5 text-left font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validated.slice(0, 100).map((row, i) => (
                      <tr key={i} className={cn(
                        "border-t",
                        row.status === "error" && "bg-red-50 dark:bg-red-950/20",
                        row.status === "warning" && "bg-amber-50 dark:bg-amber-950/20"
                      )}>
                        <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                        {fields.filter((f) => Object.values(mapping).includes(f.key)).map((f) => (
                          <td key={f.key} className="px-2 py-1 truncate max-w-[150px]">
                            {String(row.data[f.key] ?? "—")}
                          </td>
                        ))}
                        <td className="px-2 py-1">
                          {row.status === "valid" && <Check className="w-3.5 h-3.5 text-green-600" />}
                          {row.status === "warning" && (
                            <span className="flex items-center gap-1 text-amber-600" title={row.errors.join(", ")}>
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </span>
                          )}
                          {row.status === "error" && (
                            <span className="flex items-center gap-1 text-red-600" title={row.errors.join(", ")}>
                              <XCircle className="w-3.5 h-3.5" />
                              <span className="text-[10px] truncate max-w-[100px]">{row.errors[0]}</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {validated.length > 100 && (
                  <p className="text-center text-[10px] text-muted-foreground py-2">
                    Mostrando 100 de {validated.length} linhas
                  </p>
                )}
              </div>

              {importing && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Importando... {progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4: Result ── */}
          {step === "result" && result && (
            <div className="space-y-4 text-center py-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold">Importação concluída!</h3>

              <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                  <p className="text-2xl font-bold text-green-600">{result.imported}</p>
                  <p className="text-[10px] text-muted-foreground">Importados</p>
                </div>
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                  <p className="text-2xl font-bold text-blue-600">{result.updated}</p>
                  <p className="text-[10px] text-muted-foreground">Atualizados</p>
                </div>
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20">
                  <p className="text-2xl font-bold text-red-600">{result.skipped}</p>
                  <p className="text-[10px] text-muted-foreground">Ignorados</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="text-left max-w-sm mx-auto">
                  <p className="text-xs font-medium mb-1">Erros:</p>
                  <div className="max-h-[100px] overflow-y-auto space-y-1">
                    {result.errors.map((err, i) => (
                      <p key={i} className="text-[10px] text-red-600">{err}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between pt-3 border-t">
          <div>
            {step !== "upload" && step !== "result" && (
              <Button variant="ghost" size="sm" onClick={() => setStep(STEPS[stepIndex - 1])} disabled={importing}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
              </Button>
            )}
          </div>
          <div>
            {step === "mapping" && (
              <Button size="sm" onClick={goToPreview} disabled={!requiredFieldsMapped}>
                Validar <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
            {step === "preview" && (
              <Button size="sm" onClick={startImport} disabled={importing || importableRows.length === 0}>
                {importing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                Importar {importableRows.length} {type === "contacts" ? "contatos" : "serviços"}
              </Button>
            )}
            {step === "result" && (
              <Button size="sm" onClick={() => handleClose(false)}>
                Fechar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
