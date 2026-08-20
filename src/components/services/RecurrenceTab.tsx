import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import {
  RECURRENCE_VARIABLES,
  findUnknownRecurrenceVariables,
  insertRecurrenceVariable,
  renderRecurrencePreview,
} from "@/lib/recurrenceTemplate";

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

interface RecurrenceTabProps {
  data: RecurrenceData;
  onChange: (data: RecurrenceData) => void;
}

interface RecurrenceBlockProps {
  index: 1 | 2 | 3;
  message: string;
  time: number | null;
  discount: number | null;
  timeHint?: string;
  timePlaceholder: string;
  onMessageChange: (value: string) => void;
  onTimeChange: (value: number | null) => void;
  onDiscountChange: (value: number | null) => void;
}

const RecurrenceBlock = ({
  index,
  message,
  time,
  discount,
  timeHint,
  timePlaceholder,
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
      <h4 className="text-sm font-medium">Recorrência {index}</h4>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_160px] gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Mensagem (formato template)</Label>
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
            rows={3}
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
  const setField = (key: keyof RecurrenceData, value: string | number | null) =>
    onChange({ ...data, [key]: value });

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Configure as mensagens automáticas de recorrência para este serviço. Elas serão
        enviadas nos intervalos definidos. Use as variáveis para personalizar — quem usa
        API oficial (Meta) terá essas mensagens enviadas como template aprovado.
      </p>

      <RecurrenceBlock
        index={1}
        message={data.msg_recurrence_1}
        time={data.time_recurrence_1}
        discount={data.recurrence_discount_pct_1}
        timePlaceholder="Ex: 90"
        onMessageChange={(v) => setField("msg_recurrence_1", v)}
        onTimeChange={(v) => setField("time_recurrence_1", v)}
        onDiscountChange={(v) => setField("recurrence_discount_pct_1", v)}
      />

      <RecurrenceBlock
        index={2}
        message={data.msg_recurrence_2}
        time={data.time_recurrence_2}
        discount={data.recurrence_discount_pct_2}
        timePlaceholder="Ex: 150"
        timeHint="Sugestão: mesmo valor do vencimento"
        onMessageChange={(v) => setField("msg_recurrence_2", v)}
        onTimeChange={(v) => setField("time_recurrence_2", v)}
        onDiscountChange={(v) => setField("recurrence_discount_pct_2", v)}
      />

      <RecurrenceBlock
        index={3}
        message={data.msg_recurrence_3}
        time={data.time_recurrence_3}
        discount={data.recurrence_discount_pct_3}
        timePlaceholder="Ex: 210"
        onMessageChange={(v) => setField("msg_recurrence_3", v)}
        onTimeChange={(v) => setField("time_recurrence_3", v)}
        onDiscountChange={(v) => setField("recurrence_discount_pct_3", v)}
      />
    </div>
  );
};

/** true se alguma mensagem contém variável fora do catálogo (bloqueia salvar). */
export function hasInvalidRecurrenceVariables(data: RecurrenceData): boolean {
  return [data.msg_recurrence_1, data.msg_recurrence_2, data.msg_recurrence_3].some(
    (msg) => findUnknownRecurrenceVariables(msg || "").length > 0,
  );
}
