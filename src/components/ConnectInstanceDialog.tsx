import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Copy } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface ConnectInstanceDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    instanceName: string;
    onConnect: (phone: string) => Promise<void>;
    pairCode: string | null;
    isLoading: boolean;
    onConfirm: () => void;
}

export const ConnectInstanceDialog = ({
    open,
    onOpenChange,
    instanceName,
    onConnect,
    pairCode,
    isLoading,
    onConfirm
}: ConnectInstanceDialogProps) => {
    const [phone, setPhone] = useState("");
    const { toast } = useToast();

    const formatPhone = (value: string) => {
        // Remove non-digits
        const digits = value.replace(/\D/g, "");

        // Limit to 13 digits (DDI + DDD + 9 digits)
        const limited = digits.slice(0, 13);

        // Format: DDI DDD Number
        // 55 11 999999999
        let formatted = limited;
        if (limited.length > 2) {
            formatted = `${limited.slice(0, 2)} ${limited.slice(2)}`;
        }
        if (limited.length > 4) {
            formatted = `${limited.slice(0, 2)} ${limited.slice(2, 4)} ${limited.slice(4)}`;
        }

        return formatted;
    };

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPhone(formatPhone(e.target.value));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        // Remove spaces for API
        const cleanPhone = phone.replace(/\s/g, "");
        if (cleanPhone.length < 12) {
            toast({
                title: "Número inválido",
                description: "Digite um número completo com DDI e DDD.",
                variant: "destructive"
            });
            return;
        }
        await onConnect(cleanPhone);
    };

    const copyToClipboard = () => {
        if (pairCode) {
            navigator.clipboard.writeText(pairCode);
            toast({
                title: "Copiado!",
                description: "Código copiado para a área de transferência.",
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Conectar {instanceName}</DialogTitle>
                    <DialogDescription>
                        {pairCode
                            ? "Siga as instruções abaixo para conectar"
                            : "Insira o número do WhatsApp que será conectado"}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {pairCode ? (
                        <div className="space-y-6">
                            <div className="bg-muted text-primary-foreground p-4 rounded-lg text-center space-y-2">
                                <p className="text-sm">
                                    Código de Pareamento
                                </p>
                                <div className="flex items-center justify-center gap-2">
                                    <span className="text-3xl font-mono font-bold tracking-wider">
                                        {pairCode}
                                    </span>
                                    <Button size="icon" variant="ghost" onClick={copyToClipboard}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2 text-sm text-muted-foreground text-center">
                                <p>
                                    Em instantes você receberá uma notificação no WhatsApp para realizar a conexão com a plataforma. Digite esse código e confirme.
                                </p>
                            </div>

                            <Button onClick={onConfirm} className="w-full">
                                Confirmar Conexão
                            </Button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="phone">Número do WhatsApp</Label>
                                <Input
                                    id="phone"
                                    placeholder="55 11 999999999"
                                    value={phone}
                                    onChange={handlePhoneChange}
                                    disabled={isLoading}
                                    autoFocus
                                />
                                <p className="text-xs text-muted-foreground">
                                    Formato: DDI + DDD + Número (ex: 55 11 999999999)
                                </p>
                            </div>

                            <Button
                                type="submit"
                                className="w-full"
                                disabled={isLoading || phone.replace(/\D/g, "").length < 12}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Gerando Código...
                                    </>
                                ) : (
                                    "Gerar Código de Pareamento"
                                )}
                            </Button>
                        </form>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};
