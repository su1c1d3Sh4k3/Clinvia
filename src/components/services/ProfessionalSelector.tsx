import { useState } from "react";
import { useStaff } from "@/hooks/useStaff";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";

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
  const { data: staff } = useStaff();
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id]
    );
  };

  const selectedNames = (staff || [])
    .filter((s) => selected.includes(s.id))
    .map((s) => s.name);

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
          {(staff || []).map((member) => (
            <label
              key={member.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
            >
              <Checkbox
                checked={selected.includes(member.id)}
                onCheckedChange={() => toggle(member.id)}
              />
              <span>{member.name}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {member.role === "admin"
                  ? "Admin"
                  : member.role === "supervisor"
                  ? "Supervisor"
                  : "Atendente"}
              </span>
            </label>
          ))}
          {(!staff || staff.length === 0) && (
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
