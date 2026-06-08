import { useState } from "react";
import { ChevronDown, Plus, Pencil, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ServiceClient } from "@/types/services";
import { DirectEntryModal } from "./DirectEntryModal";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface DirectCategoryCardProps {
  categoryId: string;
  categoryName: string;
  serviceNameId: string;
  entries: ServiceClient[];
}

export const DirectCategoryCard = ({
  categoryId,
  categoryName,
  serviceNameId,
  entries,
}: DirectCategoryCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<ServiceClient | null>(null);
  const queryClient = useQueryClient();

  const formatCurrency = (value: number) => {
    if (value === 0) return "Gratuito";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const toggleStatus = async (item: ServiceClient) => {
    const { error } = await supabase
      .from("services_client" as any)
      .update({ status: !item.status })
      .eq("id", item.id);
    if (error) {
      toast.error("Erro ao alterar status");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["services-client"] });
  };

  const toggleRecurrence = async (item: ServiceClient) => {
    const { error } = await supabase
      .from("services_client" as any)
      .update({ recurrence: !item.recurrence })
      .eq("id", item.id);
    if (error) {
      toast.error("Erro ao alterar recorrência");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["services-client"] });
  };

  const handleDelete = async (item: ServiceClient) => {
    if (!confirm(`Deseja excluir "${item.name}"?`)) return;
    const { error } = await supabase
      .from("services_client" as any)
      .delete()
      .eq("id", item.id);
    if (error) {
      toast.error("Erro ao excluir");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["services-client"] });
    toast.success("Excluído com sucesso");
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <h3 className="text-base font-semibold">{categoryName}</h3>
          <span className="text-xs text-muted-foreground">
            {entries.length} registro{entries.length !== 1 ? "s" : ""}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="border-t px-5 py-4">
          {entries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm space-y-3">
              <p>Nenhum registro cadastrado.</p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => setShowAdd(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar {categoryName === "Consultas" ? "Consulta" : "Avaliação"}
              </Button>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Nome</TableHead>
                    <TableHead className="min-w-[120px]">Valor</TableHead>
                    <TableHead className="min-w-[120px]">Preço Mín.</TableHead>
                    <TableHead className="w-[80px] text-center">Status</TableHead>
                    <TableHead className="w-[100px] text-center">Retorno</TableHead>
                    <TableHead className="w-[100px] text-center">Recorrência</TableHead>
                    <TableHead className="w-[100px] text-center">Tempo</TableHead>
                    <TableHead className="w-[100px] text-center">Comissão</TableHead>
                    <TableHead className="w-[110px]">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => setShowAdd(true)}
                      >
                        <Plus className="h-3 w-3" />
                        Adicionar
                      </Button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((item) => (
                    <TableRow
                      key={item.id}
                      className={cn(!item.status && "opacity-50")}
                    >
                      <TableCell>
                        <div>
                          <span className="font-medium text-sm">{item.name}</span>
                          {item.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={cn(
                        "text-sm font-medium",
                        item.price === 0 && "text-green-600"
                      )}>
                        {formatCurrency(item.price)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.price === 0 ? "—" : formatCurrency(item.min_price)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={item.status}
                          onCheckedChange={() => toggleStatus(item)}
                        />
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {item.expiry_months}m
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={item.recurrence}
                          onCheckedChange={() => toggleRecurrence(item)}
                        />
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {item.duration_minutes ? `${item.duration_minutes}min` : "—"}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {item.commission_pct > 0 ? `${item.commission_pct}%` : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEditItem(item)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(item)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      <DirectEntryModal
        open={showAdd}
        onOpenChange={setShowAdd}
        categoryId={categoryId}
        categoryName={categoryName}
        serviceNameId={serviceNameId}
      />

      <DirectEntryModal
        open={!!editItem}
        onOpenChange={(open) => !open && setEditItem(null)}
        categoryId={categoryId}
        categoryName={categoryName}
        serviceNameId={serviceNameId}
        editItem={editItem}
      />
    </div>
  );
};
