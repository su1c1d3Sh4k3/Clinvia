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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { toast } from "sonner";
import {
  ServiceName,
  ServiceApplication,
} from "@/types/services";
import { RecurrenceTab, RecurrenceData } from "./RecurrenceTab";

const CREATE_NEW_VALUE = "__create_new__";

const defaultRecurrence: RecurrenceData = {
  msg_recurrence_1: "",
  msg_recurrence_2: "",
  msg_recurrence_3: "",
  time_recurrence_1: null,
  time_recurrence_2: null,
  time_recurrence_3: null,
};

interface AddServiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  existingServiceIds: string[];
}

export const AddServiceModal = ({
  open,
  onOpenChange,
  categoryId,
  existingServiceIds,
}: AddServiceModalProps) => {
  const { data: ownerId } = useOwnerId();
  const queryClient = useQueryClient();

  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [savingNew, setSavingNew] = useState(false);
  const [selectedAppIds, setSelectedAppIds] = useState<Set<string>>(new Set());
  const [recurrence, setRecurrence] = useState<RecurrenceData>(defaultRecurrence);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedServiceId("");
      setIsCreatingNew(false);
      setNewName("");
      setNewDescription("");
      setSelectedAppIds(new Set());
      setRecurrence(defaultRecurrence);
    }
  }, [open]);

  const { data: allServiceNames } = useQuery({
    queryKey: ["service-names", categoryId],
    enabled: !!categoryId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_name" as any)
        .select("*")
        .eq("category_id", categoryId)
        .order("name");
      if (error) throw error;
      return data as ServiceName[];
    },
  });

  const availableServices = (allServiceNames || []).filter(
    (s) => !existingServiceIds.includes(s.id)
  );

  const { data: templateApps } = useQuery({
    queryKey: ["service-applications-template", selectedServiceId],
    enabled: !!selectedServiceId && !isCreatingNew,
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

  const handleServiceChange = (value: string) => {
    if (value === CREATE_NEW_VALUE) {
      setIsCreatingNew(true);
      setSelectedServiceId("");
      setSelectedAppIds(new Set());
      setRecurrence(defaultRecurrence);
    } else {
      setIsCreatingNew(false);
      setSelectedServiceId(value);
      setRecurrence(defaultRecurrence);
    }
  };

  const handleCreateService = async () => {
    if (!ownerId || !newName.trim()) return;
    setSavingNew(true);
    try {
      const { data, error } = await supabase
        .from("service_name" as any)
        .insert({
          category_id: categoryId,
          user_id: ownerId,
          name: newName.trim(),
          description: newDescription.trim() || null,
        })
        .select("id")
        .single();

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["service-names"] });
      queryClient.invalidateQueries({ queryKey: ["service-names-all"] });
      toast.success(`Serviço "${newName.trim()}" criado com sucesso`);

      setIsCreatingNew(false);
      setSelectedServiceId((data as any).id);
      setNewName("");
      setNewDescription("");
    } catch (err: any) {
      toast.error("Erro ao criar serviço: " + err.message);
    } finally {
      setSavingNew(false);
    }
  };

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

  const handleSaveApplications = async () => {
    if (!ownerId || !selectedServiceId) return;
    const appsToInsert = (templateApps || []).filter((a) =>
      selectedAppIds.has(a.id)
    );

    if (appsToInsert.length === 0) {
      queryClient.invalidateQueries({ queryKey: ["services-client"] });
      toast.success("Serviço adicionado. Use o botão Adicionar para criar aplicações.");
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      const rows = appsToInsert.map((app) => ({
        user_id: ownerId,
        category_id: categoryId,
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
      queryClient.invalidateQueries({ queryKey: ["service-names-all"] });
      toast.success(`${rows.length} aplicações adicionadas`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const allSelected =
    templateApps && templateApps.length > 0 && selectedAppIds.size === templateApps.length;

  const showContent = selectedServiceId && !isCreatingNew;
  const hasTemplateApps = templateApps && templateApps.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar Serviço</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Service Select */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Serviço</Label>
            <Select
              value={isCreatingNew ? CREATE_NEW_VALUE : selectedServiceId}
              onValueChange={handleServiceChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um serviço..." />
              </SelectTrigger>
              <SelectContent>
                {availableServices.map((svc) => (
                  <SelectItem key={svc.id} value={svc.id}>
                    {svc.name}
                  </SelectItem>
                ))}
                <SelectItem value={CREATE_NEW_VALUE} className="font-medium text-primary">
                  + Criar novo serviço
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Create New Service Form */}
          {isCreatingNew && (
            <div className="space-y-4 p-4 border rounded-md bg-muted/30">
              <h4 className="text-sm font-medium">Novo Serviço</h4>
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Laser CO2"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                  placeholder="Descrição do serviço..."
                />
              </div>
              <Button
                onClick={handleCreateService}
                disabled={savingNew || !newName.trim()}
                size="sm"
              >
                {savingNew ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Criando...
                  </>
                ) : (
                  "Criar Serviço"
                )}
              </Button>
            </div>
          )}

          {/* Tabs: Applications + Recurrence */}
          {showContent && (
            <Tabs defaultValue="applications">
              <TabsList>
                <TabsTrigger value="applications">Aplicações</TabsTrigger>
                <TabsTrigger value="recurrence">Recorrência</TabsTrigger>
              </TabsList>

              <TabsContent value="applications" className="mt-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Aplicações</Label>
                    {hasTemplateApps && (
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
                    <div className="text-center py-6 text-muted-foreground text-sm border rounded-md">
                      Este serviço não possui aplicações pré-cadastradas.
                      Após salvar, você pode adicionar aplicações manualmente.
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
          {showContent && (
            <Button
              onClick={handleSaveApplications}
              disabled={saving}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : hasTemplateApps ? (
                `Salvar ${selectedAppIds.size} Aplicação${selectedAppIds.size !== 1 ? "ões" : ""}`
              ) : (
                "Adicionar Serviço"
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
