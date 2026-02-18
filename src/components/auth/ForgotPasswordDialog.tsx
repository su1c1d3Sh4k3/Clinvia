
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";

export function ForgotPasswordDialog() {
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [open, setOpen] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const { data, error } = await supabase.functions.invoke("request-password-reset", {
                body: { email: email.trim() },
            });

            if (error) throw error;

            if (!data?.success) {
                throw new Error(data?.message || "Erro ao solicitar recuperação de senha.");
            }

            toast.success("Se o email estiver cadastrado, você receberá uma nova senha no WhatsApp.");
            setOpen(false);
            setEmail("");
        } catch (error: any) {
            console.error("Forgot password error:", error);
            toast.error("Erro ao solicitar recuperação de senha. Tente novamente.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="link" type="button" className="px-0 font-normal text-white/70 hover:text-white h-auto p-0">
                    Esqueci minha senha
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-[#1a1f2c] border-white/10 text-white">
                <DialogHeader>
                    <DialogTitle>Recuperar Senha</DialogTitle>
                    <DialogDescription className="text-white/70">
                        Digite seu email cadastrado para receber uma nova senha provisória via WhatsApp.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="reset-email" className="text-white/90">Email</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-white/50" />
                            <Input
                                id="reset-email"
                                type="email"
                                placeholder="seu@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
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
                                    Enviando...
                                </>
                            ) : (
                                "Enviar Nova Senha"
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
