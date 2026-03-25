import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw,
  TrendingUp,
  Wrench,
  AlertTriangle,
  Plus,
  X,
  Sparkles,
  Loader2,
  Eye,
  ChevronLeft,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { UpdateType, UPDATE_TYPE_CONFIG } from "@/pages/Reports";

// =============================================
// Mapa de ícones e labels para o Select
// =============================================
const TYPE_OPTIONS: { value: UpdateType; label: string; icon: React.ElementType }[] = [
  { value: "update", label: "Atualização", icon: RefreshCw },
  { value: "improvement", label: "Melhoria", icon: TrendingUp },
  { value: "fix", label: "Correção", icon: Wrench },
  { value: "alert", label: "Alerta", icon: AlertTriangle },
];

const IMPACT_LEVELS = [
  { max: 3, label: "Baixo", color: "bg-green-500", textColor: "text-green-400" },
  { max: 6, label: "Médio", color: "bg-amber-500", textColor: "text-amber-400" },
  { max: 10, label: "Alto", color: "bg-red-500", textColor: "text-red-400" },
];

function getImpactInfo(level: number) {
  return IMPACT_LEVELS.find(l => level <= l.max) || IMPACT_LEVELS[2];
}

// =============================================
// Preview Card (igual ao exibido em /reports)
// =============================================
interface PreviewCardProps {
  type: UpdateType;
  title: string;
  content: string;
  affected_areas: string[];
  impact_level: number;
}

function PreviewCard({ type, title, content, affected_areas, impact_level }: PreviewCardProps) {
  const cfg = UPDATE_TYPE_CONFIG[type];
  const impact = getImpactInfo(impact_level);

  return (
    <div className={cn("rounded-lg border p-4 space-y-3", cfg.bgColor, cfg.borderColor)}>
      <div className="flex items-start justify-between gap-2">
        <h3 className={cn("font-semibold text-sm leading-snug", cfg.color)}>{title}</h3>
        <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
          {format(new Date(), "dd/MM/yyyy", { locale: ptBR })}
        </span>
      </div>
      <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{content}</p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {affected_areas.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {affected_areas.map((area) => (
              <span key={area} className={cn("text-[11px] px-2 py-0.5 rounded-full border font-medium", cfg.badgeClass)}>
                {area}
              </span>
            ))}
          </div>
        )}
        <div className="flex-1" />
        {impact_level > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Impacto:</span>
            <div className="flex items-center gap-1">
              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={cn("h-full rounded-full", impact.color)} style={{ width: `${(impact_level / 10) * 100}%` }} />
              </div>
              <span className={cn("text-xs font-semibold", impact.textColor)}>{impact_level}/10</span>
              <span className={cn("text-[10px]", impact.textColor)}>({impact.label})</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================
// Modal principal
// =============================================
interface SystemUpdateModalProps {
  open: boolean;
  onClose: () => void;
}

export function SystemUpdateModal({ open, onClose }: SystemUpdateModalProps) {
  const queryClient = useQueryClient();

  // Form state
  const [type, setType] = useState<UpdateType>("update");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [areaInput, setAreaInput] = useState("");
  const [affectedAreas, setAffectedAreas] = useState<string[]>([]);
  const [impactLevel, setImpactLevel] = useState(0);

  // UI state
  const [mode, setMode] = useState<"form" | "preview">("form");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);

  const cfg = UPDATE_TYPE_CONFIG[type];
  const impact = getImpactInfo(impactLevel);

  const handleClose = () => {
    setMode("form");
    setType("update");
    setTitle("");
    setContent("");
    setAffectedAreas([]);
    setAreaInput("");
    setImpactLevel(0);
    onClose();
  };

  const addArea = () => {
    const trimmed = areaInput.trim();
    if (trimmed && !affectedAreas.includes(trimmed)) {
      setAffectedAreas(prev => [...prev, trimmed]);
    }
    setAreaInput("");
  };

  const removeArea = (area: string) => {
    setAffectedAreas(prev => prev.filter(a => a !== area));
  };

  const handleAiReview = async () => {
    if (!title.trim() && !content.trim()) {
      toast.error("Preencha o título e conteúdo antes de revisar.");
      return;
    }
    setReviewLoading(true);
    try {
      const textToReview = [title.trim(), content.trim()].filter(Boolean).join("\n\n");
      const { data, error } = await supabase.functions.invoke("ai-suggest-response", {
        body: { mode: "fix", text: textToReview },
      });
      if (error || !data?.suggestion) throw new Error(error?.message || "Sem resposta da IA");

      // Separar resultado: primeira linha → título, resto → conteúdo
      const lines = data.suggestion.split("\n");
      const newTitle = lines[0] || title;
      const newContent = lines.slice(1).join("\n").trim() || content;
      setTitle(newTitle);
      setContent(newContent);
      toast.success("Texto revisado pela IA!");
    } catch (err: any) {
      toast.error("Erro na revisão: " + err.message);
    } finally {
      setReviewLoading(false);
    }
  };

  const handlePublishClick = () => {
    if (!title.trim()) { toast.error("Título é obrigatório."); return; }
    if (!content.trim()) { toast.error("Conteúdo é obrigatório."); return; }
    setMode("preview");
  };

  const handleApprove = async () => {
    setPublishLoading(true);
    try {
      const { error } = await supabase
        .from("system_updates" as any)
        .insert({
          type,
          title: title.trim(),
          content: content.trim(),
          affected_areas: affectedAreas,
          impact_level: impactLevel,
        });
      if (error) throw error;
      toast.success("Atualização publicada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["system-updates"] });
      queryClient.invalidateQueries({ queryKey: ["system-updates-unread"] });
      queryClient.invalidateQueries({ queryKey: ["system-updates-admin"] });
      handleClose();
    } catch (err: any) {
      toast.error("Erro ao publicar: " + err.message);
    } finally {
      setPublishLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto bg-gray-900 border-gray-700 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "preview" ? (
              <>
                <Eye className="w-5 h-5 text-primary" />
                Preview — como será exibido
              </>
            ) : (
              <>
                <Send className="w-5 h-5 text-primary" />
                Lançar Atualização
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* ─── MODO FORM ─── */}
        {mode === "form" && (
          <div className="space-y-5 mt-2">
            {/* Tipo */}
            <div className="space-y-1.5">
              <Label className="text-gray-300">Tipo de Atualização</Label>
              <Select value={type} onValueChange={(v) => setType(v as UpdateType)}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  {TYPE_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    return (
                      <SelectItem key={opt.value} value={opt.value} className="text-white focus:bg-gray-700">
                        <div className="flex items-center gap-2">
                          <Icon className={cn("w-4 h-4", UPDATE_TYPE_CONFIG[opt.value].color)} />
                          {opt.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Título */}
            <div className="space-y-1.5">
              <Label className="text-gray-300">Título</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex: Nova funcionalidade de relatórios"
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>

            {/* Conteúdo */}
            <div className="space-y-1.5">
              <Label className="text-gray-300">Conteúdo</Label>
              <Textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Descreva o que foi alterado, corrigido ou implementado..."
                rows={5}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 resize-none"
              />
            </div>

            {/* Áreas Afetadas */}
            <div className="space-y-1.5">
              <Label className="text-gray-300">Áreas Afetadas</Label>
              <div className="flex gap-2">
                <Input
                  value={areaInput}
                  onChange={e => setAreaInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addArea(); } }}
                  placeholder="Ex: CRM, Inbox, Relatórios..."
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addArea}
                  className="border-gray-600 text-gray-300 hover:bg-gray-700 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {affectedAreas.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {affectedAreas.map(area => (
                    <Badge
                      key={area}
                      variant="outline"
                      className={cn("gap-1 pr-1", cfg.badgeClass)}
                    >
                      {area}
                      <button
                        onClick={() => removeArea(area)}
                        className="ml-0.5 rounded-full hover:opacity-70 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Nível de Impacto */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-gray-300">Nível de Impacto</Label>
                <div className="flex items-center gap-1.5">
                  <span className={cn("font-bold text-sm", impact.textColor)}>
                    {impactLevel}/10
                  </span>
                  <span className={cn("text-xs", impact.textColor)}>
                    — {impact.label}
                  </span>
                </div>
              </div>
              <Slider
                min={0}
                max={10}
                step={1}
                value={[impactLevel]}
                onValueChange={([v]) => setImpactLevel(v)}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-gray-500 px-0.5">
                <span>Nenhum</span>
                <span>Crítico</span>
              </div>
            </div>

            {/* Ações */}
            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleAiReview}
                disabled={reviewLoading}
                className="border-gray-600 text-gray-300 hover:bg-gray-700"
              >
                {reviewLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2 text-yellow-400" />
                )}
                Revisão Ortográfica
              </Button>

              <Button
                onClick={handlePublishClick}
                className="bg-primary hover:bg-primary/90"
              >
                <Eye className="w-4 h-4 mr-2" />
                Visualizar Preview
              </Button>
            </div>
          </div>
        )}

        {/* ─── MODO PREVIEW ─── */}
        {mode === "preview" && (
          <div className="space-y-5 mt-2">
            <p className="text-sm text-gray-400">
              Assim a notificação será exibida na página <strong className="text-white">/reports</strong> para todos os usuários:
            </p>

            <PreviewCard
              type={type}
              title={title}
              content={content}
              affected_areas={affectedAreas}
              impact_level={impactLevel}
            />

            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setMode("form")}
                className="border-gray-600 text-gray-300 hover:bg-gray-700"
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Editar
              </Button>

              <Button
                onClick={handleApprove}
                disabled={publishLoading}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {publishLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Aprovar e Publicar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
