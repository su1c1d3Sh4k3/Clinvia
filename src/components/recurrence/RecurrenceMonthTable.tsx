import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ---------------------------------------------------------------------------
// Tipos e helpers compartilhados entre /recurrence e o Dashboard de Campanhas
// ---------------------------------------------------------------------------

export interface RecurrenceEntry {
  id: string;
  contact_id?: string | null;
  contact_name: string;
  service_name: string;
  application_name: string;
  procedure_date: string;
  recurrence_date: string;
  approach_1_date: string | null;
  approach_1_status: string;
  approach_2_date: string | null;
  approach_2_status: string;
  approach_3_date: string | null;
  approach_3_status: string;
  scheduled: boolean;
}

export function formatDateBR(dateStr: string | null): string {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

export function getStatusBadge(status: string) {
  switch (status) {
    case "realizada":
      return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-[10px]">Realizada</Badge>;
    case "cliente em contato":
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800 text-[10px]">Em contato</Badge>;
    default:
      return <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700 text-[10px]">Pendente</Badge>;
  }
}

export function getScheduledBadge(scheduled: boolean) {
  if (scheduled) {
    return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 text-[10px]">Sim</Badge>;
  }
  return <Badge className="bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700 text-[10px]">Não</Badge>;
}

// ---------------------------------------------------------------------------
// Tabela mensal de recorrências (extraída de src/pages/Recurrence.tsx)
// ---------------------------------------------------------------------------

export function RecurrenceMonthTable({ entries }: { entries: RecurrenceEntry[] }) {
  return (
    <div className="border-t border-[#D4D5D6] dark:border-border overflow-x-auto">
      <Table className="w-full">
        <TableHeader>
          <TableRow>
            <TableHead className="text-foreground dark:text-slate-400 font-semibold text-xs">
              Cliente
            </TableHead>
            <TableHead className="hidden sm:table-cell text-foreground dark:text-slate-400 font-semibold text-xs">
              Serviço
            </TableHead>
            <TableHead className="hidden md:table-cell text-foreground dark:text-slate-400 font-semibold text-xs">
              Aplicação
            </TableHead>
            <TableHead className="hidden sm:table-cell text-foreground dark:text-slate-400 font-semibold text-xs">
              Realizado
            </TableHead>
            <TableHead className="text-foreground dark:text-slate-400 font-semibold text-xs">
              Recorrência
            </TableHead>
            <TableHead className="hidden lg:table-cell text-foreground dark:text-slate-400 font-semibold text-xs text-center">
              Prévia
            </TableHead>
            <TableHead className="hidden lg:table-cell text-foreground dark:text-slate-400 font-semibold text-xs text-center">
              Vencimento
            </TableHead>
            <TableHead className="hidden lg:table-cell text-foreground dark:text-slate-400 font-semibold text-xs text-center">
              Pós
            </TableHead>
            <TableHead className="text-foreground dark:text-slate-400 font-semibold text-xs text-center">
              Agendado
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="py-2 text-sm font-medium">
                {entry.contact_name}
              </TableCell>
              <TableCell className="hidden sm:table-cell py-2 text-sm text-muted-foreground">
                {entry.service_name}
              </TableCell>
              <TableCell className="hidden md:table-cell py-2 text-sm text-muted-foreground">
                {entry.application_name}
              </TableCell>
              <TableCell className="hidden sm:table-cell py-2 text-sm text-muted-foreground">
                {formatDateBR(entry.procedure_date)}
              </TableCell>
              <TableCell className="py-2 text-sm font-medium">
                {formatDateBR(entry.recurrence_date)}
              </TableCell>
              <TableCell className="hidden lg:table-cell py-2 text-center">
                <div className="flex flex-col items-center gap-0.5">
                  {getStatusBadge(entry.approach_1_status)}
                  {entry.approach_1_date && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatDateBR(entry.approach_1_date)}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="hidden lg:table-cell py-2 text-center">
                <div className="flex flex-col items-center gap-0.5">
                  {getStatusBadge(entry.approach_2_status)}
                  {entry.approach_2_date && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatDateBR(entry.approach_2_date)}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="hidden lg:table-cell py-2 text-center">
                <div className="flex flex-col items-center gap-0.5">
                  {getStatusBadge(entry.approach_3_status)}
                  {entry.approach_3_date && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatDateBR(entry.approach_3_date)}
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell className="py-2 text-center">
                {getScheduledBadge(entry.scheduled)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
