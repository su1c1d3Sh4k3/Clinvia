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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { toast } from "sonner";
import { ServiceCategory } from "@/types/services";

const normalizeTxt = (s: string) =>
  s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

interface AddCategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddCategoryModal = ({ open, onOpenChange }: AddCategoryModalProps) => {
  const { data: ownerId } = useOwnerId();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryType, setCategoryType] = useState<"standard" | "direct">("standard");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setCategoryType("standard");
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

  const handleSave = async () => {
    if (!ownerId || !name.trim()) return;

    const duplicate = (categories || []).some(
      (c) => normalizeTxt(c.name) === normalizeTxt(name)
    );
    if (duplicate) {
      toast.error("Já existe uma categoria com esse nome");
      return;
    }

    setSaving(true);
    try {
      const { data: category, error } = await supabase
        .from("services_category" as any)
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          category_type: categoryType,
          user_id: ownerId,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Categorias diretas lançam entradas direto no serviço de apoio (padrão Consultas/Avaliação)
      if (categoryType === "direct") {
        const { error: svcError } = await supabase
          .from("service_name" as any)
          .insert({
            category_id: (category as any).id,
            user_id: ownerId,
            name: name.trim(),
            description: description.trim() || null,
          });
        if (svcError) throw svcError;
      }

      queryClient.invalidateQueries({ queryKey: ["services-categories"] });
      queryClient.invalidateQueries({ queryKey: ["service-names-all"] });
      queryClient.invalidateQueries({ queryKey: ["service-names"] });
      toast.success(`Categoria "${name.trim()}" criada com sucesso`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao criar categoria: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg">
        <DialogHeader>
          <DialogTitle>Adicionar Categoria</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Odontologia"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Descrição da categoria..."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select
              value={categoryType}
              onValueChange={(v) => setCategoryType(v as "standard" | "direct")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Padrão (serviços e aplicações)</SelectItem>
                <SelectItem value="direct">Direta (lançamento direto)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {categoryType === "standard"
                ? "Organizada em serviços com aplicações (ex: Injetáveis → Botox → Botox Face)."
                : "Entradas lançadas direto na categoria, sem hierarquia (ex: Consultas, Avaliação)."}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              "Criar Categoria"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
