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
import { ContactPicker } from "@/components/ui/contact-picker";
import { CurrencyInput } from "@/components/ui/currency-input";
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
import { DealProductsForm, ProductItem } from "./DealProductsForm";
import { useDealProducts } from "@/hooks/useDealProducts";

const formSchema = z.object({
    title: z.string().min(1, "O título é obrigatório"),
    contact_id: z.string().optional(),
    funnel_id: z.string().min(1, "O funil é obrigatório"),
    stage_id: z.string().min(1, "A etapa é obrigatória"),
    value: z.coerce.number().min(0, "O valor deve ser positivo"),
    priority: z.enum(["low", "medium", "high"]),
    description: z.string().optional(),
    responsible_id: z.string().optional(),
    // Legacy fields optional
    product_service_id: z.string().optional(),
    quantity: z.coerce.number().optional(),
    assigned_professional_id: z.string().optional(),
});

interface EditDealModalProps {
    deal: CRMDeal;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function EditDealModal({ deal, open, onOpenChange }: EditDealModalProps) {
    const queryClient = useQueryClient();
    const { data: staffMembers } = useStaff();

    const [products, setProducts] = useState<ProductItem[]>([]);

    // Fetch existing deal products
    const { data: existingProducts } = useDealProducts(deal?.id);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: deal.title,
            value: deal.value,
            priority: deal.priority || "medium",
            funnel_id: deal.funnel_id,
            stage_id: deal.stage_id,
            description: deal.description || "",
            responsible_id: deal.responsible_id || "",
            contact_id: deal.contact_id || undefined,
            // Legacy
            product_service_id: deal.product_service_id || "",
            quantity: deal.quantity || 1,
            assigned_professional_id: deal.assigned_professional_id || "",
        },
    });

    // Reset when deal changes and populate products
    useEffect(() => {
        if (deal && open) {
            form.reset({
                title: deal.title,
                value: deal.value,
                priority: deal.priority || "medium",
                funnel_id: deal.funnel_id,
                stage_id: deal.stage_id,
                description: deal.description || "",
                responsible_id: deal.responsible_id || "",
                contact_id: deal.contact_id || undefined,
                product_service_id: deal.product_service_id || "",
                quantity: deal.quantity || 1,
                assigned_professional_id: deal.assigned_professional_id || "",
            });

            // Populate products from query
            if (existingProducts && existingProducts.length > 0) {
                setProducts(existingProducts.map(p => ({
                    id: p.id,
                    category: p.product_service?.type || 'product',
                    productServiceId: p.product_service_id,
                    quantity: p.quantity,
                    unitPrice: p.unit_price,
                    name: p.product_service?.name
                })));
            } else if (deal.product_service_id) {
                // Se não tem deal_products mas tem product_service_id antigo, migrar visualmente
                // Mas aqui não temos o preço/name do antigo sem query extra.
                // O ideal é que o hook useDealProducts retorne vazio e o user adicione.
                // Ou se quisermos ser gentis, buscar o produto antigo.
                setProducts([]);
            } else {
                setProducts([]);
            }
        }
    }, [deal, open, form, existingProducts]);

    // Update value when products change
    useEffect(() => {
        const total = products.reduce((sum, p) => sum + (p.quantity * p.unitPrice), 0);
        if (total > 0) {
            form.setValue("value", total);
        }
    }, [products, form]);


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

    // Fetch Stages
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



    // Fetch Products/Services for selection
    const { data: productsServices = [] } = useQuery({
        queryKey: ['products-services'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('products_services' as any)
                .select('*')
                .order('name', { ascending: true });
            if (error) throw error;
            return data as unknown as { id: string; name: string; type: 'product' | 'service'; price: number }[];
        },
    });


    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        try {
            // Update Deal
            const cleanedValues = {
                title: values.title,
                contact_id: values.contact_id || null,
                funnel_id: values.funnel_id,
                stage_id: values.stage_id,
                value: values.value,
                priority: values.priority,
                description: values.description,
                responsible_id: values.responsible_id || null,
                // Legacy fields sync
                product_service_id: products[0]?.productServiceId || null,
                quantity: products[0]?.quantity || null,
                assigned_professional_id: values.assigned_professional_id || null, // UI removed but keep value if passed
            };

            const { error } = await supabase
                .from("crm_deals" as any)
                .update({
                    ...cleanedValues,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", deal.id);

            if (error) throw error;

            // Update Products: Replace Strategy (simpler for now)
            // 1. Delete existing
            await supabase.from('crm_deal_products' as any).delete().eq('deal_id', deal.id);

            // 2. Insert new
            if (products.length > 0) {
                const dealProductsData = products
                    .filter(p => p.productServiceId)
                    .map(p => ({
                        deal_id: deal.id,
                        product_service_id: p.productServiceId,
                        quantity: p.quantity,
                        unit_price: p.unitPrice
                    }));

                if (dealProductsData.length > 0) {
                    await supabase.from('crm_deal_products' as any).insert(dealProductsData);
                }
            }

            toast.success("Negociação atualizada!");
            queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
            queryClient.invalidateQueries({ queryKey: ["deal-products", deal.id] });
            onOpenChange(false);
        } catch (error) {
            console.error("Erro ao atualizar negociação:", error);
            toast.error("Erro ao atualizar negociação");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
                <DialogHeader className="shrink-0 px-1">
                    <DialogTitle>Editar Negociação</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 overflow-y-auto flex-1 px-1 pb-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
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

                        {/* Contato */}
                        <FormField
                            control={form.control}
                            name="contact_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Contato</FormLabel>
                                    <ContactPicker
                                        value={field.value}
                                        onChange={(val) => field.onChange(val)}
                                    />
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Produtos/Serviços (Multi) */}
                        <div className="border rounded-lg p-3 bg-muted/10">
                            <DealProductsForm
                                products={products}
                                onChange={setProducts}
                                availableProducts={productsServices}
                            />
                        </div>

                        {/* Funnel + Stage */}
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

                        {/* Valor Total + Prioridade + Responsável */}
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="value"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Valor Total (R$)</FormLabel>
                                        <FormControl>
                                            <CurrencyInput
                                                value={field.value}
                                                onChange={field.onChange}
                                            />
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
