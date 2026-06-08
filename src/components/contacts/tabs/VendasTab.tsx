import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShoppingCart } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface VendasTabProps {
  contactId: string;
}

export const VendasTab = ({ contactId }: VendasTabProps) => {
  const { data: sales, isLoading } = useQuery({
    queryKey: ["client-sales", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales" as any)
        .select("*, team_member:team_members!sales_team_member_id_fkey(name), professional:professionals!sales_professional_id_fkey(name)")
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
            <TableHead>Serviço/Produto</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Profissional</TableHead>
            <TableHead>Atendente</TableHead>
            <TableHead className="text-center">Pagamento</TableHead>
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
                  {sale.payment_type === "cash" ? "À vista" : sale.payment_type === "installment" ? `${sale.installments}x` : "Pendente"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
