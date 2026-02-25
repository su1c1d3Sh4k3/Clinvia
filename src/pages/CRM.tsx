import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CreateFunnelModal } from "@/components/crm/CreateFunnelModal";
import { ManageStagesModal } from "@/components/crm/ManageStagesModal";
import { CreateDealModal } from "@/components/crm/CreateDealModal";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { CRMFilters } from "@/components/crm/CRMFilters";
import { CRMFunnel } from "@/types/crm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "react-router-dom";

const CRM = () => {
    const location = useLocation();
    const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const queryClient = useQueryClient();

    const { data: funnels, isLoading } = useQuery({
        queryKey: ["crm-funnels"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("crm_funnels" as any)
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data as unknown as CRMFunnel[];
        }
    });

    const [filters, setFilters] = useState<any>({
        tagId: null,
        responsibleId: null,
        dateRange: undefined,
        dateFilterType: 'all',
    });

    const deleteFunnelMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("crm_funnels" as any)
                .delete()
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["crm-funnels"] });
            setSelectedFunnelId(null);
            setDeleteDialogOpen(false);
            toast.success("Funil excluído com sucesso!");
        },
        onError: () => toast.error("Erro ao excluir funil"),
    });

    // Se vier ?funnel=ID da URL (ex: Dashboard), seleciona o funil correspondente
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const funnelFromUrl = params.get('funnel');
        if (funnelFromUrl) {
            setSelectedFunnelId(funnelFromUrl);
        }
    }, [location.search]);

    // Auto-select first funnel if none selected
    React.useEffect(() => {
        if (funnels && funnels.length > 0 && !selectedFunnelId) {
            setSelectedFunnelId(funnels[0].id);
        }
    }, [funnels, selectedFunnelId]);

    // DEBUG: Check current user ID
    React.useEffect(() => {
        const checkAuth = async () => {
            const { data } = await supabase.auth.getUser();
            console.log("Current User ID:", data.user?.id);
        };
        checkAuth();
    }, []);

    const selectedFunnel = funnels?.find(f => f.id === selectedFunnelId);

    return (
        <div className="px-3 md:px-6 pt-4 md:pt-6 h-screen flex flex-col overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4 md:mb-6 flex-shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <h1 className="text-xl md:text-2xl font-bold text-[#005AA8] dark:text-white">CRM</h1>
                    {funnels && funnels.length > 0 && (
                        <div className="flex gap-2">
                            <Select value={selectedFunnelId || ""} onValueChange={setSelectedFunnelId}>
                                <SelectTrigger className="w-full sm:w-[200px] md:w-[250px] h-8 md:h-9 text-sm bg-white dark:bg-transparent">
                                    <SelectValue placeholder="Selecione funil" />
                                </SelectTrigger>
                                <SelectContent>
                                    {funnels.map((funnel) => (
                                        <SelectItem key={funnel.id} value={funnel.id}>
                                            {funnel.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedFunnelId && (
                                <ManageStagesModal
                                    funnelId={selectedFunnelId}
                                    isSystemFunnel={selectedFunnel?.is_system ?? false}
                                />
                            )}
                            {/* Botão sem portal — AlertDialog é sempre montado separadamente */}
                            {selectedFunnel && !selectedFunnel.is_system && (
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-8 md:h-9 w-8 md:w-9 text-destructive border-destructive/30 hover:bg-destructive/10"
                                    onClick={() => setDeleteDialogOpen(true)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex gap-1 md:gap-2 items-center flex-wrap">
                    <CRMFilters filters={filters} onFiltersChange={setFilters} />
                    <CreateFunnelModal />
                    <CreateDealModal defaultFunnelId={selectedFunnelId || undefined} />
                </div>
            </div>

            {/* AlertDialog sempre montado fora de condicionais — evita conflito de portals
                do Radix UI ao trocar funil (erro removeChild) */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir funil?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta ação não pode ser desfeita. O funil "{selectedFunnel?.name}" e todas as suas negociações serão excluídos permanentemente.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (selectedFunnelId) deleteFunnelMutation.mutate(selectedFunnelId);
                            }}
                            className="bg-destructive hover:bg-destructive/90"
                            disabled={deleteFunnelMutation.isPending}
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-muted-foreground">Carregando funis...</p>
                </div>
            ) : !funnels || funnels.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-lg bg-muted/10">
                    <p className="text-muted-foreground mb-4">Nenhum funil encontrado. Crie seu primeiro funil para começar.</p>
                    <CreateFunnelModal />
                </div>
            ) : (
                <div className="flex-1 overflow-hidden">
                    {selectedFunnelId ? (
                        <KanbanBoard funnelId={selectedFunnelId} filters={filters} />
                    ) : (
                        <Card className="h-full">
                            <CardContent className="p-6 flex items-center justify-center h-full text-muted-foreground">
                                Selecione um funil para ver o quadro Kanban.
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}
        </div>
    );
};

export default CRM;
