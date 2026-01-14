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
    DialogTrigger,
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
import { Plus } from "lucide-react";
import { CRMFunnel, CRMStage } from "@/types/crm";
import { useStaff, useCurrentTeamMember } from "@/hooks/useStaff";
import { DealProductsForm, ProductItem } from "./DealProductsForm";

const formSchema = z.object({
    title: z.string().min(1, "O título é obrigatório"),
    contact_id: z.string().optional(),
    funnel_id: z.string().min(1, "O funil é obrigatório"),
    stage_id: z.string().min(1, "A etapa é obrigatória"),
    value: z.coerce.number().min(0, "O valor deve ser positivo"),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    description: z.string().optional(),
    responsible_id: z.string().optional(),
    // Campos legados mantidos opcionais, mas não exibidos
    product_service_id: z.string().optional(),
    quantity: z.coerce.number().optional(),
    assigned_professional_id: z.string().optional(),
});

interface CreateDealModalProps {
    defaultFunnelId?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    defaultContact?: {
        id: string;
        push_name: string;
        number?: string;
    };
    defaultResponsibleId?: string;
    trigger?: React.ReactNode;
}

export function CreateDealModal({
    defaultFunnelId,
    open: controlledOpen,
    onOpenChange: setControlledOpen,
    defaultContact,
    defaultResponsibleId,
    trigger
}: CreateDealModalProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : internalOpen;
    const setOpen = isControlled ? setControlledOpen : setInternalOpen;

    const queryClient = useQueryClient();
    const { data: staffMembers } = useStaff();
    const { data: currentTeamMember } = useCurrentTeamMember();

    // Estado para produtos múltiplos
    const [products, setProducts] = useState<ProductItem[]>([]);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: "",
            value: 0,
            priority: "medium",
            funnel_id: defaultFunnelId || "",
            description: "",
            responsible_id: defaultResponsibleId || "",
            contact_id: defaultContact?.id || "",
        },
    });

    // Reset when opening
    useEffect(() => {
        if (open) {
            if (defaultContact) form.setValue("contact_id", defaultContact.id);
            if (defaultResponsibleId) form.setValue("responsible_id", defaultResponsibleId);
            if (defaultFunnelId) form.setValue("funnel_id", defaultFunnelId);
            setProducts([]); // Clear products on new open
        }
    }, [open, defaultContact, defaultResponsibleId, defaultFunnelId, form]);

    // Atualizar valor total baseado nos produtos
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



    // Fetch Products/Services
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
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) throw new Error("Usuário não autenticado");

            // Preparar dados do Deal
            // Para compatibilidade com KanbanCard antigo (se não atualizarmos),
            // podemos preencher product_service_id com o primeiro item da lista.
            const firstProduct = products[0];

            const dealData = {
                user_id: userData.user.id,
                title: values.title,
                contact_id: values.contact_id || null,
                funnel_id: values.funnel_id,
                stage_id: values.stage_id,
                value: values.value,
                priority: values.priority,
                description: values.description,
                responsible_id: values.responsible_id || currentTeamMember?.id || null,
                // Legacy support (optional)
                product_service_id: firstProduct?.productServiceId || null,
                quantity: firstProduct?.quantity || null,
                assigned_professional_id: values.assigned_professional_id || null,
            };

            // 1. Create Deal
            const { data: deal, error: dealError } = await supabase
                .from("crm_deals" as any)
                .insert(dealData)
                .select()
                .single();

            if (dealError) throw dealError;

            // 2. Insert Deal Products
            if (products.length > 0 && deal) {
                const dealProductsData = products
                    .filter(p => p.productServiceId)
                    .map(p => ({
                        deal_id: (deal as any).id,
                        product_service_id: p.productServiceId,
                        quantity: p.quantity,
                        unit_price: p.unitPrice
                    }));

                if (dealProductsData.length > 0) {
                    const { error: productsError } = await supabase
                        .from('crm_deal_products' as any)
                        .insert(dealProductsData);

                    if (productsError) console.error("Error creating deal products:", productsError);
                }
            }

            // 3. Update History
            if (values.stage_id) {
                const { data: currentStage } = await supabase
                    .from("crm_stages" as any)
                    .select("history")
                    .eq("id", values.stage_id)
                    .single();
                const currentHistory = (currentStage as any)?.history || 0;
                await supabase
                    .from("crm_stages" as any)
                    .update({ history: currentHistory + 1 })
                    .eq("id", values.stage_id);
            }

            toast.success("Negociação criada com sucesso!");
            queryClient.invalidateQueries({ queryKey: ["crm-deals"] });
            queryClient.invalidateQueries({ queryKey: ["crm-stages"] });
            if (setOpen) setOpen(false);
            form.reset();
            setProducts([]);
        } catch (error) {
            console.error("Erro ao criar negociação:", error);
            toast.error("Erro ao criar negociação");
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {trigger ? (
                <DialogTrigger asChild>
                    {trigger}
                </DialogTrigger>
            ) : !isControlled ? (
                <DialogTrigger asChild>
                    <Button>
                        <Plus className="mr-2 h-4 w-4" />
                        Nova Negociação
                    </Button>
                </DialogTrigger>
            ) : null}
            <DialogContent className="max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
                <DialogHeader className="shrink-0 px-1">
                    <DialogTitle>Nova Negociação</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 overflow-y-auto flex-1 px-1 pb-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Título *</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: Contrato Empresa X" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Contatos */}
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
                                        <FormLabel>Funil *</FormLabel>
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
                                        <FormLabel>Etapa *</FormLabel>
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

                        <Button type="submit" className="w-full">
                            Criar Negociação
                        </Button>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
