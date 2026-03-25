import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, TrendingUp, Wrench, AlertTriangle, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

// =============================================
// Tipos e constantes de identidade visual
// =============================================
export type UpdateType = "update" | "improvement" | "fix" | "alert";

export const UPDATE_TYPE_CONFIG: Record<UpdateType, {
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  badgeClass: string;
  headerClass: string;
}> = {
  update: {
    label: "Atualizações",
    icon: RefreshCw,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    badgeClass: "bg-blue-500/20 text-blue-300 border-blue-500/40",
    headerClass: "text-blue-400 border-blue-500/30",
  },
  improvement: {
    label: "Melhorias",
    icon: TrendingUp,
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
    badgeClass: "bg-green-500/20 text-green-300 border-green-500/40",
    headerClass: "text-green-400 border-green-500/30",
  },
  fix: {
    label: "Correções",
    icon: Wrench,
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
    badgeClass: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    headerClass: "text-amber-400 border-amber-500/30",
  },
  alert: {
    label: "Alertas",
    icon: AlertTriangle,
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    badgeClass: "bg-red-500/20 text-red-300 border-red-500/40",
    headerClass: "text-red-400 border-red-500/30",
  },
};

const IMPACT_LEVELS = [
  { max: 3, label: "Baixo", color: "bg-green-500", textColor: "text-green-400" },
  { max: 6, label: "Médio", color: "bg-amber-500", textColor: "text-amber-400" },
  { max: 10, label: "Alto", color: "bg-red-500", textColor: "text-red-400" },
];

function getImpactInfo(level: number) {
  return IMPACT_LEVELS.find(l => level <= l.max) || IMPACT_LEVELS[2];
}

// =============================================
// Componente de Card de Update
// =============================================
interface SystemUpdate {
  id: string;
  type: UpdateType;
  title: string;
  content: string;
  affected_areas: string[];
  impact_level: number;
  published_at: string;
}

function UpdateCard({ update }: { update: SystemUpdate }) {
  const cfg = UPDATE_TYPE_CONFIG[update.type];
  const impact = getImpactInfo(update.impact_level);

  return (
    <div className={cn(
      "rounded-lg border p-4 space-y-3 transition-all",
      cfg.bgColor,
      cfg.borderColor
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className={cn("font-semibold text-sm leading-snug", cfg.color)}>
          {update.title}
        </h3>
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {format(new Date(update.published_at), "dd/MM/yyyy", { locale: ptBR })}
        </span>
      </div>

      {/* Content */}
      <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">
        {update.content}
      </p>

      {/* Footer: Areas + Impact */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {/* Affected areas */}
        {update.affected_areas?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {update.affected_areas.map((area) => (
              <span
                key={area}
                className={cn(
                  "text-[11px] px-2 py-0.5 rounded-full border font-medium",
                  cfg.badgeClass
                )}
              >
                {area}
              </span>
            ))}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Impact level */}
        {update.impact_level > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Impacto:</span>
            <div className="flex items-center gap-1">
              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full", impact.color)}
                  style={{ width: `${(update.impact_level / 10) * 100}%` }}
                />
              </div>
              <span className={cn("text-xs font-semibold", impact.textColor)}>
                {update.impact_level}/10
              </span>
              <span className={cn("text-[10px]", impact.textColor)}>
                ({impact.label})
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================
// Componente principal
// =============================================
const Reports = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: updates = [], isLoading } = useQuery({
    queryKey: ["system-updates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_updates" as any)
        .select("*")
        .order("published_at", { ascending: false });
      if (error) throw error;
      return (data || []) as SystemUpdate[];
    },
  });

  const { data: readIds = [] } = useQuery({
    queryKey: ["system-update-reads", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data } = await supabase
        .from("system_update_reads" as any)
        .select("update_id")
        .eq("user_id", user.id);
      return (data || []).map((r: any) => r.update_id as string);
    },
    enabled: !!user?.id,
  });

  // Marca todos não lidos como lidos ao abrir a página
  useEffect(() => {
    if (!user?.id || updates.length === 0) return;

    const readSet = new Set(readIds);
    const unread = updates.filter(u => !readSet.has(u.id));
    if (unread.length === 0) return;

    const rows = unread.map(u => ({ update_id: u.id, user_id: user.id }));
    supabase
      .from("system_update_reads" as any)
      .upsert(rows, { onConflict: "update_id,user_id", ignoreDuplicates: true })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["system-update-reads"] });
        queryClient.invalidateQueries({ queryKey: ["system-updates-unread"] });
      });
  }, [updates, readIds, user?.id, queryClient]);

  const grouped = useMemo(() => {
    const groups: Record<UpdateType, SystemUpdate[]> = {
      update: [],
      improvement: [],
      fix: [],
      alert: [],
    };
    updates.forEach(u => {
      if (groups[u.type]) groups[u.type].push(u);
    });
    return groups;
  }, [updates]);

  const ORDER: UpdateType[] = ["alert", "update", "improvement", "fix"];

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Megaphone className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Central de Atualizações</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe todas as novidades, melhorias e alertas da plataforma
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : updates.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma atualização publicada ainda.</p>
        </div>
      ) : (
        <Accordion type="multiple" defaultValue={ORDER.filter(t => grouped[t].length > 0)} className="space-y-3">
          {ORDER.map((type) => {
            const cfg = UPDATE_TYPE_CONFIG[type];
            const Icon = cfg.icon;
            const items = grouped[type];
            if (items.length === 0) return null;

            return (
              <AccordionItem
                key={type}
                value={type}
                className={cn(
                  "border rounded-xl overflow-hidden",
                  cfg.borderColor
                )}
              >
                <AccordionTrigger
                  className={cn(
                    "px-4 py-3 hover:no-underline",
                    cfg.bgColor,
                    "[&[data-state=open]]:rounded-b-none"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={cn("w-4 h-4", cfg.color)} />
                    <span className={cn("font-semibold text-sm", cfg.color)}>
                      {cfg.label}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] h-5 px-1.5", cfg.badgeClass)}
                    >
                      {items.length}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 pt-3 space-y-3">
                  {items.map(update => (
                    <UpdateCard key={update.id} update={update} />
                  ))}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
};

export default Reports;
