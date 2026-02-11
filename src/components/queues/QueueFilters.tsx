import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Search, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOwnerId } from '@/hooks/useOwnerId';

interface QueueFiltersProps {
    searchTerm: string;
    onSearchChange: (value: string) => void;
    selectedTagId: string;
    onTagChange: (value: string) => void;
    selectedStatus: 'all' | 'open' | 'pending';
    onStatusChange: (value: 'all' | 'open' | 'pending') => void;
    selectedAgentId: string;
    onAgentChange: (value: string) => void;
    onClearFilters: () => void;
}

export function QueueFilters({
    searchTerm,
    onSearchChange,
    selectedTagId,
    onTagChange,
    selectedStatus,
    onStatusChange,
    selectedAgentId,
    onAgentChange,
    onClearFilters,
}: QueueFiltersProps) {
    const { data: ownerId } = useOwnerId();

    // Fetch tags
    const { data: tags } = useQuery({
        queryKey: ['tags', ownerId],
        queryFn: async () => {
            if (!ownerId) return [];

            const { data, error } = await supabase
                .from('tags')
                .select('*')
                .eq('user_id', ownerId)
                .order('name');

            if (error) throw error;
            return data;
        },
        enabled: !!ownerId,
    });

    // Fetch team members (agents)
    const { data: agents } = useQuery({
        queryKey: ['team-members', ownerId],
        queryFn: async () => {
            if (!ownerId) return [];

            const { data, error } = await supabase
                .from('team_members')
                .select('id, name, role')
                .eq('user_id', ownerId)
                .order('name');

            if (error) throw error;
            return data;
        },
        enabled: !!ownerId,
    });

    const hasActiveFilters =
        searchTerm !== '' ||
        selectedTagId !== 'all' ||
        selectedStatus !== 'all' ||
        selectedAgentId !== 'all';

    return (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-slate-700 space-y-4">
            <div className="flex flex-col md:flex-row gap-3">
                {/* Search */}
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar por nome, telefone ou ID..."
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-10"
                    />
                </div>

                {/* Tag Filter */}
                <Select value={selectedTagId} onValueChange={onTagChange}>
                    <SelectTrigger className="w-full md:w-[200px]">
                        <SelectValue placeholder="Filtrar por tag" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todas as tags</SelectItem>
                        {tags?.map((tag) => (
                            <SelectItem key={tag.id} value={tag.id}>
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-3 h-3 rounded-full"
                                        style={{ backgroundColor: tag.color }}
                                    />
                                    {tag.name}
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Status Filter */}
                <Select value={selectedStatus} onValueChange={onStatusChange}>
                    <SelectTrigger className="w-full md:w-[180px]">
                        <SelectValue placeholder="Filtrar por status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos os status</SelectItem>
                        <SelectItem value="open">Aberto</SelectItem>
                        <SelectItem value="pending">Pendente</SelectItem>
                    </SelectContent>
                </Select>

                {/* Agent Filter */}
                <Select value={selectedAgentId} onValueChange={onAgentChange}>
                    <SelectTrigger className="w-full md:w-[200px]">
                        <SelectValue placeholder="Filtrar por atendente" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todos os atendentes</SelectItem>
                        {agents?.map((agent) => (
                            <SelectItem key={agent.id} value={agent.id}>
                                {agent.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* Clear Filters Button */}
                {hasActiveFilters && (
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={onClearFilters}
                        title="Limpar filtros"
                    >
                        <X className="w-4 h-4" />
                    </Button>
                )}
            </div>
        </div>
    );
}
