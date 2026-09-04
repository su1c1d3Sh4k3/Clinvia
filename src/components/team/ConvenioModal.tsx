import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useOwnerId } from "@/hooks/useOwnerId";
import { ServiceCategoryPicker } from "@/components/services/ServiceCategoryPicker";
import { useAvaliacaoServiceIds, useSaveConvenio, type Convenio } from "@/hooks/useConvenios";

interface ConvenioModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    convenio: Convenio | null;
}

export function ConvenioModal({ open, onOpenChange, convenio }: ConvenioModalProps) {
    const { toast } = useToast();
    const { data: ownerId } = useOwnerId();
    const save = useSaveConvenio();
    // Avaliação é coberta por todo convênio (trigger no banco): fica travada aqui
    // para o salvar, que troca a lista inteira de vínculos, não desfazer o padrão.
    const { data: avaliacaoIds } = useAvaliacaoServiceIds();

    const [nome, setNome] = useState("");
    const [descricao, setDescricao] = useState("");
    const [serviceIds, setServiceIds] = useState<string[]>([]);
    const [salaIds, setSalaIds] = useState<string[]>([]);

    useEffect(() => {
        if (!open) return;
        setNome(convenio?.is_catch_all ? "" : convenio?.nome ?? "");
        setDescricao(convenio?.descricao ?? "");
        setServiceIds(convenio?.service_ids ?? []);
        setSalaIds(convenio?.sala_ids ?? []);
    }, [open, convenio]);

    // Só salas que atendem convênio podem ser atreladas — a janela dedicada vive nelas
    const { data: salas } = useQuery({
        queryKey: ["convenio-salas-options", ownerId],
        enabled: !!ownerId && open,
        queryFn: async () => {
            const { data, error } = await supabase.from("professionals" as any)
                .select("id, name, convenio_enabled, convenio_all")
                .eq("user_id", ownerId!)
                .eq("active", true)
                .order("name");
            if (error) throw error;
            return (data || []) as Array<{ id: string; name: string; convenio_enabled: boolean; convenio_all: boolean }>;
        },
    });

    const isCatchAll = !!convenio?.is_catch_all;
    const elegiveis = (salas || []).filter((s) => s.convenio_enabled);

    const handleSave = () => {
        if (!isCatchAll && !nome.trim()) {
            toast({ title: "Informe o nome do convênio.", variant: "destructive" });
            return;
        }
        save.mutate(
            {
                id: convenio?.id,
                nome: isCatchAll ? convenio!.nome : nome.trim(),
                descricao: descricao.trim() || null,
                service_ids: [...new Set([...serviceIds, ...(avaliacaoIds || [])])],
                sala_ids: salaIds,
            },
            {
                onSuccess: () => {
                    toast({ title: convenio ? "Convênio atualizado." : "Convênio cadastrado." });
                    onOpenChange(false);
                },
                onError: (e: any) => toast({
                    title: "Não foi possível salvar",
                    description: e.message?.includes("convenios_user_nome_uniq")
                        ? "Já existe um convênio com esse nome nesta conta."
                        : e.message,
                    variant: "destructive",
                }),
            },
        );
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] sm:w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg">
                <DialogHeader>
                    <DialogTitle>
                        {isCatchAll ? "Habilitado para todos os convênios" : convenio ? "Editar convênio" : "Novo convênio"}
                    </DialogTitle>
                    <DialogDescription>
                        Marque os serviços atendidos e as salas que recebem esse convênio. A IA só oferece
                        horário de convênio para serviços marcados aqui.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {!isCatchAll && (
                        <div className="space-y-1.5">
                            <Label htmlFor="convenio-nome">Nome</Label>
                            <Input
                                id="convenio-nome"
                                value={nome}
                                onChange={(e) => setNome(e.target.value)}
                                placeholder="Ex.: Unimed"
                            />
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="convenio-desc">Descrição (opcional)</Label>
                        <Textarea
                            id="convenio-desc"
                            value={descricao}
                            onChange={(e) => setDescricao(e.target.value)}
                            rows={3}
                            placeholder="Regras, carência, coparticipação — a IA usa este texto na conversa."
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label>Serviços aptos ao convênio</Label>
                        <ServiceCategoryPicker
                            value={serviceIds}
                            onChange={setServiceIds}
                            lockedIds={avaliacaoIds || []}
                        />
                        <p className="text-xs text-muted-foreground">
                            As avaliações entram em todo convênio automaticamente e não podem ser desmarcadas.
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Salas que atendem este convênio</Label>
                        {elegiveis.length === 0 ? (
                            <p className="text-xs text-muted-foreground border rounded-xl p-3">
                                Nenhuma sala com atendimento de convênio ligado. Ative "Atendimento de Convênio"
                                no cadastro da sala em Equipe &gt; Salas.
                            </p>
                        ) : (
                            <div className="max-h-48 overflow-y-auto border rounded-xl divide-y">
                                {elegiveis.map((s) => (
                                    <label key={s.id} className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/40">
                                        <Checkbox
                                            checked={s.convenio_all || salaIds.includes(s.id)}
                                            disabled={s.convenio_all}
                                            onCheckedChange={() => setSalaIds((prev) =>
                                                prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id])}
                                        />
                                        <span className="text-sm flex-1">{s.name}</span>
                                        {s.convenio_all && (
                                            <span className="text-[10px] text-muted-foreground">atende todos os convênios</span>
                                        )}
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={save.isPending}>
                        {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Salvar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
