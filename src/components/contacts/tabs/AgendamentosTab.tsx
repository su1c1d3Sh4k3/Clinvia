import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AgendamentosTabProps {
  contactId: string;
}

export const AgendamentosTab = ({ contactId }: AgendamentosTabProps) => {
  const { data: appointments, isLoading } = useQuery({
    queryKey: ["client-appointments", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, professional:professionals(name)")
        .eq("contact_id", contactId)
        .order("start_time", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (!appointments || appointments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Calendar className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Nenhum agendamento para este cliente.</p>
      </div>
    );
  }

  const statusColor = (s: string) => {
    if (!s) return "secondary";
    const lower = s.toLowerCase();
    if (lower.includes("confirm") || lower.includes("conclu")) return "default";
    if (lower.includes("cancel")) return "destructive";
    return "secondary";
  };

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Horário</TableHead>
            <TableHead>Profissional</TableHead>
            <TableHead>Serviço</TableHead>
            <TableHead className="text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {appointments.map((apt: any) => (
            <TableRow key={apt.id}>
              <TableCell className="text-sm whitespace-nowrap">
                {format(new Date(apt.start_time), "dd/MM/yyyy", { locale: ptBR })}
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap">
                {format(new Date(apt.start_time), "HH:mm")}
                {apt.end_time && ` - ${format(new Date(apt.end_time), "HH:mm")}`}
              </TableCell>
              <TableCell className="text-sm">{apt.professional?.name || "—"}</TableCell>
              <TableCell className="text-sm">{apt.service_name || "—"}</TableCell>
              <TableCell className="text-center">
                <Badge variant={statusColor(apt.status)} className="text-[10px]">
                  {apt.status || "Pendente"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
