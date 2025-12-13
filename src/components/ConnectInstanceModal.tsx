import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface ConnectInstanceModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConnect: (phoneNumber: string) => void;
    onConfirm: () => void;
    isLoading: boolean;
    isConfirming: boolean;
    pairCode: string | null;
}

export function ConnectInstanceModal({
    open,
    onOpenChange,
    onConnect,
    onConfirm,
    isLoading,
    isConfirming,
    pairCode,
}: ConnectInstanceModalProps) {
    const [phoneNumber, setPhoneNumber] = useState("");

    const formatPhoneNumber = (value: string) => {
        // Remove tudo que não é número
        const numbers = value.replace(/\D/g, "");

        // Limitar a 13 dígitos (DDI 2 + DDD 2 + Telefone 9)
        const limited = numbers.slice(0, 13);

        // Aplicar máscara: +55 (11) 99999-9999
        let formatted = "";
        if (limited.length > 0) {
            formatted = "+" + limited.slice(0, 2);
        }
        if (limited.length > 2) {
            formatted += " (" + limited.slice(2, 4);
        }
        if (limited.length > 4) {
            formatted += ") " + limited.slice(4, 9);
        }
        if (limited.length > 9) {
            formatted += "-" + limited.slice(9);
        }

        return formatted;
    };

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const formatted = formatPhoneNumber(e.target.value);
        setPhoneNumber(formatted);
    };

    const isValidPhone = () => {
        const numbers = phoneNumber.replace(/\D/g, "");
        // Valida se tem 13 dígitos completos (DDI 2 + DDD 2 + Telefone 9)
        return numbers.length === 13;
    };

    const handleConnect = () => {
        if (isValidPhone()) {
            const numbers = phoneNumber.replace(/\D/g, "");
            onConnect(numbers);
        }
    };

    const handleConfirm = () => {
        onConfirm();
        setPhoneNumber("");
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                {!pairCode ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>Conectar Instância</DialogTitle>
                            <DialogDescription>
                                Informe o número do telefone que será conectado
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="phone">Número do Telefone</Label>
                                <Input
                                    id="phone"
                                    placeholder="+55 (00) 00000-0000"
                                    value={phoneNumber}
                                    onChange={handlePhoneChange}
                                    disabled={isLoading}
                                    className="text-lg"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Digite o número com DDI e DDD
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <Button
                                onClick={handleConnect}
                                disabled={!isValidPhone() || isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Conectando...
                                    </>
                                ) : (
                                    "Conectar"
                                )}
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>Código de Pareamento</DialogTitle>
                            <DialogDescription>
                                Você acaba de receber uma notificação de conexão no seu WhatsApp, insira o código abaixo para estabelecer a conexão
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex flex-col items-center justify-center py-8 space-y-4">
                            <div className="text-6xl font-bold tracking-wider text-primary">
                                {pairCode}
                            </div>
                            <p className="text-sm text-muted-foreground text-center">
                                Digite este código no WhatsApp do telefone {phoneNumber}
                            </p>
                        </div>

                        <div className="flex justify-end">
                            <Button onClick={handleConfirm} disabled={isConfirming}>
                                {isConfirming ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Configurando...
                                    </>
                                ) : (
                                    "Confirmar"
                                )}
                            </Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
