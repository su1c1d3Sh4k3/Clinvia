import { useState } from 'react';
import { QueueKanbanBoard } from '@/components/queues/QueueKanbanBoard';
import { QueueFilters } from '@/components/queues/QueueFilters';

export default function QueuesManager() {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTagId, setSelectedTagId] = useState<string>('all');
    const [selectedStatus, setSelectedStatus] = useState<'all' | 'open' | 'pending'>('all');
    const [selectedAgentId, setSelectedAgentId] = useState<string>('all');

    // Channel Filters State (Both active by default)
    const [channelFilters, setChannelFilters] = useState({
        whatsapp: true,
        instagram: true
    });

    const handleChannelToggle = (channel: 'whatsapp' | 'instagram') => {
        setChannelFilters(prev => {
            // Prevent disabling both (at least one must remain active)
            if (prev[channel] && !prev[channel === 'whatsapp' ? 'instagram' : 'whatsapp']) {
                return prev;
            }
            return {
                ...prev,
                [channel]: !prev[channel]
            };
        });
    };

    const handleClearFilters = () => {
        setSearchTerm('');
        setSelectedTagId('all');
        setSelectedStatus('all');
        setSelectedAgentId('all');
        setChannelFilters({ whatsapp: true, instagram: true });
    };

    return (
        <div className="px-3 md:px-6 pt-4 md:pt-6 h-screen flex flex-col overflow-hidden">
            {/* Header + Filters - FIXOS */}
            <div className="flex flex-col gap-3 mb-4 md:mb-6 flex-shrink-0">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-[#005AA8] dark:text-white">Gestão de Filas</h1>
                    <p className="text-muted-foreground text-sm md:text-base mt-1 md:mt-2">
                        Gerencie conversas organizadas por filas de atendimento
                    </p>
                </div>

                <QueueFilters
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    selectedTagId={selectedTagId}
                    onTagChange={setSelectedTagId}
                    selectedStatus={selectedStatus}
                    onStatusChange={setSelectedStatus}
                    selectedAgentId={selectedAgentId}
                    onAgentChange={setSelectedAgentId}
                    onClearFilters={handleClearFilters}
                    channelFilters={channelFilters}
                    onChannelToggle={handleChannelToggle}
                />
            </div>

            {/* Kanban Board - FLEXÍVEL */}
            <div className="flex-1 overflow-hidden">
                <QueueKanbanBoard
                    searchTerm={searchTerm}
                    selectedTagId={selectedTagId}
                    selectedStatus={selectedStatus}
                    selectedAgentId={selectedAgentId}
                    channelFilters={channelFilters}
                />
            </div>
        </div>
    );
}
