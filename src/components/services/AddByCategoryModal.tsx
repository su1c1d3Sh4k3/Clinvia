import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useOwnerId } from "@/hooks/useOwnerId";
import { toast } from "sonner";
import {
  ServiceCategory,
  ServiceName,
  ServiceApplication,
} from "@/types/services";
import { RecurrenceTab, RecurrenceData } from "./RecurrenceTab";

const defaultRecurrence: RecurrenceData = {
  msg_recurrence_1: "",
  msg_recurrence_2: "",
  msg_recurrence_3: "",
  time_recurrence_1: null,
  time_recurrence_2: null,
  time_recurrence_3: null,
};

interface AddByCategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddByCategoryModal = ({
  open,
  onOpenChange,
}: AddByCategoryModalProps) => {
  const { user } = useAuth();
  const { data: ownerId } = useOwnerId();
  const queryClient = useQueryClient();

  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [selectedAppIds, setSelectedAppIds] = useState<Set<string>>(new Set());
  const [recurrence, setRecurrence] = useState<RecurrenceData>(defaultRecurrence);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedCategoryId("");
      setSelectedServiceId("");
      setSelectedAppIds(new Set());
      setRecurrence(defaultRecurrence);
    }
  }, [open]);

  const { data: categories } = useQuery({
    queryKey: ["services-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services_category" as any)
        .select("*")
        .order("name");
      if (error) throw error;
      return data as ServiceCategory[];
    },
  });

  const { data: serviceNames } = useQuery({
    queryKey: ["service-names", selectedCategoryId],
    enabled: !!selectedCategoryId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_name" as any)
        .select("*")
        .eq("category_id", selectedCategoryId)
        .order("name");
      if (error) throw error;
      return data as ServiceName[];
    },
  });

  const { data: templateApps } = useQuery({
    queryKey: ["service-applications-template", selectedServiceId],
    enabled: !!selectedServiceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_applications" as any)
        .select("*")
        .eq("service_name_id", selectedServiceId)
        .order("name");
      if (error) throw error;
      return data as ServiceApplication[];
    },
  });

  useEffect(() => {
    if (templateApps) {
      setSelectedAppIds(new Set(templateApps.map((a) => a.id)));
    }
  }, [templateApps]);

  useEffect(() => {
    setSelectedServiceId("");
    setSelectedAppIds(new Set());
    setRecurrence(defaultRecurrence);
  }, [selectedCategoryId]);

  useEffect(() => {
    setSelectedAppIds(new Set());
    setRecurrence(defaultRecurrence);
  }, [selectedServiceId]);

  const toggleApp = (id: string) => {
    setSelectedAppIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!templateApps) return;
    if (selectedAppIds.size === templateApps.length) {
      setSelectedAppIds(new Set());
    } else {
      setSelectedAppIds(new Set(templateApps.map((a) => a.id)));
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);

  const handleSave = async () => {
    if (!ownerId || !selectedCategoryId || !selectedServiceId) return;
    const appsToInsert = (templateApps || []).filter((a) =>
      selectedAppIds.has(a.id)
    );
    if (appsToInsert.length === 0) {
      toast.error("Selecione ao menos uma aplicação");
      return;
    }

    setSaving(true);
    try {
      const rows = appsToInsert.map((app) => ({
        user_id: ownerId,
        category_id: selectedCategoryId,
        service_name_id: selectedServiceId,
        template_app_id: app.id,
        name: app.name,
        description: app.description,
        price: app.default_price,
        min_price: app.default_min_price,
        status: true,
        expiry_months: app.default_expiry_months,
        recurrence: app.default_recurrence,
        session_interval: app.default_session_interval,
        duration_minutes: app.default_duration_minutes,
        professionals: [],
        commission_pct: 0,
        msg_recurrence_1: recurrence.msg_recurrence_1 || null,
        msg_recurrence_2: recurrence.msg_recurrence_2 || null,
        msg_recurrence_3: recurrence.msg_recurrence_3 || null,
        time_recurrence_1: recurrence.time_recurrence_1,
        time_recurrence_2: recurrence.time_recurrence_2 ?? app.default_expiry_months * 30,
        time_recurrence_3: recurrence.time_recurrence_3,
      }));

      const { error } = await supabase
        .from("services_client" as any)
        .insert(rows);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["services-client"] });
      toast.success(`${rows.length} aplicações adicionadas com sucesso`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const allSelected =
    templateApps && templateApps.length > 0 && selectedAppIds.size === templateApps.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar Serviço por Categoria</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Step 1: Category */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">1. Categoria</Label>
            <Select
              value={selectedCategoryId}
              onValueChange={setSelectedCategoryId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma categoria..." />
              </SelectTrigger>
              <SelectContent>
                {(categories || []).map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Step 2: Service */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">2. Serviço</Label>
            <Select
              value={selectedServiceId}
              onValueChange={setSelectedServiceId}
              disabled={!selectedCategoryId}
            >
              <SelectTrigger>
                <SelectValue placeholder={
                  !selectedCategoryId
                    ? "Selecione uma categoria primeiro"
                    : "Selecione um serviço..."
                } />
              </SelectTrigger>
              <SelectContent>
                {(serviceNames || []).map((svc) => (
                  <SelectItem key={svc.id} value={svc.id}>
                    {svc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Step 3: Tabs (Applications + Recurrence) */}
          {selectedServiceId && (
            <Tabs defaultValue="applications">
              <TabsList>
                <TabsTrigger value="applications">Aplicações</TabsTrigger>
                <TabsTrigger value="recurrence">Recorrência</TabsTrigger>
              </TabsList>

              <TabsContent value="applications" className="mt-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">3. Aplicações</Label>
                    {templateApps && templateApps.length > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {selectedAppIds.size}/{templateApps.length} selecionadas
                      </Badge>
                    )}
                  </div>

                  {!templateApps ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : templateApps.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm border rounded-md">
                      Nenhuma aplicação template cadastrada para este serviço.
                    </div>
                  ) : (
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40px]">
                              <Checkbox
                                checked={allSelected}
                                onCheckedChange={toggleAll}
                              />
                            </TableHead>
                            <TableHead className="min-w-[200px]">Nome</TableHead>
                            <TableHead>Descrição</TableHead>
                            <TableHead className="min-w-[110px]">Valor</TableHead>
                            <TableHead className="min-w-[110px]">Preço Mín.</TableHead>
                            <TableHead className="w-[80px] text-center">Tempo</TableHead>
                            <TableHead className="w-[90px] text-center">Vencimento</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {templateApps.map((app) => (
                            <TableRow
                              key={app.id}
                              className="cursor-pointer"
                              onClick={() => toggleApp(app.id)}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={selectedAppIds.has(app.id)}
                                  onCheckedChange={() => toggleApp(app.id)}
                                />
                              </TableCell>
                              <TableCell className="font-medium text-sm">
                                {app.name}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                                {app.description || "—"}
                              </TableCell>
                              <TableCell className="text-sm">
                                {formatCurrency(app.default_price)}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatCurrency(app.default_min_price)}
                              </TableCell>
                              <TableCell className="text-center text-sm">
                                {app.default_duration_minutes ? `${app.default_duration_minutes}min` : "—"}
                              </TableCell>
                              <TableCell className="text-center text-sm">
                                {app.default_expiry_months}m
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="recurrence" className="mt-4">
                <RecurrenceTab data={recurrence} onChange={setRecurrence} />
              </TabsContent>
            </Tabs>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || selectedAppIds.size === 0 || !selectedServiceId}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              `Salvar ${selectedAppIds.size} Aplicação${selectedAppIds.size !== 1 ? "ões" : ""}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
