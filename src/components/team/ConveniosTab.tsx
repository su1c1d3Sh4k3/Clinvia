import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Pencil, Trash2, HeartHandshake } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { ConvenioModal } from "@/components/team/ConvenioModal";
import {
    useConvenios, useDeactivateConvenio, useToggleCatchAll, type Convenio,
} from "@/hooks/useConvenios";

export function ConveniosTab() {
    const { toast } = useToast();
    const { canCreate, canEdit, canDelete } = usePermissions();
    const { data: convenios, isLoading } = useConvenios();
    const deactivate = useDeactivateConvenio();
    const toggleCatchAll = useToggleCatchAll();

    const [modalOpen, setModalOpen] = useState(false);
    const [selected, setSelected] = useState<Convenio | null>(null);

    const catchAll = (convenios || []).find((c) => c.is_catch_all) || null;
    const lista = (convenios || []).filter((c) => !c.is_catch_all);

    const openModal = (c: Convenio | null) => {
        setSelected(c);
        setModalOpen(true);
    };

    const handleToggleCatchAll = (enabled: boolean) => {
        toggleCatchAll.mutate(enabled, {
            onSuccess: () => toast({
                title: enabled
                    ? "Todos os convênios habilitados."
                    : "Habilitação geral desligada — voltam a valer os convênios da lista.",
            }),
            onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
        });
    };

    const handleRemove = (c: Convenio) => {
        if (!confirm(`Remover o convênio "${c.nome}"? Ele deixa de ser oferecido pela IA.`)) return;
        deactivate.mutate(c.id, {
            onSuccess: () => toast({ title: "Convênio removido." }),
            onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
        });
    };

    return (
        <div className="space-y-4" data-tour="convenios-lista">
            <p className="text-sm text-muted-foreground">
                Cadastre os convênios, marque os serviços atendidos e as salas que recebem cada um. O horário
                dedicado ao convênio é definido no cadastro da sala e sai das buscas de horário particular.
            </p>

            <div className="rounded-md border border-[#D4D5D6] dark:border-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <Label className="text-sm font-medium">Habilitar todos os convênios</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            A clínica atende qualquer convênio. A IA passa a responder
                            "Habilitado para todos os convênios" em vez de listar nomes.
                        </p>
                    </div>
                    <Switch
                        data-tour="convenios-todos"
                        checked={!!catchAll}
                        disabled={!canEdit("professionals") || toggleCatchAll.isPending}
                        onCheckedChange={handleToggleCatchAll}
                    />
                </div>

                {catchAll && (
                    <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 p-3">
                        <div className="min-w-0">
                            <p className="text-sm font-medium">Habilitado para todos os convênios</p>
                            <p className="text-xs text-muted-foreground truncate">
                                {catchAll.service_ids.length} serviço(s) apto(s)
                                {catchAll.descricao ? ` · ${catchAll.descricao}` : ""}
                            </p>
                        </div>
                        {canEdit("professionals") && (
                            <Button variant="outline" size="sm" onClick={() => openModal(catchAll)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Configurar
                            </Button>
                        )}
                    </div>
                )}
            </div>

            <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Convênios cadastrados</p>
                {canCreate("professionals") && (
                    <Button size="sm" onClick={() => openModal(null)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar Convênio
                    </Button>
                )}
            </div>

            {catchAll && (
                <p className="text-xs text-muted-foreground">
                    Com a habilitação geral ligada, a lista abaixo fica guardada mas não é usada pela IA.
                </p>
            )}

            <div className="rounded-md border border-[#D4D5D6] dark:border-border divide-y">
                {isLoading ? (
                    <div className="py-8 flex justify-center">
                        <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                ) : lista.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground text-sm">Nenhum convênio cadastrado.</p>
                ) : (
                    lista.map((c) => (
                        <div key={c.id} className="flex items-center gap-3 p-3">
                            <HeartHandshake className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{c.nome}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                    {c.service_ids.length} serviço(s) · {c.sala_ids.length} sala(s)
                                    {c.descricao ? ` · ${c.descricao}` : ""}
                                </p>
                            </div>
                            {canEdit("professionals") && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openModal(c)}>
                                    <Pencil className="h-4 w-4" />
                                </Button>
                            )}
                            {canDelete("professionals") && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                    onClick={() => handleRemove(c)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    ))
                )}
            </div>

            <ConvenioModal open={modalOpen} onOpenChange={setModalOpen} convenio={selected} />
        </div>
    );
}
