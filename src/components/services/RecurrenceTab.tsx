import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface RecurrenceData {
  msg_recurrence_1: string;
  msg_recurrence_2: string;
  msg_recurrence_3: string;
  time_recurrence_1: number | null;
  time_recurrence_2: number | null;
  time_recurrence_3: number | null;
}

interface RecurrenceTabProps {
  data: RecurrenceData;
  onChange: (data: RecurrenceData) => void;
}

export const RecurrenceTab = ({ data, onChange }: RecurrenceTabProps) => {
  const setField = (key: keyof RecurrenceData, value: any) =>
    onChange({ ...data, [key]: value });

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Configure as mensagens automáticas de recorrência para este serviço.
        Essas mensagens serão enviadas ao cliente nos intervalos definidos.
      </p>

      {/* Recurrence 1 */}
      <div className="space-y-3 p-4 border rounded-md">
        <h4 className="text-sm font-medium">Recorrência 1</h4>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_160px] gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Mensagem</Label>
            <Textarea
              value={data.msg_recurrence_1}
              onChange={(e) => setField("msg_recurrence_1", e.target.value)}
              rows={3}
              placeholder="Mensagem automática da 1ª recorrência..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tempo (dias)</Label>
            <Input
              type="number"
              value={data.time_recurrence_1 ?? ""}
              onChange={(e) =>
                setField("time_recurrence_1", e.target.value ? parseInt(e.target.value) : null)
              }
              placeholder="Ex: 90"
            />
          </div>
        </div>
      </div>

      {/* Recurrence 2 */}
      <div className="space-y-3 p-4 border rounded-md">
        <h4 className="text-sm font-medium">Recorrência 2</h4>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_160px] gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Mensagem</Label>
            <Textarea
              value={data.msg_recurrence_2}
              onChange={(e) => setField("msg_recurrence_2", e.target.value)}
              rows={3}
              placeholder="Mensagem automática da 2ª recorrência..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tempo (dias)</Label>
            <Input
              type="number"
              value={data.time_recurrence_2 ?? ""}
              onChange={(e) =>
                setField("time_recurrence_2", e.target.value ? parseInt(e.target.value) : null)
              }
              placeholder="Ex: 150"
            />
            <p className="text-[10px] text-muted-foreground">
              Sugestão: mesmo valor do vencimento
            </p>
          </div>
        </div>
      </div>

      {/* Recurrence 3 */}
      <div className="space-y-3 p-4 border rounded-md">
        <h4 className="text-sm font-medium">Recorrência 3</h4>
        <div className="grid grid-cols-1 md:grid-cols-[1fr_160px] gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Mensagem</Label>
            <Textarea
              value={data.msg_recurrence_3}
              onChange={(e) => setField("msg_recurrence_3", e.target.value)}
              rows={3}
              placeholder="Mensagem automática da 3ª recorrência..."
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tempo (dias)</Label>
            <Input
              type="number"
              value={data.time_recurrence_3 ?? ""}
              onChange={(e) =>
                setField("time_recurrence_3", e.target.value ? parseInt(e.target.value) : null)
              }
              placeholder="Ex: 210"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
