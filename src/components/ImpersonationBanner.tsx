import { useQuery } from '@tanstack/react-query';
import { useAdminImpersonate } from '@/hooks/useAdminImpersonate';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ShieldAlert, ArrowLeft, Building2, Users } from 'lucide-react';

/** Valor sintético do select quando a visão atual é o dono do tenant. */
const OWNER_OPTION = '__owner__';

const ROLE_LABELS: Record<string, string> = {
    admin: 'Administrador',
    supervisor: 'Supervisor',
    agent: 'Atendente',
};

/**
 * Fixed banner that appears at the top of the page when super-admin is impersonating a client.
 * Shows client name, a select to switch the view between team members of the tenant
 * (default = admin/owner) and a "Return to Admin" button.
 */
export function ImpersonationBanner() {
    const {
        isImpersonating,
        impersonationData,
        isLoading,
        impersonate,
        switchTeamMember,
        exitImpersonation,
    } = useAdminImpersonate();

    const ownerUserId = impersonationData?.ownerUserId || impersonationData?.targetUserId;

    // Membros da equipe do tenant impersonado (só quem tem login vinculado)
    const { data: members } = useQuery({
        queryKey: ['impersonation-team-members', ownerUserId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('team_members')
                .select('id, name, role, auth_user_id')
                .eq('user_id', ownerUserId!)
                .not('auth_user_id', 'is', null)
                .order('name');
            if (error) throw error;
            return data as { id: string; name: string; role: string; auth_user_id: string }[];
        },
        enabled: !!ownerUserId && !!isImpersonating,
        staleTime: 60_000,
    });

    if (!isImpersonating || !impersonationData) {
        return null;
    }

    // O dono geralmente tem uma linha admin em team_members (auth_user_id = owner).
    // Se tiver, usamos ela; senão, opção sintética que volta via impersonate(owner).
    const ownerMember = members?.find((m) => m.auth_user_id === ownerUserId);
    const otherMembers = (members || []).filter((m) => m.auth_user_id !== ownerUserId);
    const currentMember = members?.find(
        (m) => m.auth_user_id === impersonationData.targetUserId
    );
    const selectValue = currentMember
        ? (currentMember.auth_user_id === ownerUserId ? OWNER_OPTION : currentMember.id)
        : OWNER_OPTION;

    const handleSwitch = (value: string) => {
        if (value === selectValue) return;
        if (value === OWNER_OPTION) {
            // Volta a visão para o dono do tenant
            if (ownerMember) {
                switchTeamMember(ownerMember.id);
            } else if (ownerUserId) {
                impersonate(ownerUserId);
            }
            return;
        }
        switchTeamMember(value);
    };

    return (
        <div className="w-full z-[9999] bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 text-white shadow-lg flex-shrink-0">
            <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <ShieldAlert className="h-5 w-5 animate-pulse shrink-0" />
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium hidden md:inline">Acessando como:</span>
                        <span className="font-bold truncate">{impersonationData.targetUserName}</span>
                        {impersonationData.targetCompanyName && (
                            <span className="hidden sm:flex items-center gap-1 text-white/80 truncate">
                                <Building2 className="h-4 w-4 shrink-0" />
                                {impersonationData.targetCompanyName}
                            </span>
                        )}
                        <Select
                            value={selectValue}
                            onValueChange={handleSwitch}
                            disabled={isLoading}
                        >
                            <SelectTrigger className="h-8 w-[180px] shrink-0 bg-white/20 hover:bg-white/30 border-white/30 text-white text-xs focus:ring-white/50 [&>svg]:text-white">
                                <Users className="h-3.5 w-3.5 mr-1 shrink-0" />
                                <SelectValue placeholder="Visualizar como..." />
                            </SelectTrigger>
                            <SelectContent className="z-[10000]">
                                <SelectItem value={OWNER_OPTION}>
                                    {ownerMember ? ownerMember.name : 'Admin (dono)'} — Administrador
                                </SelectItem>
                                {otherMembers.map((m) => (
                                    <SelectItem key={m.id} value={m.id}>
                                        {m.name} — {ROLE_LABELS[m.role] || m.role}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={exitImpersonation}
                    disabled={isLoading}
                    className="bg-white/20 hover:bg-white/30 text-white border-white/30 shrink-0"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {isLoading ? 'Voltando...' : 'Voltar ao Admin'}
                </Button>
            </div>
        </div>
    );
}
