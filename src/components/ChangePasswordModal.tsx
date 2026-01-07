import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

interface ChangePasswordModalProps {
    open: boolean;
    onClose: () => void;
}

export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const isValid = newPassword.length >= 6 && newPassword === confirmPassword;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!isValid) {
            toast.error("As senhas não coincidem ou são muito curtas (min. 6 caracteres)");
            return;
        }

        setIsLoading(true);

        try {
            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            // Update must_change_password flag
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await supabase
                    .from("profiles")
                    .update({ must_change_password: false })
                    .eq("id", user.id);
            }

            toast.success("Senha alterada com sucesso!");
            onClose();
        } catch (error: any) {
            toast.error("Erro ao alterar senha: " + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={() => { }}>
            <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Lock className="w-5 h-5 text-primary" />
                        Alterar Senha
                    </DialogTitle>
                    <DialogDescription>
                        Por segurança, você precisa alterar sua senha padrão antes de continuar.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="new-password">Nova Senha</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="new-password"
                                type={showPassword ? "text" : "password"}
                                placeholder="Mínimo 6 caracteres"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                minLength={6}
                                className="pl-9 pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="confirm-password"
                                type={showPassword ? "text" : "password"}
                                placeholder="Repita a nova senha"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength={6}
                                className={`pl-9 ${confirmPassword && confirmPassword !== newPassword
                                        ? "border-red-500"
                                        : confirmPassword && confirmPassword === newPassword
                                            ? "border-green-500"
                                            : ""
                                    }`}
                            />
                        </div>
                        {confirmPassword && confirmPassword !== newPassword && (
                            <p className="text-xs text-red-500">As senhas não coincidem</p>
                        )}
                    </div>

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={!isValid || isLoading}
                    >
                        {isLoading ? "Salvando..." : "Salvar Nova Senha"}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
