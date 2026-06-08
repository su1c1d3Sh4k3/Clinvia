import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Syringe } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ProcedimentosTabProps {
  contactId: string;
}

export const ProcedimentosTab = ({ contactId }: ProcedimentosTabProps) => {
  // Sales of services for this contact
  const { data: serviceSales, isLoading: loadingSales } = useQuery({
    queryKey: ["client-service-sales", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales" as any)
        .select("id, product_name, product_service_id, quantity, sale_date, created_at")
        .eq("contact_id", contactId)
        .eq("category", "service")
        .order("sale_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  // Completed appointments for this contact
  const { data: completedAppts, isLoading: loadingAppts } = useQuery({
    queryKey: ["client-completed-appointments", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, service_id, service_name, status")
        .eq("contact_id", contactId)
        .in("status", ["completed", "confirmed", "Confirmado", "Concluído"]);
      if (error) throw error;
      return data as any[];
    },
  });

  const isLoading = loadingSales || loadingAppts;

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (!serviceSales || serviceSales.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Syringe className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Nenhum procedimento adquirido por este cliente.</p>
      </div>
    );
  }

  // Count executed per service
  const executedByService = (completedAppts || []).reduce<Record<string, number>>((acc, a) => {
    const key = a.service_id || a.service_name || "";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  // Build procedure rows
  const procedures = serviceSales.map((sale: any) => {
    const executed = executedByService[sale.product_service_id] || 0;
    const available = Math.max(0, sale.quantity - executed);
    return { ...sale, executed, available };
  });

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[180px]">Procedimento</TableHead>
            <TableHead>Data Aquisição</TableHead>
            <TableHead className="text-center">Qtd. Adquirida</TableHead>
            <TableHead className="text-center">Qtd. Executada</TableHead>
            <TableHead className="text-center">Qtd. Disponível</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {procedures.map((p: any) => (
            <TableRow key={p.id}>
              <TableCell className="text-sm font-medium">{p.product_name || "—"}</TableCell>
              <TableCell className="text-sm">
                {p.sale_date ? format(new Date(p.sale_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}
              </TableCell>
              <TableCell className="text-center text-sm">{p.quantity}</TableCell>
              <TableCell className="text-center">
                <Badge variant={p.executed > 0 ? "default" : "secondary"} className="text-xs">
                  {p.executed}
                </Badge>
              </TableCell>
              <TableCell className="text-center">
                <Badge variant={p.available > 0 ? "default" : "outline"} className="text-xs">
                  {p.available}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
