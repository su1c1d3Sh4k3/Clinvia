import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Settings, Loader2 } from "lucide-react";
import {
  REPORT_TYPES,
  REPORT_TYPE_CONFIG,
  getCategoryLabel,
} from "@/types/reports";
import type { ReportType, ReportTypeConfig } from "@/types/reports";
import {
  useReportPreferences,
  useUpdateReportPreferences,
} from "@/hooks/useReportPreferences";
import {
  GitBranch, Filter, Bot, RefreshCw, UserPlus, TrendingUp,
  Repeat, DollarSign, Headphones, Heart, Users, Stethoscope,
  Calendar, Layers, ShoppingBag, Star, AlertTriangle, Clock,
  UserX, Target, Receipt, LogOut,
} from "lucide-react";

const ICON_MAP: Record<string, any> = {
  GitBranch, Filter, Bot, RefreshCw, UserPlus, TrendingUp,
  Repeat, DollarSign, Headphones, Heart, Users, Stethoscope,
  Calendar, Layers, ShoppingBag, Star, AlertTriangle, Clock,
  UserX, Target, Receipt, LogOut,
};

interface ReportPreferencesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CATEGORIES: ReportTypeConfig["category"][] = [
  "funnel",
  "financial",
  "operational",
  "performance",
  "marketing",
];

export function ReportPreferencesModal({
  open,
  onOpenChange,
}: ReportPreferencesModalProps) {
  const { data: preferences } = useReportPreferences();
  const updatePreferences = useUpdateReportPreferences();

  const [activeTypes, setActiveTypes] = useState<Set<ReportType>>(new Set());

  // Sync from server
  useEffect(() => {
    if (preferences?.active_types) {
      setActiveTypes(new Set(preferences.active_types as ReportType[]));
    }
  }, [preferences]);

  const toggleType = (type: ReportType) => {
    setActiveTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const selectAll = () => {
    setActiveTypes(new Set(REPORT_TYPES));
  };

  const deselectAll = () => {
    setActiveTypes(new Set());
  };

  const handleSave = () => {
    updatePreferences.mutate(Array.from(activeTypes), {
      onSuccess: () => onOpenChange(false),
    });
  };

  // Group by category
  const typesByCategory = CATEGORIES.map((cat) => ({
    category: cat,
    label: getCategoryLabel(cat),
    types: REPORT_TYPES.filter((t) => REPORT_TYPE_CONFIG[t].category === cat),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Configurar Relatórios
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Selecione os tipos de relatórios que deseja gerar. Os tipos
            selecionados serão gerados automaticamente nas frequências diária,
            semanal e mensal.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4 pr-2">
          {/* Quick actions */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              Selecionar todos
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAll}>
              Limpar todos
            </Button>
            <Badge variant="secondary" className="ml-auto">
              {activeTypes.size} / {REPORT_TYPES.length} ativos
            </Badge>
          </div>

          {/* Types by category */}
          {typesByCategory.map(({ category, label, types }) => (
            <div key={category} className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {label}
              </h3>
              <div className="space-y-1">
                {types.map((type) => {
                  const config = REPORT_TYPE_CONFIG[type];
                  const Icon = ICON_MAP[config.icon] || Settings;
                  const isActive = activeTypes.has(type);

                  return (
                    <button
                      key={type}
                      onClick={() => toggleType(type)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors text-left"
                    >
                      <div className="shrink-0 p-1.5 rounded-md bg-primary/10">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{config.label}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {config.description}
                        </p>
                      </div>
                      <Switch
                        checked={isActive}
                        onCheckedChange={() => toggleType(type)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={updatePreferences.isPending}
          >
            {updatePreferences.isPending && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            Salvar Preferências
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
