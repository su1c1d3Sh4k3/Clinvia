import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOwnerId } from '@/hooks/useOwnerId';
import { useStaff } from '@/hooks/useStaff';
import { Loader2, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface TransferQueueModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentQueueId: string | null;
    currentQueueName: string;
    onConfirm: (newQueueId: string, assignedAgentId: string | null) => void;
    isLoading?: boolean;
}

export function TransferQueueModal({
    open,
    onOpenChange,
    currentQueueId,
    currentQueueName,
    onConfirm,
    isLoading = false,
}: TransferQueueModalProps) {
    const [selectedQueueId, setSelectedQueueId] = useState<string>('');
    const [selectedAgentId, setSelectedAgentId] = useState<string>('unassigned');
    const { data: ownerId } = useOwnerId();
    const { data: staffMembers, isLoading: staffLoading } = useStaff();

    // Fetch all queues
    const { data: queues } = useQuery({
        queryKey: ['queues', ownerId],
        queryFn: async () => {
            if (!ownerId) return [];

            const { data, error } = await supabase
                .from('queues')
                .select('id, name, is_active')
                .eq('user_id', ownerId)
                .eq('is_active', true)
                .order('name');

            if (error) throw error;
            return data;
        },
        enabled: !!ownerId && open,
    });

    // Filter out current queue
    const availableQueues = queues?.filter(q => q.id !== currentQueueId) || [];

    const handleConfirm = () => {
        const selectedQueue = queues?.find(q => q.id === selectedQueueId);
        if (selectedQueue) {
            const finalAgentId = selectedAgentId === 'unassigned' ? null : selectedAgentId;
            onConfirm(selectedQueue.id, finalAgentId);
            setSelectedQueueId('');
            setSelectedAgentId('unassigned');
        }
    };

    const handleCancel = () => {
        setSelectedQueueId('');
        setSelectedAgentId('unassigned');
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Transferir Conversa</DialogTitle>
                    <DialogDescription>
                        Transferir conversa de <strong>{currentQueueName}</strong> para outra fila.
                        <br />
                        <span className="text-sm text-muted-foreground">
                            Selecione a nova fila e opcionalmente um responsável.
                        </span>
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none">Fila de Destino</label>
                        <Select value={selectedQueueId} onValueChange={setSelectedQueueId}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione a fila de destino" />
                            </SelectTrigger>
                            <SelectContent>
                                {availableQueues.map((queue) => (
                                    <SelectItem key={queue.id} value={queue.id}>
                                        {queue.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {selectedQueueId && (
                        <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                            <label className="text-sm font-medium leading-none">
                                Atribuir Responsável
                            </label>
                            <Select value={selectedAgentId} onValueChange={setSelectedAgentId} disabled={staffLoading}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Selecione o atendente" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="unassigned" className="font-semibold text-primary">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                                                <Users className="w-3.5 h-3.5 text-primary" />
                                            </div>
                                            <span>Todo o time (Sem atribuição)</span>
                                        </div>
                                    </SelectItem>

                                    {staffMembers?.map((staff) => (
                                        <SelectItem key={staff.id} value={staff.id}>
                                            <div className="flex items-center gap-2">
                                                <Avatar className="w-6 h-6">
                                                    <AvatarImage src={staff.avatar_url} />
                                                    <AvatarFallback className="text-[10px] bg-secondary/10 text-secondary">
                                                        {staff.name[0]?.toUpperCase()}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className="truncate">{staff.name}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!selectedQueueId || isLoading}
                    >
                        {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Confirmar Transferência
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
