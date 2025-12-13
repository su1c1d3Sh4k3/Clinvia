import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";

interface CopilotSettingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function CopilotSettingsModal({ open, onOpenChange }: CopilotSettingsModalProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [session, setSession] = useState<Session | null>(null);
    const [formData, setFormData] = useState({
        about_company: "",
        customer_profile: "",
        personality: "",
        humor_level: "",
        products: ""
    });

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        if (open && session?.user?.id) {
            fetchSettings();
        }
    }, [open, session?.user?.id]);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from("copilot" as any)
                .select("*")
                .eq("user_id", session?.user?.id)
                .single();

            if (error && error.code !== "PGRST116") { // PGRST116 is "no rows found"
                console.error("Error fetching copilot settings:", error);
                return;
            }

            if (data) {
                setFormData({
                    about_company: data.about_company || "",
                    customer_profile: data.customer_profile || "",
                    personality: data.personality || "",
                    humor_level: data.humor_level || "",
                    products: data.products || ""
                });
            }
        } catch (error) {
            console.error("Error:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!session?.user?.id) return;

        try {
            setLoading(true);
            const { error } = await supabase
                .from("copilot" as any)
                .upsert({
                    user_id: session.user.id,
                    ...formData,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;

            toast({
                title: "Configurações salvas!",
                description: "O Copilot agora usará estas informações.",
            });
            onOpenChange(false);
        } catch (error) {
            console.error("Error saving settings:", error);
            toast({
                title: "Erro ao salvar",
                description: "Não foi possível salvar as configurações.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Configurações do Copilot</DialogTitle>
                    <DialogDescription>
                        Personalize como o Copilot deve se comportar e o que ele precisa saber sobre sua empresa.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="about">Sobre sua empresa</Label>
                        <Textarea
                            id="about"
                            placeholder="Descreva de forma objetiva sobre o que é a empresa..."
                            value={formData.about_company}
                            onChange={(e) => setFormData({ ...formData, about_company: e.target.value })}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="products">Produtos</Label>
                        <Textarea
                            id="products"
                            placeholder="Descreva os tipos de produto que trabalham..."
                            value={formData.products}
                            onChange={(e) => setFormData({ ...formData, products: e.target.value })}
                        />
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="profile">Perfil do cliente</Label>
                        <Textarea
                            id="profile"
                            placeholder="Descreva o perfil do cliente que atendem..."
                            value={formData.customer_profile}
                            onChange={(e) => setFormData({ ...formData, customer_profile: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="personality">Personalidade</Label>
                            <Select
                                value={formData.personality}
                                onValueChange={(value) => setFormData({ ...formData, personality: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Geração Z (20 anos)">Geração Z (20 anos)</SelectItem>
                                    <SelectItem value="Millennial (30 anos)">Millennial (30 anos)</SelectItem>
                                    <SelectItem value="Baby Boomer (40+ anos)">Baby Boomer (40+ anos)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="humor">Senso de humor</Label>
                            <Select
                                value={formData.humor_level}
                                onValueChange={(value) => setFormData({ ...formData, humor_level: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecione..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Alto">Alto</SelectItem>
                                    <SelectItem value="Médio">Médio</SelectItem>
                                    <SelectItem value="Nenhum">Nenhum</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={loading}>
                        {loading ? "Salvando..." : "Salvar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
