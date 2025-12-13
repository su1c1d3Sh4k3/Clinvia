import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Plus } from "lucide-react";

const formSchema = z.object({
    name: z.string()
        .min(1, "O nome é obrigatório")
        .refine(
            (val) => val.toUpperCase() !== "IA",
            "O nome 'IA' é reservado pelo sistema"
        ),
    description: z.string().optional(),
});

export function CreateFunnelModal() {
    const [open, setOpen] = useState(false);
    const queryClient = useQueryClient();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            description: "",
        },
    });

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        try {
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) throw new Error("Usuário não autenticado");

            // 1. Create Funnel
            const { data: funnel, error: funnelError } = await supabase
                .from("crm_funnels" as any)
                .insert({
                    user_id: userData.user.id,
                    name: values.name,
                    description: values.description,
                })
                .select()
                .single();

            if (funnelError) throw funnelError;

            // 2. Create Default Stages (Ganho/Perdido)
            const defaultStages = [
                {
                    funnel_id: funnel.id,
                    name: "Novo",
                    position: 0,
                    color: "#3b82f6", // Blue
                    is_system: false
                },
                {
                    funnel_id: funnel.id,
                    name: "Qualificação",
                    position: 1,
                    color: "#eab308", // Yellow
                    is_system: false
                },
                {
                    funnel_id: funnel.id,
                    name: "Proposta",
                    position: 2,
                    color: "#a855f7", // Purple
                    is_system: false
                },
                {
                    funnel_id: funnel.id,
                    name: "Negociação",
                    position: 3,
                    color: "#f97316", // Orange
                    is_system: false
                },
                {
                    funnel_id: funnel.id,
                    name: "Ganho",
                    position: 998,
                    color: "#22c55e", // Green
                    is_system: true
                },
                {
                    funnel_id: funnel.id,
                    name: "Perdido",
                    position: 999,
                    color: "#ef4444", // Red
                    is_system: true
                }
            ];

            const { error: stagesError } = await supabase
                .from("crm_stages" as any)
                .insert(defaultStages);

            if (stagesError) throw stagesError;

            toast.success("Funil criado com sucesso!");
            queryClient.invalidateQueries({ queryKey: ["crm-funnels"] });
            setOpen(false);
            form.reset();
        } catch (error) {
            console.error("Erro ao criar funil:", error);
            toast.error("Erro ao criar funil");
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar Funil
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Novo Funil de Vendas</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nome do Funil</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: Vendas B2B" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Descrição (Opcional)</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Para que serve este funil?" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <Button type="submit" className="w-full">
                            Criar Funil
                        </Button>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
