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

const formSchema = z.object({
    title: z.string().min(1, "O título é obrigatório"),
    contact_id: z.string().optional(),
    product_service_id: z.string().optional(), // NEW - replaces product
    quantity: z.coerce.number().min(1, "Quantidade mínima é 1").default(1), // NEW
    assigned_professional_id: z.string().optional(), // NEW - for services only
    funnel_id: z.string().min(1, "O funil é obrigatório"),
    stage_id: z.string().min(1, "A etapa é obrigatória"),
    value: z.coerce.number().min(0, "O valor deve ser positivo"),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    description: z.string().optional(),
    responsible_id: z.string().optional(),
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

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            title: "",
            quantity: 1, // NEW
            value: 0,
            priority: "medium",
            funnel_id: defaultFunnelId || "",
            description: "",
            product_service_id: "", // NEW - replaces product
            assigned_professional_id: "", // NEW
            responsible_id: defaultResponsibleId || "",
            contact_id: defaultContact?.id || "",
        },
    });

    // Update form when defaults change
    useEffect(() => {
        if (open) {
            if (defaultContact) {
                form.setValue("contact_id", defaultContact.id);
            }
            if (defaultResponsibleId) {
                form.setValue("responsible_id", defaultResponsibleId);
            }
            if (defaultFunnelId) {
                form.setValue("funnel_id", defaultFunnelId);
            }
        }
    }, [open, defaultContact, defaultResponsibleId, defaultFunnelId, form]);

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

    // Fetch Contacts (Simple search or list)
    const { data: contacts, isLoading: isLoadingContacts } = useQuery({
        queryKey: ["contacts-list"],
        queryFn: async () => {
            console.log("Fetching contacts for deal modal...");
            const { data, error } = await supabase
                .from("contacts" as any)
                .select("id, push_name, number")
                .limit(50)
                .order("push_name", { ascending: true });

            if (error) {
                console.error("Error fetching contacts:", error);
                throw error;
            }
            console.log("Contacts fetched:", data);
            return data as { id: string; push_name: string; number?: string }[];
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

            // Query professionals where service_id is in their service_ids array
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
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) throw new Error("Usuário não autenticado");

            // Clean empty strings for UUID fields (convert to null)
            // Use team_member.id for responsible_id (FK compatível com revenues)
            const cleanedValues = {
                ...values,
                contact_id: values.contact_id || null,
                product_service_id: values.product_service_id || null,
                assigned_professional_id: values.assigned_professional_id || null,
                responsible_id: values.responsible_id || currentTeamMember?.id || null,
            };

            const { error } = await supabase
                .from("crm_deals" as any)
                .insert({
                    user_id: userData.user.id,
                    ...cleanedValues,
                });

            if (error) throw error;

            // Increment history counter for the stage where the deal was created
            if (values.stage_id) {
                const { data: currentStage } = await supabase
                    .from("crm_stages" as any)
                    .select("history")
                    .eq("id", values.stage_id)
                    .single();

                const currentHistory = currentStage?.history || 0;

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
            <DialogContent className="max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
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
                                    <FormLabel>Título</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: Contrato Empresa X" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {/* Row 2: Nome (Contato) + Produto/Serviço */}
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
                                                {contacts?.length === 0 ? (
                                                    <div className="p-2 text-sm text-muted-foreground text-center">Nenhum contato encontrado</div>
                                                ) : (
                                                    contacts?.map((contact) => (
                                                        <SelectItem key={contact.id} value={contact.id}>
                                                            {contact.push_name || "Sem Nome"} ({contact.number?.split('@')[0] || "Sem número"})
                                                        </SelectItem>
                                                    ))
                                                )}
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

                        {/* Row 3: Funnel + Stage (sem mudanças) */}
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

                        {/* Conditional Professional Field - Only for Services */}
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

                        <Button type="submit" className="w-full">
                            Criar Negociação
                        </Button>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
