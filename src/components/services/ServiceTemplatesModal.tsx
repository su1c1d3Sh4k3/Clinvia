// Modal do botão "Utilizar templates" (/products-services): espelha a exibição
// da página (categoria colapsável → abas de serviço → tabela de aplicações),
// só que tudo é rascunho editável com checkbox em cascata. Nada vai para o
// banco antes do botão "Importar".
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Loader2, Minus, Pencil } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useOwnerId } from "@/hooks/useOwnerId";
import { CatalogCategory, useServiceCatalog } from "@/hooks/useServiceCatalog";
import { ServiceName } from "@/types/services";
import { EditServiceModal, ServiceDraftPayload } from "./EditServiceModal";
import {
  importServiceTemplates,
  TemplateImportCategory,
} from "@/lib/importServiceTemplates";

type Casing = "upper" | "normal";

interface AppDraft {
  id: string;
  checked: boolean;
  nameUpper: string;
  nameNormal: string;
  nameOverride: string | null;
  description: string;
  price: number;
  minPrice: number | null;
  expiryMonths: number | null;
  sessionInterval: number | null;
  durationMinutes: number | null;
  commissionPct: number;
}

interface SvcDraft {
  id: string;
  nameUpper: string;
  nameNormal: string;
  nameOverride: string | null;
  description: string;
  recurrence: boolean;
  time_recurrence_1: number | null;
  time_recurrence_2: number | null;
  time_recurrence_3: number | null;
  recurrence_discount_pct_1: number | null;
  recurrence_discount_pct_2: number | null;
  recurrence_discount_pct_3: number | null;
  msg_recurrence_1: string | null;
  msg_recurrence_2: string | null;
  msg_recurrence_3: string | null;
  applications: AppDraft[];
}

interface CatDraft {
  id: string;
  nameUpper: string;
  nameNormal: string;
  nameOverride: string | null;
  categoryType: "standard" | "direct";
  services: SvcDraft[];
}

// Campos numéricos da tabela de aplicações: caixa estreita (as setinhas de
// incremento do input number são escondidas, senão comem metade do espaço).
const NUM_INPUT =
  "h-9 px-1 text-xs text-center [appearance:textfield] " +
  "[&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

const buildDrafts = (catalog: CatalogCategory[]): CatDraft[] =>
  catalog.map((cat) => ({
    id: cat.id,
    nameUpper: cat.name_upper,
    nameNormal: cat.name_normal,
    nameOverride: null,
    categoryType: cat.category_type,
    services: cat.services.map((svc) => ({
      id: svc.id,
      nameUpper: svc.name_upper,
      nameNormal: svc.name_normal,
      nameOverride: null,
      description: svc.description || "",
      recurrence: svc.recurrence,
      time_recurrence_1: svc.time_recurrence_1,
      time_recurrence_2: svc.time_recurrence_2,
      time_recurrence_3: svc.time_recurrence_3,
      recurrence_discount_pct_1: svc.recurrence_discount_pct_1,
      recurrence_discount_pct_2: svc.recurrence_discount_pct_2,
      recurrence_discount_pct_3: svc.recurrence_discount_pct_3,
      msg_recurrence_1: null,
      msg_recurrence_2: null,
      msg_recurrence_3: null,
      applications: svc.applications.map((app) => ({
        id: app.id,
        checked: true,
        nameUpper: app.name_upper,
        nameNormal: app.name_normal,
        nameOverride: null,
        description: app.description || "",
        price: app.price,
        minPrice: app.min_price,
        expiryMonths: app.expiry_months,
        sessionInterval: app.session_interval,
        durationMinutes: app.duration_minutes,
        commissionPct: 0,
      })),
    })),
  }));

/** Checkbox em <span> — vai dentro do TabsTrigger, que já é um <button>. */
const TriCheck = ({
  state,
  onToggle,
  title,
}: {
  state: boolean | "indeterminate";
  onToggle: () => void;
  title: string;
}) => (
  <span
    role="checkbox"
    aria-checked={state === true}
    tabIndex={0}
    title={title}
    className={cn(
      "w-4 h-4 shrink-0 rounded-sm border flex items-center justify-center",
      state === false ? "border-input" : "border-primary bg-primary text-primary-foreground",
    )}
    onClick={(e) => {
      e.stopPropagation();
      onToggle();
    }}
    onKeyDown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }
    }}
  >
    {state === true && <Check className="w-3 h-3" />}
    {state === "indeterminate" && <Minus className="w-3 h-3" />}
  </span>
);

interface ServiceTemplatesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ServiceTemplatesModal = ({ open, onOpenChange }: ServiceTemplatesModalProps) => {
  const { data: ownerId } = useOwnerId();
  const queryClient = useQueryClient();
  const { data: catalog, isLoading } = useServiceCatalog(open);

  const [casing, setCasing] = useState<Casing>("normal");
  const [drafts, setDrafts] = useState<CatDraft[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ catId: string; svcId: string; service: ServiceName } | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (open && catalog) {
      setDrafts(buildDrafts(catalog));
      setExpanded(new Set());
      setRenaming(null);
      setEditing(null);
      setCasing("normal");
    }
  }, [open, catalog]);

  const nameOf = (d: { nameUpper: string; nameNormal: string; nameOverride: string | null }) =>
    d.nameOverride ?? (casing === "upper" ? d.nameUpper : d.nameNormal);

  const updateApps = (
    catId: string,
    predicate: (svc: SvcDraft, app: AppDraft) => boolean,
    checked: boolean,
  ) =>
    setDrafts((prev) =>
      prev.map((cat) =>
        cat.id !== catId
          ? cat
          : {
              ...cat,
              services: cat.services.map((svc) => ({
                ...svc,
                applications: svc.applications.map((app) =>
                  predicate(svc, app) ? { ...app, checked } : app,
                ),
              })),
            },
      ),
    );

  const patchApp = (catId: string, svcId: string, appId: string, patch: Partial<AppDraft>) =>
    setDrafts((prev) =>
      prev.map((cat) =>
        cat.id !== catId
          ? cat
          : {
              ...cat,
              services: cat.services.map((svc) =>
                svc.id !== svcId
                  ? svc
                  : {
                      ...svc,
                      applications: svc.applications.map((app) =>
                        app.id === appId ? { ...app, ...patch } : app,
                      ),
                    },
              ),
            },
      ),
    );

  const stateOf = (apps: AppDraft[]): boolean | "indeterminate" => {
    if (apps.length === 0) return false;
    const checked = apps.filter((a) => a.checked).length;
    if (checked === 0) return false;
    if (checked === apps.length) return true;
    return "indeterminate";
  };

  const catApps = (cat: CatDraft) => cat.services.flatMap((s) => s.applications);

  const totalSelected = useMemo(
    () => drafts.reduce((sum, cat) => sum + catApps(cat).filter((a) => a.checked).length, 0),
    [drafts],
  );

  const openServiceEditor = (cat: CatDraft, svc: SvcDraft) => {
    setEditing({
      catId: cat.id,
      svcId: svc.id,
      service: {
        id: svc.id,
        category_id: cat.id,
        name: nameOf(svc),
        description: svc.description || null,
        user_id: null,
        created_at: "",
        recurrence: svc.recurrence,
        time_recurrence_1: svc.time_recurrence_1,
        time_recurrence_2: svc.time_recurrence_2,
        time_recurrence_3: svc.time_recurrence_3,
        recurrence_discount_pct_1: svc.recurrence_discount_pct_1,
        recurrence_discount_pct_2: svc.recurrence_discount_pct_2,
        recurrence_discount_pct_3: svc.recurrence_discount_pct_3,
        msg_recurrence_1: svc.msg_recurrence_1,
        msg_recurrence_2: svc.msg_recurrence_2,
        msg_recurrence_3: svc.msg_recurrence_3,
      },
    });
  };

  const applyServiceDraft = (payload: ServiceDraftPayload) => {
    if (!editing) return;
    const { catId, svcId } = editing;
    setDrafts((prev) =>
      prev.map((cat) =>
        cat.id !== catId
          ? cat
          : {
              ...cat,
              services: cat.services.map((svc) =>
                svc.id !== svcId
                  ? svc
                  : {
                      ...svc,
                      nameOverride: payload.name,
                      description: payload.description,
                      recurrence: payload.recurrence,
                      time_recurrence_1: payload.time_recurrence_1,
                      time_recurrence_2: payload.time_recurrence_2,
                      time_recurrence_3: payload.time_recurrence_3,
                      recurrence_discount_pct_1: payload.recurrence_discount_pct_1,
                      recurrence_discount_pct_2: payload.recurrence_discount_pct_2,
                      recurrence_discount_pct_3: payload.recurrence_discount_pct_3,
                      msg_recurrence_1: payload.msg_recurrence_1 || null,
                      msg_recurrence_2: payload.msg_recurrence_2 || null,
                      msg_recurrence_3: payload.msg_recurrence_3 || null,
                    },
              ),
            },
      ),
    );
    setEditing(null);
  };

  const handleImport = async () => {
    if (!ownerId) return;
    if (totalSelected === 0) {
      toast.error("Selecione ao menos uma aplicação");
      return;
    }
    setImporting(true);
    try {
      const payload: TemplateImportCategory[] = drafts
        .map((cat) => ({
          name: nameOf(cat),
          categoryType: cat.categoryType,
          services: cat.services
            .map((svc) => ({
              name: nameOf(svc),
              description: svc.description || null,
              recurrence: svc.recurrence,
              time_recurrence_1: svc.time_recurrence_1,
              time_recurrence_2: svc.time_recurrence_2,
              time_recurrence_3: svc.time_recurrence_3,
              recurrence_discount_pct_1: svc.recurrence_discount_pct_1,
              recurrence_discount_pct_2: svc.recurrence_discount_pct_2,
              recurrence_discount_pct_3: svc.recurrence_discount_pct_3,
              msg_recurrence_1: svc.msg_recurrence_1,
              msg_recurrence_2: svc.msg_recurrence_2,
              msg_recurrence_3: svc.msg_recurrence_3,
              applications: svc.applications
                .filter((app) => app.checked)
                .map((app) => ({
                  name: nameOf(app),
                  description: app.description || null,
                  price: app.price,
                  minPrice: app.minPrice,
                  expiryMonths: app.expiryMonths,
                  sessionInterval: app.sessionInterval,
                  durationMinutes: app.durationMinutes,
                  commissionPct: app.commissionPct,
                })),
            }))
            .filter((svc) => svc.applications.length > 0),
        }))
        .filter((cat) => cat.services.length > 0);

      const result = await importServiceTemplates(ownerId, payload);

      queryClient.invalidateQueries({ queryKey: ["services-categories"] });
      queryClient.invalidateQueries({ queryKey: ["service-names-all"] });
      queryClient.invalidateQueries({ queryKey: ["service-names"] });
      queryClient.invalidateQueries({ queryKey: ["services-client"] });
      queryClient.invalidateQueries({ queryKey: ["recurrence-template-badges"] });

      toast.success(`${result.applicationsCreated} aplicações importadas`, {
        description:
          result.applicationsSkipped > 0
            ? `${result.applicationsSkipped} já existiam e foram mantidas como estavam.`
            : undefined,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao importar: " + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Dialog open={open && !editing} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] max-w-[1840px] max-h-[90vh] overflow-y-auto rounded-lg">
          <DialogHeader>
            <DialogTitle>Utilizar templates</DialogTitle>
            <DialogDescription>
              Escolha o que importar e ajuste os dados antes de salvar. Nada é gravado até
              você clicar em Importar. Categorias e serviços que você já tem são
              reaproveitados — nada é substituído.
            </DialogDescription>
          </DialogHeader>

          {/* Caixa de padronização de nomes */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2">
            <div>
              <Label className="text-sm">Como importar os nomes</Label>
              <p className="text-xs text-muted-foreground">
                Vale para categorias, serviços e aplicações. Não altera as descrições.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                type="button"
                size="sm"
                variant={casing === "upper" ? "default" : "outline"}
                onClick={() => setCasing("upper")}
              >
                MAIÚSCULAS
              </Button>
              <Button
                type="button"
                size="sm"
                variant={casing === "normal" ? "default" : "outline"}
                onClick={() => setCasing("normal")}
              >
                Normal
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : drafts.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              Nenhum template disponível no momento.
            </div>
          ) : (
            // min-w-0: DialogContent é grid e o filho nasce com min-width:auto —
            // sem isso a faixa de abas de uma categoria com muitos serviços
            // (ex.: "Equipamento sem consumível") estica a coluna do grid, o
            // conteúdo vaza pra fora do modal e o overflow-x-auto das abas nunca
            // chega a rolar (por isso a barrinha de hover não aparecia).
            <div className="space-y-3 min-w-0">
              {drafts.map((cat) => {
                const apps = catApps(cat);
                const isOpen = expanded.has(cat.id);
                return (
                  <div key={cat.id} className="border rounded-lg overflow-hidden bg-card min-w-0">
                    <div className="w-full flex items-center gap-3 px-4 py-3">
                      <Checkbox
                        checked={stateOf(apps)}
                        onCheckedChange={() =>
                          updateApps(cat.id, () => true, stateOf(apps) !== true)
                        }
                      />
                      {renaming === cat.id ? (
                        <Input
                          autoFocus
                          className="h-8 max-w-xs"
                          value={nameOf(cat)}
                          onChange={(e) =>
                            setDrafts((prev) =>
                              prev.map((c) =>
                                c.id === cat.id ? { ...c, nameOverride: e.target.value } : c,
                              ),
                            )
                          }
                          onBlur={() => setRenaming(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Escape") setRenaming(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="flex-1 flex items-center gap-3 text-left"
                          onClick={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(cat.id)) next.delete(cat.id);
                              else next.add(cat.id);
                              return next;
                            })
                          }
                        >
                          <div className="w-2 h-2 rounded-full bg-primary" />
                          <h3 className="text-base font-semibold">{nameOf(cat)}</h3>
                          <span className="text-xs text-muted-foreground">
                            {cat.services.length} serviço{cat.services.length !== 1 ? "s" : ""} ·{" "}
                            {apps.filter((a) => a.checked).length}/{apps.length} aplicações
                          </span>
                        </button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        title="Renomear categoria"
                        onClick={() => setRenaming(cat.id)}
                      >
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      <ChevronDown
                        className={cn(
                          "w-5 h-5 text-muted-foreground transition-transform shrink-0",
                          isOpen && "rotate-180",
                        )}
                      />
                    </div>

                    {isOpen && cat.services.length > 0 && (
                      <div className="border-t px-4 py-3 min-w-0 overflow-hidden">
                        <Tabs defaultValue={cat.services[0].id} className="w-full min-w-0">
                          <TabsList className="nav-scrollbar flex h-auto w-full max-w-full justify-start overflow-x-auto flex-nowrap pb-2.5">
                            {cat.services.map((svc) => (
                              <TabsTrigger
                                key={svc.id}
                                value={svc.id}
                                className="text-sm gap-1.5 shrink-0"
                              >
                                <TriCheck
                                  state={stateOf(svc.applications)}
                                  title="Selecionar serviço"
                                  onToggle={() =>
                                    updateApps(
                                      cat.id,
                                      (s) => s.id === svc.id,
                                      stateOf(svc.applications) !== true,
                                    )
                                  }
                                />
                                {nameOf(svc)}
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className="p-0.5 rounded hover:bg-accent"
                                  title="Editar serviço"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openServiceEditor(cat, svc);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      openServiceEditor(cat, svc);
                                    }
                                  }}
                                >
                                  <Pencil className="w-3 h-3 text-muted-foreground" />
                                </span>
                              </TabsTrigger>
                            ))}
                          </TabsList>

                          {cat.services.map((svc) => (
                            <TabsContent key={svc.id} value={svc.id} className="mt-4">
                              <div className="rounded-md border">
                                <Table className="table-fixed">
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-[44px] px-2" />
                                      <TableHead className="px-2">Nome</TableHead>
                                      <TableHead className="px-2">Descrição</TableHead>
                                      <TableHead className="w-[86px] px-2 text-xs whitespace-nowrap">Valor</TableHead>
                                      <TableHead className="w-[96px] px-2 text-xs whitespace-nowrap">Preço Mín.</TableHead>
                                      <TableHead className="w-[98px] px-2 text-xs whitespace-nowrap">Retorno (m)</TableHead>
                                      <TableHead className="w-[96px] px-2 text-xs whitespace-nowrap">Tempo (min)</TableHead>
                                      <TableHead className="w-[104px] px-2 text-xs whitespace-nowrap">Comissão (%)</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {svc.applications.map((app) => (
                                      <TableRow key={app.id}>
                                        <TableCell className="p-2 align-top pt-4">
                                          <Checkbox
                                            checked={app.checked}
                                            onCheckedChange={(v) =>
                                              patchApp(cat.id, svc.id, app.id, {
                                                checked: v === true,
                                              })
                                            }
                                          />
                                        </TableCell>
                                        <TableCell className="p-2 align-top">
                                          <Textarea
                                            rows={2}
                                            className="nav-scrollbar min-h-[56px] text-sm resize-none px-2 py-1.5 leading-snug"
                                            value={nameOf(app)}
                                            onChange={(e) =>
                                              patchApp(cat.id, svc.id, app.id, {
                                                nameOverride: e.target.value,
                                              })
                                            }
                                          />
                                        </TableCell>
                                        <TableCell className="p-2 align-top">
                                          <Textarea
                                            rows={2}
                                            className="nav-scrollbar min-h-[56px] text-sm resize-none px-2 py-1.5 leading-snug"
                                            value={app.description}
                                            placeholder="Descrição..."
                                            onChange={(e) =>
                                              patchApp(cat.id, svc.id, app.id, {
                                                description: e.target.value,
                                              })
                                            }
                                          />
                                        </TableCell>
                                        <TableCell className="p-2 align-top">
                                          <Input
                                            className={cn(NUM_INPUT, "w-[62px]")}
                                            type="number"
                                            step="0.01"
                                            value={app.price}
                                            onChange={(e) =>
                                              patchApp(cat.id, svc.id, app.id, {
                                                price: parseFloat(e.target.value) || 0,
                                              })
                                            }
                                          />
                                        </TableCell>
                                        <TableCell className="p-2 align-top">
                                          <Input
                                            className={cn(NUM_INPUT, "w-[62px]")}
                                            type="number"
                                            step="0.01"
                                            value={app.minPrice ?? ""}
                                            onChange={(e) =>
                                              patchApp(cat.id, svc.id, app.id, {
                                                minPrice: e.target.value
                                                  ? parseFloat(e.target.value)
                                                  : null,
                                              })
                                            }
                                          />
                                        </TableCell>
                                        <TableCell className="p-2 align-top">
                                          <Input
                                            className={cn(NUM_INPUT, "w-[40px]")}
                                            type="number"
                                            value={app.expiryMonths ?? ""}
                                            onChange={(e) =>
                                              patchApp(cat.id, svc.id, app.id, {
                                                expiryMonths: e.target.value
                                                  ? parseInt(e.target.value)
                                                  : null,
                                              })
                                            }
                                          />
                                        </TableCell>
                                        <TableCell className="p-2 align-top">
                                          <Input
                                            className={cn(NUM_INPUT, "w-[40px]")}
                                            type="number"
                                            value={app.durationMinutes ?? ""}
                                            onChange={(e) =>
                                              patchApp(cat.id, svc.id, app.id, {
                                                durationMinutes: e.target.value
                                                  ? parseInt(e.target.value)
                                                  : null,
                                              })
                                            }
                                          />
                                        </TableCell>
                                        <TableCell className="p-2 align-top">
                                          <Input
                                            className={cn(NUM_INPUT, "w-[40px]")}
                                            type="number"
                                            step="0.1"
                                            value={app.commissionPct}
                                            onChange={(e) =>
                                              patchApp(cat.id, svc.id, app.id, {
                                                commissionPct: parseFloat(e.target.value) || 0,
                                              })
                                            }
                                          />
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </TabsContent>
                          ))}
                        </Tabs>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={importing || totalSelected === 0}>
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                `Importar ${totalSelected} aplicação${totalSelected !== 1 ? "ões" : ""}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditServiceModal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        service={editing?.service ?? null}
        onSaveDraft={applyServiceDraft}
      />
    </>
  );
};
