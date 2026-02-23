import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, X } from "lucide-react";

const formSchema = z.object({
    name: z.string().min(1, "Nome é obrigatório"),
    description: z.string().optional(),
    price: z.coerce.number().min(0, "Valor deve ser positivo"),
    stock_quantity: z.coerce.number().optional(),
    duration_minutes: z.coerce.number().optional(),
    opportunity_alert_days: z.coerce.number().min(0, "Dias deve ser positivo").default(0),
    color: z.string().nullable().optional(),
});

interface ProductServiceModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    itemToEdit?: any;
}

export function ProductServiceModal({ open, onOpenChange, itemToEdit }: ProductServiceModalProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<"product" | "service">("product");
    const [isLoading, setIsLoading] = useState(false);
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [existingImages, setExistingImages] = useState<string[]>([]);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            description: "",
            price: 0,
            stock_quantity: 0,
            duration_minutes: 0,
            opportunity_alert_days: 0,
            color: null,
        },
    });

    useEffect(() => {
        if (itemToEdit) {
            setActiveTab(itemToEdit.type);
            form.reset({
                name: itemToEdit.name,
                description: itemToEdit.description || "",
                price: itemToEdit.price,
                stock_quantity: itemToEdit.stock_quantity || 0,
                duration_minutes: itemToEdit.duration_minutes || 0,
                opportunity_alert_days: itemToEdit.opportunity_alert_days || 0,
                color: itemToEdit.color ?? null,
            });
            setExistingImages(itemToEdit.image_urls || []);
        } else {
            form.reset({
                name: "",
                description: "",
                price: 0,
                stock_quantity: 0,
                duration_minutes: 0,
                opportunity_alert_days: 0,
                color: null,
            });
            setExistingImages([]);
            setImageFiles([]);
        }
    }, [itemToEdit, open, form]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            setImageFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
        }
    };

    const removeNewImage = (index: number) => {
        setImageFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const removeExistingImage = (index: number) => {
        setExistingImages((prev) => prev.filter((_, i) => i !== index));
    };

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");

            // Upload images
            const uploadedUrls: string[] = [];
            for (const file of imageFiles) {
                const fileExt = file.name.split('.').pop();
                const fileName = `${Math.random()}.${fileExt}`;
                const filePath = `${user.id}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('product-images')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('product-images')
                    .getPublicUrl(filePath);

                uploadedUrls.push(publicUrl);
            }

            const finalImageUrls = [...existingImages, ...uploadedUrls];

            const payload = {
                user_id: user.id,
                type: activeTab,
                name: values.name,
                description: values.description,
                price: values.price,
                opportunity_alert_days: values.opportunity_alert_days,
                image_urls: finalImageUrls,
                stock_quantity: activeTab === "product" ? values.stock_quantity : null,
                duration_minutes: activeTab === "service" ? values.duration_minutes : null,
                color: activeTab === "service" ? (values.color ?? null) : null,
            };

            if (itemToEdit) {
                const { error } = await supabase
                    .from("products_services")
                    .update(payload)
                    .eq("id", itemToEdit.id);
                if (error) throw error;
                toast({ title: "Item atualizado com sucesso!" });
            } else {
                const { error } = await supabase
                    .from("products_services")
                    .insert(payload);
                if (error) throw error;
                toast({ title: "Item criado com sucesso!" });
            }

            queryClient.invalidateQueries({ queryKey: ["products-services"] });
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
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{itemToEdit ? "Editar Item" : "Novo Item"}</DialogTitle>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={(v) => !itemToEdit && setActiveTab(v as any)}>
                    {!itemToEdit && (
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="product">Produto</TabsTrigger>
                            <TabsTrigger value="service">Serviço</TabsTrigger>
                        </TabsList>
                    )}

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Nome</FormLabel>
                                        <FormControl>
                                            <Input placeholder="Nome do item" {...field} />
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
                                        <FormLabel>Descrição</FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="Descrição detalhada" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="price"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Valor (R$)</FormLabel>
                                            <FormControl>
                                                <CurrencyInput
                                                    value={field.value}
                                                    onChange={field.onChange}
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                0 para "Sob Consulta"
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {activeTab === "product" ? (
                                    <FormField
                                        control={form.control}
                                        name="stock_quantity"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Estoque</FormLabel>
                                                <FormControl>
                                                    <Input type="number" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                ) : (
                                    <FormField
                                        control={form.control}
                                        name="duration_minutes"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Duração (minutos)</FormLabel>
                                                <FormControl>
                                                    <Input type="number" {...field} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>

                            {activeTab === "service" && (
                                <FormField
                                    control={form.control}
                                    name="color"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Cor do Serviço (opcional)</FormLabel>
                                            <FormControl>
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="color"
                                                        value={field.value || "#3b82f6"}
                                                        onChange={(e) => field.onChange(e.target.value)}
                                                        className="h-9 w-16 rounded border cursor-pointer p-1"
                                                    />
                                                    <span className="text-sm text-muted-foreground">
                                                        Exibida na lateral do card de agendamento
                                                    </span>
                                                    {field.value && (
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => field.onChange(null)}
                                                        >
                                                            Remover
                                                        </Button>
                                                    )}
                                                </div>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            <FormField
                                control={form.control}
                                name="opportunity_alert_days"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Alerta de Oportunidade (dias)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} />
                                        </FormControl>
                                        <FormDescription>
                                            Dias para notificar nova oportunidade após venda
                                        </FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="space-y-2">
                                <FormLabel>Imagens</FormLabel>
                                <div className="flex flex-wrap gap-4">
                                    {existingImages.map((url, index) => (
                                        <div key={`existing-${index}`} className="relative w-20 h-20">
                                            <img src={url} alt="Item" className="w-full h-full object-cover rounded-md" />
                                            <button
                                                type="button"
                                                onClick={() => removeExistingImage(index)}
                                                className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                    {imageFiles.map((file, index) => (
                                        <div key={`new-${index}`} className="relative w-20 h-20">
                                            <img src={URL.createObjectURL(file)} alt="Preview" className="w-full h-full object-cover rounded-md" />
                                            <button
                                                type="button"
                                                onClick={() => removeNewImage(index)}
                                                className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ))}
                                    <label className="w-20 h-20 flex items-center justify-center border-2 border-dashed rounded-md cursor-pointer hover:bg-accent">
                                        <Upload className="w-6 h-6 text-muted-foreground" />
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            onChange={handleImageUpload}
                                        />
                                    </label>
                                </div>
                            </div>

                            <Button type="submit" className="w-full" disabled={isLoading}>
                                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Salvar
                            </Button>
                        </form>
                    </Form>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
