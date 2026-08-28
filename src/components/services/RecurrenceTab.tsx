import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Pencil, Plus, RotateCcw } from "lucide-react";
import {
  RECURRENCE_VARIABLES,
  findUnknownRecurrenceVariables,
  insertRecurrenceVariable,
  renderRecurrencePreview,
} from "@/lib/recurrenceTemplate";
import {
  RecurrenceDefaults,
  useAccountRecurrenceDefaults,
  useHasMetaInstance,
} from "@/hooks/useRecurrenceDefaults";

export interface RecurrenceData {
  msg_recurrence_1: string;
  msg_recurrence_2: string;
  msg_recurrence_3: string;
  time_recurrence_1: number | null;
  time_recurrence_2: number | null;
  time_recurrence_3: number | null;
  recurrence_discount_pct_1: number | null;
  recurrence_discount_pct_2: number | null;
  recurrence_discount_pct_3: number | null;
}

export const defaultRecurrenceData: RecurrenceData = {
  msg_recurrence_1: "",
  msg_recurrence_2: "",
  msg_recurrence_3: "",
  time_recurrence_1: null,
  time_recurrence_2: null,
  time_recurrence_3: null,
  recurrence_discount_pct_1: null,
  recurrence_discount_pct_2: null,
  recurrence_discount_pct_3: null,
};

const MSG_LABELS: Record<1 | 2 | 3, { title: string; hint: string }> = {
  1: { title: "Recorrência 1 — Prévia", hint: "Enviada antes do vencimento do procedimento." },
  2: { title: "Recorrência 2 — Vencimento", hint: "Enviada quando o efeito está vencendo." },
  3: { title: "Recorrência 3 — Pós-vencimento", hint: "Enviada depois que o efeito passou." },
};

interface RecurrenceTabProps {
  data: RecurrenceData;
  onChange: (data: RecurrenceData) => void;
}

interface RecurrenceBlockProps {
  index: 1 | 2 | 3;
  message: string;
  accountDefault: string;
  editing: boolean;
  time: number | null;
  discount: number | null;
  timeHint?: string;
  timePlaceholder: string;
  onRequestEdit: () => void;
  onBackToDefault: () => void;
  onMessageChange: (value: string) => void;
  onTimeChange: (value: number | null) => void;
  onDiscountChange: (value: number | null) => void;
}

const RecurrenceBlock = ({
  index,
  message,
  accountDefault,
  editing,
  time,
  discount,
  timeHint,
  timePlaceholder,
  onRequestEdit,
  onBackToDefault,
  onMessageChange,
  onTimeChange,
  onDiscountChange,
}: RecurrenceBlockProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const unknownVars = findUnknownRecurrenceVariables(message);
  const preview = message.trim() ? renderRecurrencePreview(message) : "";

  const insertVariable = (key: string) => {
    const el = textareaRef.current;
    const cursor = el ? el.selectionStart ?? message.length : message.length;
    const result = insertRecurrenceVariable(message, cursor, key);
    onMessageChange(result.text);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(result.cursor, result.cursor);
      }
    });
  };

  return (
    <div className="space-y-3 p-4 border rounded-md">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-medium">{MSG_LABELS[index].title}</h4>
        {editing ? (
          <Badge variant="outline" className="text-[10px]">Personalizado deste serviço</Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">Padrão da conta</Badge>
        )}
        <span className="text-[11px] text-muted-foreground">{MSG_LABELS[index].hint}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_160px] gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Mensagem (formato template)</Label>

          {!editing ? (
            <>
              <p className="text-sm whitespace-pre-wrap text-muted-foreground rounded-md border bg-muted/20 p-3">
                {accountDefault}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={onRequestEdit}
              >
                <Pencil className="w-3 h-3 mr-1" /> Editar só para este serviço
              </Button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {RECURRENCE_VARIABLES.map((v) => (
                  <Badge
                    key={v.key}
                    variant="secondary"
                    role="button"
                    tabIndex={0}
                    className="cursor-pointer select-none hover:bg-primary/15 text-[11px] font-normal"
                    onClick={() => insertVariable(v.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        insertVariable(v.key);
                      }
                    }}
                  >
                    <Plus className="w-3 h-3 mr-0.5" />
                    {v.label}
                  </Badge>
                ))}
              </div>
              <Textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                rows={4}
                placeholder={`Ex.: Olá {{nome_cliente}}! Está na hora de renovar seu {{servico}} na {{nome_clinica}}...`}
              />
              {unknownVars.length > 0 && (
                <p className="text-xs text-destructive">
                  Variável desconhecida: {unknownVars.map((v) => `{{${v}}}`).join(", ")}. Use os botões acima.
                </p>
              )}
              {preview && unknownVars.length === 0 && (
                <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md px-2 py-1.5 whitespace-pre-wrap">
                  <span className="font-medium">Prévia:</span> {preview}
                </p>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={onBackToDefault}
              >
                <RotateCcw className="w-3 h-3 mr-1" /> Voltar ao padrão da conta
              </Button>
            </>
          )}
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tempo (dias)</Label>
            <Input
              type="number"
              value={time ?? ""}
              onChange={(e) => onTimeChange(e.target.value ? parseInt(e.target.value) : null)}
              placeholder={timePlaceholder}
            />
            {timeHint && (
              <p className="text-[10px] text-muted-foreground">{timeHint}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Desconto (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={discount ?? ""}
              onChange={(e) => onDiscountChange(e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="Ex: 10"
            />
            <p className="text-[10px] text-muted-foreground">
              Aplicado como desconto da campanha desta abordagem
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export const RecurrenceTab = ({ data, onChange }: RecurrenceTabProps) => {
  const defaults = useAccountRecurrenceDefaults();
  const hasMeta = useHasMetaInstance();
  const [pendingEdit, setPendingEdit] = useState<1 | 2 | 3 | null>(null);

  const setField = (key: keyof RecurrenceData, value: string | number | null) =>
    onChange({ ...data, [key]: value });

  const messageOf = (n: 1 | 2 | 3) => data[`msg_recurrence_${n}` as const] || "";

  // Mensagem preenchida = template próprio do serviço; vazia = usa o padrão da conta.
  const startEditing = (n: 1 | 2 | 3) => {
    setPendingEdit(null);
    if (!messageOf(n).trim()) setField(`msg_recurrence_${n}` as keyof RecurrenceData, defaults[n]);
  };

  const requestEdit = (n: 1 | 2 | 3) => {
    if (hasMeta) setPendingEdit(n);
    else startEditing(n);
  };

  const blockProps = (n: 1 | 2 | 3) => ({
    index: n,
    message: messageOf(n),
    accountDefault: defaults[n],
    editing: messageOf(n).trim() !== "",
    time: data[`time_recurrence_${n}` as const],
    discount: data[`recurrence_discount_pct_${n}` as const],
    onRequestEdit: () => requestEdit(n),
    onBackToDefault: () => setField(`msg_recurrence_${n}` as keyof RecurrenceData, ""),
    onMessageChange: (v: string) => setField(`msg_recurrence_${n}` as keyof RecurrenceData, v),
    onTimeChange: (v: number | null) => setField(`time_recurrence_${n}` as keyof RecurrenceData, v),
    onDiscountChange: (v: number | null) =>
      setField(`recurrence_discount_pct_${n}` as keyof RecurrenceData, v),
  });

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground space-y-1 rounded-md border bg-muted/20 p-3">
        <p>
          As mensagens abaixo são as do <span className="font-medium">template padrão da conta</span>,
          usadas por todos os serviços com recorrência ativa.
        </p>
        <p>
          Editando aqui você cria um template <span className="font-medium">só deste serviço</span> —
          os outros serviços continuam com o padrão. Para mudar o padrão de todos, vá em{" "}
          <span className="font-medium">Conexões → Templates → Recorrência</span>.
        </p>
      </div>

      <RecurrenceBlock {...blockProps(1)} timePlaceholder="Ex: 90" />
      <RecurrenceBlock
        {...blockProps(2)}
        timePlaceholder="Ex: 150"
        timeHint="Sugestão: mesmo valor do vencimento"
      />
      <RecurrenceBlock {...blockProps(3)} timePlaceholder="Ex: 210" />

      <AlertDialog open={pendingEdit !== null} onOpenChange={(o) => !o && setPendingEdit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Template será enviado para aprovação da Meta</AlertDialogTitle>
            <AlertDialogDescription>
              Ao personalizar esta mensagem, o novo texto vira um template exclusivo deste
              serviço e, na API oficial (Meta), precisa ser aprovado antes de ser usado. A
              aprovação costuma levar de alguns minutos a 24 horas — enquanto isso, os
              disparos de recorrência deste serviço ficam pausados. Os demais serviços
              continuam usando o template padrão da conta normalmente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingEdit && startEditing(pendingEdit)}>
              Continuar e editar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

/** true se alguma mensagem contém variável fora do catálogo (bloqueia salvar). */
export function hasInvalidRecurrenceVariables(data: RecurrenceData): boolean {
  return [data.msg_recurrence_1, data.msg_recurrence_2, data.msg_recurrence_3].some(
    (msg) => findUnknownRecurrenceVariables(msg || "").length > 0,
  );
}

/**
 * Mensagens prontas para gravar: vazia OU idêntica ao padrão da conta ⇒ NULL
 * (o serviço segue o padrão em vez de congelar uma cópia dele).
 */
export function messagesForSave(
  data: RecurrenceData,
  defaults: RecurrenceDefaults,
): Record<"msg_recurrence_1" | "msg_recurrence_2" | "msg_recurrence_3", string | null> {
  const pick = (n: 1 | 2 | 3) => {
    const text = (data[`msg_recurrence_${n}` as const] || "").trim();
    if (!text || text === defaults[n].trim()) return null;
    return text;
  };
  return {
    msg_recurrence_1: pick(1),
    msg_recurrence_2: pick(2),
    msg_recurrence_3: pick(3),
  };
}
