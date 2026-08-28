// @ts-nocheck - system_updates ainda não está nos types gerados
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Plus } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { SystemUpdateModal } from "@/components/admin/SystemUpdateModal";
import { UPDATE_TYPE_CONFIG, UpdateType } from "@/pages/Reports";

export default function AdminUpdates({ canEdit }: { canEdit: boolean }) {
    const [showUpdateModal, setShowUpdateModal] = useState(false);

    const { data: adminSystemUpdates = [], isLoading: loadingUpdates } = useQuery({
        queryKey: ["system-updates-admin"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("system_updates" as any)
                .select("*")
                .order("published_at", { ascending: false });
            if (error) throw error;
            return (data || []) as any[];
        },
    });

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-blue-400 flex items-center gap-2">
                    <Megaphone className="w-5 h-5" />
                    Atualizações Publicadas ({adminSystemUpdates.length})
                </h3>
                {canEdit && (
                    <Button
                        onClick={() => setShowUpdateModal(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Lançar Notificação
                    </Button>
                )}
            </div>

            {loadingUpdates ? (
                <div className="text-center py-12 text-gray-400">Carregando...</div>
            ) : adminSystemUpdates.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                    <Megaphone className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Nenhuma atualização publicada</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {adminSystemUpdates.map((update: any) => {
                        const cfg = UPDATE_TYPE_CONFIG[update.type as UpdateType];
                        const Icon = cfg?.icon || Megaphone;
                        return (
                            <div key={update.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center gap-4">
                                <div className={`p-2 rounded-lg ${cfg?.bgColor || 'bg-gray-700'}`}>
                                    <Icon className={`w-4 h-4 ${cfg?.color || 'text-gray-400'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-white truncate">{update.title}</p>
                                    <p className="text-xs text-gray-400">
                                        {cfg?.label || update.type} · {format(new Date(update.published_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                        {update.affected_areas?.length > 0 && ` · Áreas: ${update.affected_areas.join(', ')}`}
                                    </p>
                                </div>
                                <Badge variant="outline" className={`shrink-0 ${cfg?.badgeClass || ''}`}>
                                    Impacto {update.impact_level}/10
                                </Badge>
                            </div>
                        );
                    })}
                </div>
            )}

            <SystemUpdateModal
                open={showUpdateModal}
                onClose={() => setShowUpdateModal(false)}
            />
        </div>
    );
}
