import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { PERMISSION_FEATURES, DEFAULT_PERMISSIONS, PermissionFeature, PermissionSet } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Shield, Users, Save } from "lucide-react";
import { toast } from "sonner";

type RoleKey = "supervisor" | "agent";

type PermissionsState = Record<PermissionFeature, PermissionSet>;

const buildDefaultState = (role: RoleKey): PermissionsState =>
    Object.fromEntries(
        PERMISSION_FEATURES.map(f => [f.key, { ...DEFAULT_PERMISSIONS[role][f.key] }])
    ) as PermissionsState;

const mergeWithCustom = (
    role: RoleKey,
    customRows: { role: string; feature: string; can_create: boolean; can_edit: boolean; can_delete: boolean }[]
): PermissionsState => {
    const base = buildDefaultState(role);
    for (const row of customRows.filter(r => r.role === role)) {
        if (row.feature in base) {
            (base as any)[row.feature] = {
                can_create: row.can_create,
                can_edit: row.can_edit,
                can_delete: row.can_delete,
            };
        }
    }
    return base;
};

export function PermissionsSettings() {
    const { data: ownerId } = useOwnerId();
    const queryClient = useQueryClient();
    const [supervisorOpen, setSupervisorOpen] = useState(true);
    const [agentOpen, setAgentOpen] = useState(false);
    const [savingRole, setSavingRole] = useState<RoleKey | null>(null);

    const { data: customRows = [], isLoading } = useQuery({
        queryKey: ["custom_permissions_admin", ownerId],
        queryFn: async () => {
            if (!ownerId) return [];
            const { data, error } = await supabase
                .from("custom_permissions" as any)
                .select("role, feature, can_create, can_edit, can_delete")
                .eq("user_id", ownerId);
            if (error) throw error;
            return (data || []) as { role: string; feature: string; can_create: boolean; can_edit: boolean; can_delete: boolean }[];
        },
        enabled: !!ownerId,
    });

    const [supervisorPerms, setSupervisorPerms] = useState<PermissionsState | null>(null);
    const [agentPerms, setAgentPerms] = useState<PermissionsState | null>(null);

    // Initialize local state from fetched data (only once)
    const resolvedSupervisor = supervisorPerms ?? mergeWithCustom("supervisor", customRows);
    const resolvedAgent = agentPerms ?? mergeWithCustom("agent", customRows);

    const handleToggle = (role: RoleKey, feature: PermissionFeature, field: keyof PermissionSet, value: boolean) => {
        if (role === "supervisor") {
            setSupervisorPerms(prev => {
                const base = prev ?? mergeWithCustom("supervisor", customRows);
                return { ...base, [feature]: { ...base[feature], [field]: value } };
            });
        } else {
            setAgentPerms(prev => {
                const base = prev ?? mergeWithCustom("agent", customRows);
                return { ...base, [feature]: { ...base[feature], [field]: value } };
            });
        }
    };

    const handleSave = async (role: RoleKey) => {
        if (!ownerId) return;
        const perms = role === "supervisor" ? resolvedSupervisor : resolvedAgent;
        setSavingRole(role);
        try {
            const rows = PERMISSION_FEATURES.map(f => ({
                user_id: ownerId,
                role,
                feature: f.key,
                can_create: perms[f.key].can_create,
                can_edit: perms[f.key].can_edit,
                can_delete: perms[f.key].can_delete,
                updated_at: new Date().toISOString(),
            }));
            const { error } = await supabase
                .from("custom_permissions" as any)
                .upsert(rows, { onConflict: "user_id,role,feature" });
            if (error) throw error;
            queryClient.invalidateQueries({ queryKey: ["custom_permissions_admin", ownerId] });
            queryClient.invalidateQueries({ queryKey: ["custom_permissions"] });
            toast.success(`Permissões de ${role === "supervisor" ? "Supervisor" : "Agente"} salvas com sucesso!`);
        } catch (err: any) {
            toast.error("Erro ao salvar permissões: " + err.message);
        } finally {
            setSavingRole(null);
        }
    };

    if (isLoading) {
        return <div className="py-8 text-center text-muted-foreground text-sm">Carregando permissões...</div>;
    }

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Personalize o que cada role pode criar, editar ou deletar em cada módulo.
                As configurações padrão refletem o comportamento atual do sistema.
            </p>

            {/* Supervisor block */}
            <Collapsible open={supervisorOpen} onOpenChange={setSupervisorOpen}>
                <CollapsibleTrigger asChild>
                    <button className="flex w-full items-center justify-between rounded-lg border bg-card px-4 py-3 text-left font-medium hover:bg-accent/50 transition-colors">
                        <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-blue-500" />
                            Permissões personalizadas de Supervisor
                        </div>
                        {supervisorOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="rounded-b-lg border border-t-0 bg-card px-4 pb-4 pt-2">
                        <PermissionTable
                            perms={resolvedSupervisor}
                            onToggle={(feature, field, value) => handleToggle("supervisor", feature, field, value)}
                        />
                        <div className="mt-4 flex justify-end">
                            <Button
                                size="sm"
                                onClick={() => handleSave("supervisor")}
                                disabled={savingRole === "supervisor"}
                            >
                                <Save className="mr-2 h-4 w-4" />
                                {savingRole === "supervisor" ? "Salvando..." : "Salvar Supervisor"}
                            </Button>
                        </div>
                    </div>
                </CollapsibleContent>
            </Collapsible>

            {/* Agent block */}
            <Collapsible open={agentOpen} onOpenChange={setAgentOpen}>
                <CollapsibleTrigger asChild>
                    <button className="flex w-full items-center justify-between rounded-lg border bg-card px-4 py-3 text-left font-medium hover:bg-accent/50 transition-colors">
                        <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-green-500" />
                            Permissões personalizadas de Agente
                        </div>
                        {agentOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="rounded-b-lg border border-t-0 bg-card px-4 pb-4 pt-2">
                        <PermissionTable
                            perms={resolvedAgent}
                            onToggle={(feature, field, value) => handleToggle("agent", feature, field, value)}
                        />
                        <div className="mt-4 flex justify-end">
                            <Button
                                size="sm"
                                onClick={() => handleSave("agent")}
                                disabled={savingRole === "agent"}
                            >
                                <Save className="mr-2 h-4 w-4" />
                                {savingRole === "agent" ? "Salvando..." : "Salvar Agente"}
                            </Button>
                        </div>
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
}

interface PermissionTableProps {
    perms: PermissionsState;
    onToggle: (feature: PermissionFeature, field: keyof PermissionSet, value: boolean) => void;
}

function PermissionTable({ perms, onToggle }: PermissionTableProps) {
    return (
        <div className="w-full">
            {/* Header */}
            <div className="grid grid-cols-[1fr_80px_80px_80px] gap-2 px-2 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <span>Módulo</span>
                <span className="text-center">Criar</span>
                <span className="text-center">Editar</span>
                <span className="text-center">Deletar</span>
            </div>

            <div className="divide-y">
                {PERMISSION_FEATURES.map(feature => (
                    <div
                        key={feature.key}
                        className="grid grid-cols-[1fr_80px_80px_80px] items-center gap-2 px-2 py-3"
                    >
                        <span className="text-sm font-medium">{feature.label}</span>
                        <div className="flex justify-center">
                            <Switch
                                checked={perms[feature.key].can_create}
                                onCheckedChange={v => onToggle(feature.key, "can_create", v)}
                            />
                        </div>
                        <div className="flex justify-center">
                            <Switch
                                checked={perms[feature.key].can_edit}
                                onCheckedChange={v => onToggle(feature.key, "can_edit", v)}
                            />
                        </div>
                        <div className="flex justify-center">
                            <Switch
                                checked={perms[feature.key].can_delete}
                                onCheckedChange={v => onToggle(feature.key, "can_delete", v)}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
