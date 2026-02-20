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
import { useStaff } from '@/hooks/useStaff';
import { Loader2, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface AssignResponsibleModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    targetQueueId: string | null;
    targetQueueName: string;
    onConfirm: (queueId: string, assignedAgentId: string | null) => void;
    isLoading?: boolean;
}

export function AssignResponsibleModal({
    open,
    onOpenChange,
    targetQueueId,
    targetQueueName,
    onConfirm,
    isLoading = false,
}: AssignResponsibleModalProps) {
    const [selectedAgentId, setSelectedAgentId] = useState<string>('unassigned');
    const { data: staffMembers, isLoading: staffLoading } = useStaff();

    const handleConfirm = () => {
        if (!targetQueueId) return;

        // Se 'unassigned' foi escolhido, passamos null para a mutation limpar o user_id
        const finalAgentId = selectedAgentId === 'unassigned' ? null : selectedAgentId;
        onConfirm(targetQueueId, finalAgentId);

        // Timeout para resetar o popover internamente antes da nova renderização
        setTimeout(() => setSelectedAgentId('unassigned'), 300);
    };

    const handleCancel = () => {
        setSelectedAgentId('unassigned');
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={(val) => {
            if (!val) setSelectedAgentId('unassigned');
            onOpenChange(val);
        }}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="text-xl">Transferir Conversa</DialogTitle>
                    <DialogDescription className="pt-2 text-[14px]">
                        Transferindo para a fila: <strong className="text-foreground">{targetQueueName}</strong>.
                        <br />Selecione abaixo quem será o responsável.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            Atribuir Responsável
                        </label>
                        <Select value={selectedAgentId} onValueChange={setSelectedAgentId} disabled={staffLoading}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Selecione o atendente" />
                            </SelectTrigger>
                            <SelectContent>
                                {/* Opção Padrão: Sem responsável fixo */}
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
                                            {staff.role === 'admin' && (
                                                <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground ml-1">
                                                    Admin
                                                </span>
                                            )}
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirm}
                        disabled={!targetQueueId || isLoading}
                        className="bg-primary hover:bg-primary/90"
                    >
                        {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Confirmar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
