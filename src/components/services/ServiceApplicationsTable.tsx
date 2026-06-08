import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2 } from "lucide-react";
import { ServiceClient } from "@/types/services";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { EditApplicationModal } from "./EditApplicationModal";
import { cn } from "@/lib/utils";

interface ServiceApplicationsTableProps {
  applications: ServiceClient[];
}

export const ServiceApplicationsTable = ({
  applications,
}: ServiceApplicationsTableProps) => {
  const queryClient = useQueryClient();
  const [editApp, setEditApp] = useState<ServiceClient | null>(null);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);

  const toggleStatus = async (app: ServiceClient) => {
    const { error } = await supabase
      .from("services_client" as any)
      .update({ status: !app.status })
      .eq("id", app.id);

    if (error) {
      toast.error("Erro ao alterar status");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["services-client"] });
  };

  const toggleRecurrence = async (app: ServiceClient) => {
    const { error } = await supabase
      .from("services_client" as any)
      .update({ recurrence: !app.recurrence })
      .eq("id", app.id);

    if (error) {
      toast.error("Erro ao alterar recorrência");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["services-client"] });
  };

  const handleDelete = async (app: ServiceClient) => {
    if (!confirm(`Deseja excluir "${app.name}"?`)) return;

    const { error } = await supabase
      .from("services_client" as any)
      .delete()
      .eq("id", app.id);

    if (error) {
      toast.error("Erro ao excluir");
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["services-client"] });
    toast.success("Aplicação excluída");
  };

  if (applications.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Nenhuma aplicação cadastrada para este serviço.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Nome</TableHead>
              <TableHead className="min-w-[120px]">Valor</TableHead>
              <TableHead className="min-w-[120px]">Preço Mín.</TableHead>
              <TableHead className="w-[80px] text-center">Status</TableHead>
              <TableHead className="w-[100px] text-center">Vencimento</TableHead>
              <TableHead className="w-[100px] text-center">Recorrência</TableHead>
              <TableHead className="w-[100px] text-center">Intervalo</TableHead>
              <TableHead className="w-[100px] text-center">Comissão</TableHead>
              <TableHead className="w-[90px] text-center">Estágio</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {applications.map((app) => (
              <TableRow
                key={app.id}
                className={cn(!app.status && "opacity-50")}
              >
                <TableCell>
                  <div>
                    <span className="font-medium text-sm">{app.name}</span>
                    {app.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-[250px]">
                        {app.description}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm font-medium">
                  {formatCurrency(app.price)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatCurrency(app.min_price)}
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={app.status}
                    onCheckedChange={() => toggleStatus(app)}
                  />
                </TableCell>
                <TableCell className="text-center text-sm">
                  {app.expiry_months}m
                </TableCell>
                <TableCell className="text-center">
                  <Switch
                    checked={app.recurrence}
                    onCheckedChange={() => toggleRecurrence(app)}
                  />
                </TableCell>
                <TableCell className="text-center text-sm text-muted-foreground">
                  {app.session_interval ? `${app.session_interval}d` : "—"}
                </TableCell>
                <TableCell className="text-center text-sm">
                  {app.commission_pct > 0 ? `${app.commission_pct}%` : "—"}
                </TableCell>
                <TableCell className="text-center">
                  {app.recurrence_stage ? (
                    <Badge variant="outline" className="text-[10px] px-1.5">
                      {app.recurrence_stage.replace("_", " ")}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditApp(app)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(app)}
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

      <EditApplicationModal
        open={!!editApp}
        onOpenChange={(open) => !open && setEditApp(null)}
        application={editApp}
      />
    </>
  );
};
