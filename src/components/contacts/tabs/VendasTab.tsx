import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShoppingCart } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface VendasTabProps {
  contactId: string;
}

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/** Quitada / Parcelas pendentes / Pagamento pendente — derivado do tipo + parcelas. */
function paymentStatus(sale: any): { label: string; className: string } {
  if (sale.payment_type === "pending") {
    return { label: "Pagamento pendente", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" };
  }
  const parcelas = (sale.installments_data || []) as any[];
  const pendentes = parcelas.filter((p) => p.status !== "paid");
  if (pendentes.length > 0) {
    return { label: `Parcelas pendentes (${pendentes.length})`, className: "bg-blue-500/15 text-blue-600 border-blue-500/30" };
  }
  return { label: "Quitada", className: "bg-green-500/15 text-green-600 border-green-500/30" };
}

export const VendasTab = ({ contactId }: VendasTabProps) => {
  const { data: sales, isLoading } = useQuery({
    queryKey: ["client-sales", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales" as any)
        .select(`
          id, product_name, total_amount, sale_date, payment_type, installments,
          team_member:team_members!sales_team_member_id_fkey(name),
          sala:professionals!sales_professional_id_fkey(name),
          profissional:responsaveis!sales_responsavel_id_fkey(name, role),
          orcamento_item:orcamento_itens!sales_orcamento_item_id_fkey(orcamento:orcamentos(indicacao)),
          installments_data:sale_installments(id, status)
        `)
        .eq("contact_id", contactId)
        .order("sale_date", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

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
    <div className="space-y-3">
      {sales.map((sale: any) => {
        const status = paymentStatus(sale);
        const indicacao = sale.orcamento_item?.orcamento?.indicacao || null;
        return (
          <div key={sale.id} className="border rounded-lg p-3 space-y-2 bg-card">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{sale.product_name || "—"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {sale.sale_date ? format(new Date(`${sale.sale_date}T00:00:00`), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                </p>
              </div>
              <span className="text-sm font-semibold text-green-600 shrink-0">{fmt(Number(sale.total_amount || 0))}</span>
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <p>Profissional: {sale.profissional?.name || "—"}</p>
              <p>Sala: {sale.sala?.name || "—"}</p>
              <p>Atendente: {sale.team_member?.name || "—"}</p>
              <p>Indicação: {indicacao || "—"}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-[10px]">
                {sale.payment_type === "cash"
                  ? "À vista"
                  : sale.payment_type === "installment"
                    ? `${sale.installments}x`
                    : sale.payment_type === "mixed"
                      ? `Misto (${sale.installments}x)`
                      : "Pendente"}
              </Badge>
              <Badge variant="outline" className={`text-[10px] ${status.className}`}>{status.label}</Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
};
