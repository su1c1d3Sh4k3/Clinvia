
import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lock, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function ChangePasswordModal() {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    useEffect(() => {
        const checkMustChangePassword = async () => {
            if (!user) return;

            const { data: profile, error } = await supabase
                .from("profiles")
                .select("must_change_password")
                .eq("id", user.id)
                .single();

            if (error) {
                console.error("Error checking profile:", error);
                return;
            }

            if (profile?.must_change_password) {
                setOpen(true);
            }
        };

        checkMustChangePassword();
    }, [user]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword.length < 6) {
            toast.error("A senha deve ter pelo menos 6 caracteres.");
            return;
        }

        if (newPassword !== confirmPassword) {
            toast.error("As senhas não coincidem.");
            return;
        }

        setIsLoading(true);

        try {
            // 1. Update password
            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword,
            });

            if (updateError) throw updateError;

            // 2. Update profile flag
            const { error: profileError } = await supabase
                .from("profiles")
                .update({ must_change_password: false })
                .eq("id", user?.id);

            if (profileError) throw profileError;

            toast.success("Senha alterada com sucesso!");
            setOpen(false);
        } catch (error: any) {
            console.error("Change password error:", error);
            toast.error(error.message || "Erro ao alterar senha.");
        } finally {
            setIsLoading(false);
        }
    };

    // Prevent closing by clicking outside or escape
    const handleOpenChange = (isOpen: boolean) => {
        if (!isOpen && open) {
            // Do not allow closing if it's open (forced)
            return;
        }
        setOpen(isOpen);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-[425px] bg-[#1a1f2c] border-white/10 text-white [&>button]:hidden">
                <DialogHeader>
                    <DialogTitle>Alteração de Senha Necessária</DialogTitle>
                    <DialogDescription className="text-white/70">
                        Por segurança, você precisa alterar sua senha provisória antes de continuar.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="new-password" className="text-white/90">Nova Senha</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-white/50" />
                            <Input
                                id="new-password"
                                type="password"
                                placeholder="Defina sua nova senha"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary/50 focus:ring-primary/50"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirm-password" className="text-white/90">Confirme a Nova Senha</Label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-white/50" />
                            <Input
                                id="confirm-password"
                                type="password"
                                placeholder="Confirme sua nova senha"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-primary/50 focus:ring-primary/50"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="submit"
                            className="w-full bg-primary hover:bg-primary/90 text-white"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Salvando...
                                </>
                            ) : (
                                "Salvar Nova Senha"
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
