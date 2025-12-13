import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { CRMFunnel, CRMStage, CRMDeal } from "@/types/crm";

import { useStaff } from "@/hooks/useStaff";

const formSchema = z.object({
    title: z.string().min(1, "O título é obrigatório"),
    contact_id: z.string().optional(),
    product_service_id: z.string().optional(),
    quantity: z.coerce.number().min(1, "Quantidade mínima é 1").default(1),
    assigned_professional_id: z.string().optional(),
    funnel_id: z.string().min(1, "O funil é obrigatório"),
    stage_id: z.string().min(1, "A etapa é obrigatória"),
    value: z.coerce.number().min(0, "O valor deve ser positivo"),
    priority: z.enum(["low", "medium", "high"]),
    description: z.string().optional(),
    responsible_id: z.string().optional(),
});

interface EditDealModalProps {
    deal: CRMDeal;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function EditDealModal({ deal, open, onOpenChange }: EditDealModalProps) {
    const queryClient = useQueryClient();
    const { data: staffMembers } = useStaff();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: deal.title,
            quantity: deal.quantity || 1,
            value: deal.value,
            priority: deal.priority || "medium",
            funnel_id: deal.funnel_id,
            stage_id: deal.stage_id,
            description: deal.description || "",
            product_service_id: deal.product_service_id || "",
            assigned_professional_id: deal.assigned_professional_id || "",
            contact_id: deal.contact_id || undefined,
            responsible_id: deal.responsible_id || "",
        },
    });

    // Reset form when deal changes
    useEffect(() => {
        if (deal) {
            form.reset({
                title: deal.title,
                quantity: deal.quantity || 1,
                value: deal.value,
                priority: deal.priority || "medium",
                funnel_id: deal.funnel_id,
                stage_id: deal.stage_id,
                description: deal.description || "",
                product_service_id: deal.product_service_id || "",
                assigned_professional_id: deal.assigned_professional_id || "",
                contact_id: deal.contact_id || undefined,
                responsible_id: deal.responsible_id || "",
            });
        }
    }, [deal, form]);

    // Fetch Funnels
    const { data: funnels } = useQuery({
        queryKey: ["crm-funnels"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("crm_funnels" as any)
                .select("*")
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data as unknown as CRMFunnel[];
        },
    });

    // Fetch Stages for selected funnel
    const selectedFunnelId = form.watch("funnel_id");
    const { data: stages } = useQuery({
        queryKey: ["crm-stages", selectedFunnelId],
        queryFn: async () => {
            if (!selectedFunnelId) return [];
            const { data, error } = await supabase
                .from("crm_stages" as any)
                .select("*")
                .eq("funnel_id", selectedFunnelId)
                .order("position", { ascending: true });
            if (error) throw error;
            return data as unknown as CRMStage[];
        },
        enabled: !!selectedFunnelId,
    });

    // Fetch Contacts
    const { data: contacts, isLoading: isLoadingContacts } = useQuery({
        queryKey: ["contacts-list"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("contacts" as any)
                .select("id, push_name, remote_jid")
                .limit(50)
                .order("push_name", { ascending: true });

            if (error) throw error;
            return data as { id: string; push_name: string; remote_jid?: string }[];
        },
    });

    // Fetch Products/Services  
    const { data: productsServices } = useQuery({
        queryKey: ['products-services'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('products_services' as any)
                .select('*')
                .order('name', { ascending: true });
            if (error) throw error;
            return data as { id: string; name: string; type: 'product' | 'service'; price: number }[];
        },
    });

    // Watch selected product/service
    const selectedProductServiceId = form.watch('product_service_id');
    const selectedProductService = productsServices?.find(ps => ps.id === selectedProductServiceId);

    // Fetch professionals for selected SERVICE
    const { data: availableProfessionals } = useQuery({
        queryKey: ['service-professionals', selectedProductServiceId],
        queryFn: async () => {
            if (!selectedProductServiceId || selectedProductService?.type !== 'service') return [];

            const { data, error } = await supabase
                .from('professionals' as any)
                .select('id, name, role')
                .contains('service_ids', [selectedProductServiceId]);

            if (error) throw error;
            return data as { id: string; name: string; role?: string }[];
        },
        enabled: !!selectedProductServiceId && selectedProductService?.type === 'service',
    });

    // Auto-fill value when product/service or quantity changes
    useEffect(() => {
        if (selectedProductService) {
            const basePrice = Number(selectedProductService.price || 0);
            const quantity = form.getValues('quantity') || 1;
            form.setValue('value', basePrice * quantity);
        }
    }, [selectedProductServiceId, form.watch('quantity'), selectedProductService, form]);

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        try {
            // Clean empty strings for UUID fields (convert to null)
            const cleanedValues = {
                ...values,
                contact_id: values.contact_id || null,
                product_service_id: values.product_service_id || null,
                assigned_professional_id: values.assigned_professional_id || null,
                responsible_id: values.responsible_id || null,
            };

            const { error } = await supabase
                .from("crm_deals" as any)
                .update({
                    ...cleanedValues,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", deal.id);

            if (error) throw error;

            toast.success("Negociação atualizada!");
            queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
            onOpenChange(false);
        } catch (error) {
            console.error("Erro ao atualizar negociação:", error);
            toast.error("Erro ao atualizar negociação");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Editar Negociação</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Título</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: Contrato Empresa X" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Row 2: Contato + Produto/Serviço */}
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="contact_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Contato</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isLoadingContacts}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={isLoadingContacts ? "Carregando..." : "Selecione um contato"} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {contacts?.map((contact) => (
                                                    <SelectItem key={contact.id} value={contact.id}>
                                                        {contact.push_name || "Sem Nome"} ({contact.remote_jid?.split('@')[0] || "Sem número"})
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="product_service_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Produto/Serviço</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {productsServices?.map((ps) => (
                                                    <SelectItem key={ps.id} value={ps.id}>
                                                        {ps.name} ({ps.type === 'product' ? 'Produto' : 'Serviço'}) - R$ {Number(ps.price || 0).toFixed(2)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* Row 3: Funnel + Stage */}
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="funnel_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Funil</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione o funil" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {funnels?.map((funnel) => (
                                                    <SelectItem key={funnel.id} value={funnel.id}>
                                                        {funnel.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="stage_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Etapa</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!selectedFunnelId}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione a etapa" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {stages?.map((stage) => (
                                                    <SelectItem key={stage.id} value={stage.id}>
                                                        {stage.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* Row 4: Quantidade + Valor + Prioridade */}
                        <div className="grid grid-cols-3 gap-4">
                            <FormField
                                control={form.control}
                                name="quantity"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Quantidade</FormLabel>
                                        <FormControl>
                                            <Input type="number" min="1" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="value"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Valor (R$)</FormLabel>
                                        <FormControl>
                                            <Input type="number" step="0.01" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="priority"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Prioridade</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="low">Baixa</SelectItem>
                                                <SelectItem value="medium">Média</SelectItem>
                                                <SelectItem value="high">Alta</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        {/* Conditional Professional Field */}
                        {selectedProductService?.type === 'service' && (
                            <FormField
                                control={form.control}
                                name="assigned_professional_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Profissional</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione o profissional" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {availableProfessionals?.length === 0 ? (
                                                    <div className="p-2 text-sm text-muted-foreground text-center">Nenhum profissional vinculado a este serviço</div>
                                                ) : (
                                                    availableProfessionals?.map((prof) => (
                                                        <SelectItem key={prof.id} value={prof.id}>
                                                            {prof.name} {prof.role && `(${prof.role})`}
                                                        </SelectItem>
                                                    ))
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        <FormField
                            control={form.control}
                            name="responsible_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Responsável</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione o responsável" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {staffMembers?.map((staff) => (
                                                <SelectItem key={staff.id} value={staff.id}>
                                                    {staff.name} ({staff.role})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Descrição</FormLabel>
                                    <FormControl>
                                        <Textarea placeholder="Detalhes da negociação..." {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="flex justify-end gap-2 pt-4">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit">
                                Salvar Alterações
                            </Button>
                        </div>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
