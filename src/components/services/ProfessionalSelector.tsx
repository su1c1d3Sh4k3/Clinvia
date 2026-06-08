import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";

interface Professional {
  id: string;
  name: string;
  specialty?: string;
}

interface ProfessionalSelectorProps {
  selected: string[];
  onChange: (ids: string[]) => void;
  applyToAll?: boolean;
  onApplyToAllChange?: (checked: boolean) => void;
  showApplyToAll?: boolean;
}

export const ProfessionalSelector = ({
  selected,
  onChange,
  applyToAll = false,
  onApplyToAllChange,
  showApplyToAll = false,
}: ProfessionalSelectorProps) => {
  const [open, setOpen] = useState(false);

  const { data: professionals } = useQuery({
    queryKey: ["professionals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, name, specialty")
        .order("name");
      if (error) throw error;
      return data as Professional[];
    },
  });

  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id]
    );
  };

  const selectedNames = (professionals || [])
    .filter((p) => selected.includes(p.id))
    .map((p) => p.name);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2 rounded-md border text-sm text-left transition-colors",
          "border-input bg-background hover:bg-accent",
          open && "ring-2 ring-ring"
        )}
      >
        <Users className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="truncate flex-1 text-muted-foreground">
          {selectedNames.length > 0
            ? selectedNames.join(", ")
            : "Selecionar profissionais..."}
        </span>
      </button>

      {open && (
        <div className="border rounded-md bg-popover p-2 space-y-1 max-h-48 overflow-y-auto">
          {(professionals || []).map((prof) => (
            <label
              key={prof.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
            >
              <Checkbox
                checked={selected.includes(prof.id)}
                onCheckedChange={() => toggle(prof.id)}
              />
              <span>{prof.name}</span>
              {prof.specialty && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {prof.specialty}
                </span>
              )}
            </label>
          ))}
          {(!professionals || professionals.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-2">
              Nenhum profissional cadastrado
            </p>
          )}
        </div>
      )}

      {showApplyToAll && onApplyToAllChange && (
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={applyToAll}
            onCheckedChange={(v) => onApplyToAllChange(!!v)}
          />
          <span className="text-muted-foreground">
            Aplicar para todas as aplicações deste serviço
          </span>
        </label>
      )}
    </div>
  );
};
