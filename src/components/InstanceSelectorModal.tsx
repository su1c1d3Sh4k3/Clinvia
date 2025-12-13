import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

interface InstanceSelectorModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (instanceId: string) => void;
}

export const InstanceSelectorModal = ({ open, onOpenChange, onSelect }: InstanceSelectorModalProps) => {
    const [selectedInstance, setSelectedInstance] = useState<string>("");

    const { data: instances, isLoading } = useQuery({
        queryKey: ["connected-instances"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("instances")
                .select("id, name")
                .eq("status", "connected");

            if (error) throw error;
            return data;
        },
        enabled: open,
    });

    const handleConfirm = () => {
        if (selectedInstance) {
            onSelect(selectedInstance);
            onOpenChange(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Selecione uma Instância</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                    <p className="text-sm text-muted-foreground mb-4">
                        Esta conversa não tem uma instância vinculada. Selecione de qual número deseja enviar a mensagem:
                    </p>

                    {isLoading ? (
                        <div className="flex justify-center p-4">
                            <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                    ) : instances && instances.length > 0 ? (
                        <Select value={selectedInstance} onValueChange={setSelectedInstance}>
                            <SelectTrigger>
                                <SelectValue placeholder="Selecione um número" />
                            </SelectTrigger>
                            <SelectContent>
                                {instances.map((instance) => (
                                    <SelectItem key={instance.id} value={instance.id}>
                                        {instance.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <p className="text-red-500 text-sm">
                            Nenhuma instância conectada encontrada. Conecte um WhatsApp primeiro.
                        </p>
                    )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={handleConfirm} disabled={!selectedInstance || isLoading}>
                        Confirmar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
