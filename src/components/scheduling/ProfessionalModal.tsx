import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const formSchema = z.object({
    name: z.string().min(1, "Nome é obrigatório"),
    role: z.string().optional(),
    commission: z.number().min(0).max(100).default(0),
    service_ids: z.array(z.string()).default([]),
    work_days: z.array(z.number()).default([]),
    work_hours: z.object({
        start: z.string(),
        end: z.string(),
        break_start: z.string(),
        break_end: z.string(),
    }),
});

interface ProfessionalModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    professionalToEdit?: any;
}

const DAYS = [
    { id: 0, label: "Dom" },
    { id: 1, label: "Seg" },
    { id: 2, label: "Ter" },
    { id: 3, label: "Qua" },
    { id: 4, label: "Qui" },
    { id: 5, label: "Sex" },
    { id: 6, label: "Sáb" },
];

export function ProfessionalModal({ open, onOpenChange, professionalToEdit }: ProfessionalModalProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isLoading, setIsLoading] = useState(false);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [existingPhoto, setExistingPhoto] = useState<string | null>(null);

    const { data: services } = useQuery({
        queryKey: ["services-list"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("products_services")
                .select("id, name")
                .eq("type", "service");
            if (error) throw error;
            return data;
        },
    });

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            role: "",
            commission: 0,
            service_ids: [],
            work_days: [1, 2, 3, 4, 5], // Mon-Fri default
            work_hours: {
                start: "09:00",
                end: "18:00",
                break_start: "12:00",
                break_end: "13:00",
            },
        },
    });

    useEffect(() => {
        if (professionalToEdit) {
            form.reset({
                name: professionalToEdit.name,
                role: professionalToEdit.role || "",
                commission: professionalToEdit.commission || 0,
                service_ids: professionalToEdit.service_ids || [],
                work_days: professionalToEdit.work_days || [],
                work_hours: professionalToEdit.work_hours || {
                    start: "09:00",
                    end: "18:00",
                    break_start: "12:00",
                    break_end: "13:00",
                },
            });
            setExistingPhoto(professionalToEdit.photo_url);
        } else {
            form.reset({
                name: "",
                role: "",
                commission: 0,
                service_ids: [],
                work_days: [1, 2, 3, 4, 5],
                work_hours: {
                    start: "09:00",
                    end: "18:00",
                    break_start: "12:00",
                    break_end: "13:00",
                },
            });
            setExistingPhoto(null);
            setPhotoFile(null);
        }
    }, [professionalToEdit, open, form]);

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setPhotoFile(e.target.files[0]);
        }
    };

    const toggleService = (serviceId: string) => {
        const current = form.getValues("service_ids");
        if (current.includes(serviceId)) {
            form.setValue("service_ids", current.filter(id => id !== serviceId));
        } else {
            form.setValue("service_ids", [...current, serviceId]);
        }
    };

    const toggleDay = (dayId: number) => {
        const current = form.getValues("work_days");
        if (current.includes(dayId)) {
            form.setValue("work_days", current.filter(d => d !== dayId));
        } else {
            form.setValue("work_days", [...current, dayId]);
        }
    };

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");

            let photoUrl = existingPhoto;

            if (photoFile) {
                const fileExt = photoFile.name.split('.').pop();
                const fileName = `${Math.random()}.${fileExt}`;
                const filePath = `${user.id}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('professional-avatars')
                    .upload(filePath, photoFile);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('professional-avatars')
                    .getPublicUrl(filePath);

                photoUrl = publicUrl;
            }

            const payload = {
                user_id: user.id,
                name: values.name,
                role: values.role,
                commission: values.commission,
                service_ids: values.service_ids,
                work_days: values.work_days,
                work_hours: values.work_hours,
                photo_url: photoUrl,
            };

            if (professionalToEdit) {
                const { error } = await supabase
                    .from("professionals")
                    .update(payload)
                    .eq("id", professionalToEdit.id);
                if (error) throw error;
                toast({ title: "Profissional atualizado com sucesso!" });
            } else {
                const { error } = await supabase
                    .from("professionals")
                    .insert(payload);
                if (error) throw error;
                toast({ title: "Profissional criado com sucesso!" });
            }

            queryClient.invalidateQueries({ queryKey: ["professionals"] });
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
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">
                <DialogHeader>
                    <DialogTitle>{professionalToEdit ? "Editar Profissional" : "Novo Profissional"}</DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="flex justify-center mb-4">
                            <div className="relative w-24 h-24">
                                <img
                                    src={photoFile ? URL.createObjectURL(photoFile) : existingPhoto || "https://github.com/shadcn.png"}
                                    alt="Avatar"
                                    className="w-full h-full object-cover rounded-full border-2 border-border"
                                />
                                <label className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1 cursor-pointer hover:bg-primary/90">
                                    <Upload className="w-4 h-4" />
                                    <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                                </label>
                            </div>
                        </div>

                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nome</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Nome do profissional" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="role"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Função</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: Cabeleireiro" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="commission"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Comissão (%)</FormLabel>
                                    <FormControl>
                                        <div className="relative">
                                            <Input
                                                type="number"
                                                min={0}
                                                max={100}
                                                placeholder="0"
                                                {...field}
                                                onChange={(e) => field.onChange(Number(e.target.value))}
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                                        </div>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="space-y-2">
                            <FormLabel>Serviços</FormLabel>
                            <div className="flex flex-wrap gap-2 border p-2 rounded-md min-h-[40px]">
                                {services?.map((service) => {
                                    const isSelected = form.watch("service_ids").includes(service.id);
                                    return (
                                        <Badge
                                            key={service.id}
                                            variant={isSelected ? "default" : "outline"}
                                            className="cursor-pointer hover:bg-primary/20"
                                            onClick={() => toggleService(service.id)}
                                        >
                                            {service.name}
                                        </Badge>
                                    );
                                })}
                                {services?.length === 0 && <span className="text-muted-foreground text-sm">Nenhum serviço cadastrado</span>}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <FormLabel>Dias de Atendimento</FormLabel>
                            <div className="flex flex-wrap gap-2">
                                {DAYS.map((day) => {
                                    const isSelected = form.watch("work_days").includes(day.id);
                                    return (
                                        <div key={day.id} className="flex items-center space-x-2">
                                            <Checkbox
                                                id={`day-${day.id}`}
                                                checked={isSelected}
                                                onCheckedChange={() => toggleDay(day.id)}
                                            />
                                            <label
                                                htmlFor={`day-${day.id}`}
                                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                            >
                                                {day.label}
                                            </label>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="work_hours.start"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Início</FormLabel>
                                        <FormControl>
                                            <Input type="time" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="work_hours.end"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Fim</FormLabel>
                                        <FormControl>
                                            <Input type="time" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="work_hours.break_start"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Início Intervalo</FormLabel>
                                        <FormControl>
                                            <Input type="time" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="work_hours.break_end"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Fim Intervalo</FormLabel>
                                        <FormControl>
                                            <Input type="time" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Salvar
                        </Button>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
