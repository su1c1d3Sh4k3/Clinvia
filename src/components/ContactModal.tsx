import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { formatPhoneNumber, unformatPhoneNumber, isValidEmail } from "@/utils/formatters";

interface Contact {
    id: string;
    push_name: string;
    number: string;
    profile_pic_url?: string;
    phone?: string;
    company?: string;
    cpf?: string;
    email?: string;
    instagram?: string;
}

interface ContactModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    contactToEdit?: Contact | null;
}

export const ContactModal = ({ open, onOpenChange, contactToEdit }: ContactModalProps) => {
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [company, setCompany] = useState("");
    const [cpf, setCpf] = useState("");
    const [email, setEmail] = useState("");
    const [instagram, setInstagram] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (contactToEdit) {
            setName(contactToEdit.push_name || "");
            setPhone(contactToEdit.phone || contactToEdit.number?.split('@')[0] || "");
            setCompany(contactToEdit.company || "");
            setCpf(contactToEdit.cpf || "");
            setEmail(contactToEdit.email || "");
            setInstagram(contactToEdit.instagram || "");
        } else {
            setName("");
            setPhone("");
            setCompany("");
            setCpf("");
            setEmail("");
            setInstagram("");
        }
    }, [contactToEdit, open]);

    const handleSave = async () => {
        if (!name.trim()) {
            toast({
                title: "Erro",
                description: "O nome do contato é obrigatório",
                variant: "destructive",
            });
            return;
        }

        if (!phone.trim()) {
            toast({
                title: "Erro",
                description: "O telefone é obrigatório",
                variant: "destructive",
            });
            return;
        }


        setIsLoading(true);
        try {
            // Get user_id - try getUser first, fallback to getSession
            let userId: string | undefined;

            const { data: { user } } = await supabase.auth.getUser();
            if (user?.id) {
                userId = user.id;
            } else {
                // Fallback to session
                const { data: { session } } = await supabase.auth.getSession();
                userId = session?.user?.id;
            }

            console.log('[ContactModal] User ID:', userId);

            if (!userId) {
                throw new Error("Usuário não autenticado. Por favor, faça login novamente.");
            }

            const contactData = {
                push_name: name,
                phone: phone,
                number: contactToEdit ? contactToEdit.number : `${phone}@s.whatsapp.net`,
                company: company || null,
                cpf: cpf || null,
                email: email || null,
                instagram: instagram || null,
                edited: true, // Marcar como editado manualmente - nome não será sobrescrito automaticamente
            };

            if (contactToEdit) {
                const { error } = await supabase
                    .from("contacts")
                    .update(contactData)
                    .eq("id", contactToEdit.id);

                if (error) throw error;
                toast({ title: "Contato atualizado com sucesso!" });
            } else {
                // Add user_id and is_group for new contacts
                const { error } = await supabase
                    .from("contacts")
                    .insert({
                        ...contactData,
                        user_id: userId,
                        is_group: false,
                    });

                if (error) throw error;
                toast({ title: "Contato criado com sucesso!" });
            }

            queryClient.invalidateQueries({ queryKey: ["contacts"] });
            onOpenChange(false);
        } catch (error: any) {
            toast({
                title: "Erro ao salvar",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{contactToEdit ? "Editar Contato" : "Novo Contato"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="name">Nome</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Nome do cliente"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="phone">Telefone</Label>
                        <Input
                            id="phone"
                            value={formatPhoneNumber(phone)}
                            onChange={(e) => setPhone(unformatPhoneNumber(e.target.value))}
                            placeholder="+55 (37) 9 9999-9999"
                            disabled={!!contactToEdit}
                        />
                        {contactToEdit && <p className="text-xs text-muted-foreground">O telefone não pode ser alterado diretamente.</p>}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="company">Empresa</Label>
                        <Input
                            id="company"
                            value={company}
                            onChange={(e) => setCompany(e.target.value)}
                            placeholder="Nome da empresa"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="cpf">CPF</Label>
                        <Input
                            id="cpf"
                            value={cpf}
                            onChange={(e) => setCpf(e.target.value)}
                            placeholder="000.000.000-00"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="cliente@email.com"
                            className={email && !isValidEmail(email) ? "border-red-500" : ""}
                        />
                        {email && !isValidEmail(email) && (
                            <p className="text-xs text-red-500">Email inválido</p>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="instagram">Instagram (usuário)</Label>
                        <Input
                            id="instagram"
                            value={instagram}
                            onChange={(e) => setInstagram(e.target.value)}
                            placeholder="usuario_instagram"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={isLoading}>
                        {isLoading ? "Salvando..." : "Salvar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
