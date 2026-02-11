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
import { Loader2 } from 'lucide-react';

interface TransferQueueModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentQueueId: string | null;
    currentQueueName: string;
    onConfirm: (newQueueId: string, newQueueName: string) => void;
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
    const { data: ownerId } = useOwnerId();

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
            onConfirm(selectedQueue.id, selectedQueue.name);
            setSelectedQueueId('');
        }
    };

    const handleCancel = () => {
        setSelectedQueueId('');
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
                            O agente atribuído será removido automaticamente.
                        </span>
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
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
