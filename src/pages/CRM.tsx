import React, { useState } from 'react';
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CreateFunnelModal } from "@/components/crm/CreateFunnelModal";
import { ManageStagesModal } from "@/components/crm/ManageStagesModal";
import { CreateDealModal } from "@/components/crm/CreateDealModal";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { CRMFilters } from "@/components/crm/CRMFilters";
import { CRMFunnel } from "@/types/crm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

const CRM = () => {
    const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);

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
            // toast.info(`User ID: ${data.user?.id}`); // Uncomment to see on screen
        };
        checkAuth();
    }, []);

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
                            {selectedFunnelId && <ManageStagesModal funnelId={selectedFunnelId} />}
                        </div>
                    )}
                </div>
                <div className="flex gap-1 md:gap-2 items-center flex-wrap">
                    <CRMFilters filters={filters} onFiltersChange={setFilters} />
                    <CreateFunnelModal />
                    <CreateDealModal defaultFunnelId={selectedFunnelId || undefined} />
                </div>
            </div>

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
