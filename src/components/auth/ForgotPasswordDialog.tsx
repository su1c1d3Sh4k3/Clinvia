
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

            toast.success("Se o email estiver cadastrado, você receberá o link para criar uma nova senha.");
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
                <Button variant="link" type="button" className="px-0 font-normal text-[#1668C1]/80 hover:text-[#1668C1] h-auto p-0">
                    Esqueci minha senha
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-white border-[#1668C1]/15 text-[#0B2545]">
                <DialogHeader>
                    <DialogTitle className="text-[#1668C1]">Recuperar Senha</DialogTitle>
                    <DialogDescription className="text-[#1668C1]/70">
                        Digite seu email cadastrado para receber o link de redefinição de senha.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="reset-email" className="text-[#1668C1]">Email</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-3 h-4 w-4 text-[#1668C1]/60" />
                            <Input
                                id="reset-email"
                                type="email"
                                placeholder="seu@email.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                className="pl-9 bg-white border-[#1668C1]/30 text-[#0B2545] placeholder:text-[#1668C1]/40 focus-visible:ring-[#1668C1]/30 focus-visible:border-[#1668C1]"
                                autoComplete="off"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            type="submit"
                            className="w-full bg-[#1668C1] hover:bg-[#12539C] text-white"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Enviando...
                                </>
                            ) : (
                                "Enviar link de redefinição"
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
