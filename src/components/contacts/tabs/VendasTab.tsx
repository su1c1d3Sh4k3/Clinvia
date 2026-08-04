import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, ShoppingCart, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AppointmentAlertLabels, AppointmentAlert } from "@/types/sales";

interface VendasTabProps {
  contactId: string;
}

const APT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  rescheduled: "Remarcado",
  completed: "Concluído",
  canceled: "Cancelado",
  waiting: "Em espera",
  "no-show": "Não compareceu",
};

export const VendasTab = ({ contactId }: VendasTabProps) => {
  const { data: sales, isLoading } = useQuery({
    queryKey: ["client-sales", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales" as any)
        .select("*, team_member:team_members!sales_team_member_id_fkey(name), professional:professionals!sales_professional_id_fkey(name), appointment:appointments!sales_appointment_id_fkey(status, start_time)")
        .eq("contact_id", contactId)
        .order("sale_date", { ascending: false });
      if (error) {
        // Fallback without joins
        const { data: d2, error: e2 } = await supabase
          .from("sales" as any)
          .select("*")
          .eq("contact_id", contactId)
          .order("sale_date", { ascending: false });
        if (e2) throw e2;
        return d2 as any[];
      }
      return data as any[];
    },
  });

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const renderAppointment = (sale: any) => {
    const alertLabel = sale.appointment_alert
      ? AppointmentAlertLabels[sale.appointment_alert as AppointmentAlert]
      : null;

    if (sale.appointment) {
      const statusLabel = APT_STATUS_LABELS[sale.appointment.status] || sale.appointment.status;
      return (
        <span className="inline-flex items-center gap-1.5 justify-center">
          <Badge variant="outline" className="text-[10px]">
            {statusLabel}
            {sale.appointment.start_time && (
              <span className="ml-1 text-muted-foreground">
                {format(new Date(sale.appointment.start_time), "dd/MM HH:mm", { locale: ptBR })}
              </span>
            )}
          </Badge>
          {alertLabel && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                </TooltipTrigger>
                <TooltipContent>{alertLabel}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </span>
      );
    }

    // Sem agendamento vinculado
    return (
      <Badge variant="secondary" className="text-[10px]">
        {sale.ia_scheduling ? "Agendamento Programado" : "Aguardando Agendamento"}
      </Badge>
    );
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (!sales || sales.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ShoppingCart className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Nenhuma venda registrada para este cliente.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Serviço</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Profissional</TableHead>
            <TableHead>Atendente</TableHead>
            <TableHead className="text-center">Pagamento</TableHead>
            <TableHead className="text-center">Agendamento</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sales.map((sale: any) => (
            <TableRow key={sale.id}>
              <TableCell className="text-sm whitespace-nowrap">
                {sale.sale_date ? format(new Date(sale.sale_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}
              </TableCell>
              <TableCell className="text-sm font-medium">{sale.product_name || "—"}</TableCell>
              <TableCell className="text-sm text-right font-medium">{fmt(sale.total_amount)}</TableCell>
              <TableCell className="text-sm">{sale.professional?.name || "—"}</TableCell>
              <TableCell className="text-sm">{sale.team_member?.name || "—"}</TableCell>
              <TableCell className="text-center">
                <Badge variant="outline" className="text-[10px]">
                  {sale.payment_type === "cash"
                    ? "À vista"
                    : sale.payment_type === "installment"
                      ? `${sale.installments}x`
                      : sale.payment_type === "mixed"
                        ? `Misto (${sale.installments}x)`
                        : "Pendente"}
                </Badge>
              </TableCell>
              <TableCell className="text-center whitespace-nowrap">
                {renderAppointment(sale)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
