import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Button } from "@/components/ui/button";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { format, addMinutes, parseISO, set } from "date-fns";
import { ContactPicker } from "@/components/ui/contact-picker";

import { useOwnerId } from "@/hooks/useOwnerId";


const formSchema = z.object({
    type: z.enum(["appointment", "absence"]),
    professional_id: z.string().min(1, "Profissional é obrigatório"),
    date: z.string().min(1, "Data é obrigatória"),
    start_time: z.string().min(1, "Horário de início é obrigatório"),
    description: z.string().optional(),

    // Appointment specific
    contact_id: z.string().optional(),
    contact_name: z.string().optional(),
    contact_phone: z.string().optional(),
    service_id: z.string().optional(),
    price: z.coerce.number().optional(),
    duration: z.coerce.number().optional(),

    // Absence specific
    end_time: z.string().optional(),
}).superRefine((data, ctx) => {
    if (data.type === "appointment") {
        if (!data.contact_name || data.contact_name.length < 1) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Nome é obrigatório",
                path: ["contact_name"],
            });
        }
        if (!data.duration || data.duration < 10) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Duração mínima é 10 minutos",
                path: ["duration"],
            });
        }
    }
    if (data.type === "absence") {
        if (!data.end_time) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Horário de fim é obrigatório",
                path: ["end_time"],
            });
        }
    }
});

interface AppointmentModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    defaultDate?: Date;
    defaultProfessionalId?: string;
    appointmentToEdit?: any;
    // Props for pre-filled contact from conversation
    defaultContactId?: string;
    defaultContactName?: string;
    defaultContactPhone?: string;
    hideTypeTabs?: boolean; // Hide appointment/absence tabs
}

export function AppointmentModal({ open, onOpenChange, defaultDate, defaultProfessionalId, appointmentToEdit, defaultContactId, defaultContactName, defaultContactPhone, hideTypeTabs }: AppointmentModalProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<"appointment" | "absence">("appointment");
    const [isLoading, setIsLoading] = useState(false);
    const { data: ownerId } = useOwnerId();

    const isPast = appointmentToEdit && new Date(appointmentToEdit.end_time) < new Date();

    const { data: professionals } = useQuery({
        queryKey: ["professionals-list"],
        queryFn: async () => {
            const { data, error } = await supabase.from("professionals").select("id, name");
            if (error) throw error;
            return data;
        },
    });

    const { data: services } = useQuery({
        queryKey: ["services-list-full"],
        queryFn: async () => {
            const { data, error } = await supabase.from("products_services").select("*").eq("type", "service");
            console.log('[DEBUG] Services query result:', data);
            if (error) throw error;
            return data;
        },
    });



    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            contact_name: "",
            contact_phone: "",
            date: format(new Date(), "yyyy-MM-dd"),
            start_time: "09:00",
            end_time: "10:00",
            duration: 30,
            price: 0,
            description: "",
            type: "appointment",
        },
    });

    // Watch professional_id and date to fetch existing appointments
    const watchProfessionalId = form.watch("professional_id");
    const watchDate = form.watch("date");
    const watchDuration = form.watch("duration") || 30;

    // Fetch existing appointments for the selected professional and date
    const { data: existingAppointments } = useQuery({
        queryKey: ["existing-appointments", watchProfessionalId, watchDate],
        queryFn: async () => {
            if (!watchProfessionalId || !watchDate) return [];

            const startOfDay = `${watchDate}T00:00:00`;
            const endOfDay = `${watchDate}T23:59:59`;

            const { data, error } = await supabase
                .from("appointments")
                .select("id, start_time, end_time")
                .eq("professional_id", watchProfessionalId)
                .gte("start_time", startOfDay)
                .lte("start_time", endOfDay);

            if (error) throw error;
            return data || [];
        },
        enabled: !!watchProfessionalId && !!watchDate,
    });

    // Generate available time slots with dynamic intervals and past time filtering
    const availableTimeSlots = useMemo(() => {
        const slots: { value: string; label: string; disabled: boolean }[] = [];
        const now = new Date();
        const isToday = watchDate === format(now, "yyyy-MM-dd");

        // Use duration as interval, with minimum of 10 minutes
        const interval = Math.max(watchDuration || 30, 10);

        // Start from 8:00 (480 minutes from midnight) to 20:00 (1200 minutes)
        const startMinutes = 8 * 60;
        const endMinutes = 20 * 60;

        for (let totalMinutes = startMinutes; totalMinutes <= endMinutes; totalMinutes += interval) {
            const hour = Math.floor(totalMinutes / 60);
            const minute = totalMinutes % 60;
            const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            const slotStart = new Date(`${watchDate}T${timeStr}`);
            const slotEnd = addMinutes(slotStart, watchDuration);

            // Skip past times for today
            if (isToday && slotStart <= now) {
                continue;
            }

            // Check if this slot conflicts with any existing appointment
            let isConflicting = false;

            if (existingAppointments) {
                for (const apt of existingAppointments) {
                    // Skip current appointment if editing
                    if (appointmentToEdit && apt.id === appointmentToEdit.id) continue;

                    const aptStart = new Date(apt.start_time);
                    const aptEnd = new Date(apt.end_time);

                    // Check overlap: slot conflicts if (slotStart < aptEnd) && (slotEnd > aptStart)
                    if (slotStart < aptEnd && slotEnd > aptStart) {
                        isConflicting = true;
                        break;
                    }
                }
            }

            slots.push({
                value: timeStr,
                label: isConflicting ? `${timeStr} (ocupado)` : timeStr,
                disabled: isConflicting
            });
        }

        return slots;
    }, [watchDate, watchDuration, existingAppointments, appointmentToEdit]);

    useEffect(() => {
        if (open) {
            if (appointmentToEdit) {
                setActiveTab(appointmentToEdit.type);
                form.reset({
                    contact_id: appointmentToEdit.contact_id,
                    contact_name: appointmentToEdit.contacts?.push_name || "",
                    contact_phone: appointmentToEdit.contacts?.number || "",
                    professional_id: appointmentToEdit.professional_id,
                    service_id: appointmentToEdit.service_id,
                    date: format(new Date(appointmentToEdit.start_time), "yyyy-MM-dd"),
                    start_time: format(new Date(appointmentToEdit.start_time), "HH:mm"),
                    end_time: format(new Date(appointmentToEdit.end_time), "HH:mm"),
                    duration: (new Date(appointmentToEdit.end_time).getTime() - new Date(appointmentToEdit.start_time).getTime()) / 60000,
                    price: appointmentToEdit.price,
                    description: appointmentToEdit.description || "",
                    type: appointmentToEdit.type,
                });
            } else {
                form.reset({
                    contact_id: defaultContactId || "",
                    contact_name: defaultContactName || "",
                    contact_phone: defaultContactPhone || "",
                    professional_id: defaultProfessionalId || "",
                    date: defaultDate ? format(defaultDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd"),
                    start_time: defaultDate ? format(defaultDate, "HH:mm") : "09:00",
                    end_time: defaultDate ? format(addMinutes(defaultDate, 60), "HH:mm") : "10:00",
                    duration: 30,
                    price: 0,
                    description: "",
                    type: activeTab,
                });
            }
        }
    }, [open, defaultDate, defaultProfessionalId, appointmentToEdit, activeTab, form, defaultContactId, defaultContactName, defaultContactPhone]);

    const handleServiceChange = (serviceId: string) => {
        console.log('[DEBUG] handleServiceChange called with:', serviceId);
        console.log('[DEBUG] Available services:', services);
        const service = services?.find((s: any) => s.id === serviceId) as any;
        console.log('[DEBUG] Found service:', service);
        console.log('[DEBUG] Service fields - duration_minutes:', service?.duration_minutes, 'price:', service?.price);
        if (service) {
            const duration = service.duration_minutes ?? 30;
            const price = service.price ?? 0;
            console.log('[DEBUG] Setting duration:', duration, 'price:', price);
            form.setValue("duration", duration);
            form.setValue("price", price);
        }
    };



    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");
            if (!ownerId) throw new Error("ID da organização não encontrado");

            const startDateTime = parseISO(`${values.date}T${values.start_time}`);
            let endDateTime;

            if (!appointmentToEdit && startDateTime < new Date()) {
                throw new Error("Não é possível criar agendamentos no passado.");
            }

            if (values.type === "absence") {
                if (!values.end_time) throw new Error("Horário de fim é obrigatório");
                endDateTime = parseISO(`${values.date}T${values.end_time}`);
                if (endDateTime <= startDateTime) {
                    throw new Error("Horário de fim deve ser maior que o início");
                }
            } else {
                endDateTime = addMinutes(startDateTime, values.duration || 30);
            }

            // Check overlap
            const { data: isOverlap, error: overlapError } = await supabase.rpc("check_appointment_overlap", {
                p_professional_id: values.professional_id,
                p_start_time: startDateTime.toISOString(),
                p_end_time: endDateTime.toISOString(),
                p_exclude_id: appointmentToEdit?.id || null,
            });

            if (overlapError) throw overlapError;
            if (isOverlap) {
                throw new Error("Horário indisponível (encavalado)!");
            }

            const payload = {
                user_id: ownerId,
                professional_id: values.professional_id,
                contact_id: values.contact_id || null,
                service_id: values.type === "appointment" ? values.service_id : null,
                start_time: startDateTime.toISOString(),
                end_time: endDateTime.toISOString(),
                price: values.type === "appointment" ? values.price : 0,
                description: values.description,
                type: values.type,
            };

            if (appointmentToEdit) {
                const { error } = await supabase
                    .from("appointments")
                    .update(payload)
                    .eq("id", appointmentToEdit.id);
                if (error) throw error;
                toast({ title: "Agendamento atualizado!" });
                // Fire-and-forget: sincronizar com Google Calendar
                if (ownerId) {
                    supabase.functions.invoke("google-calendar-sync", {
                        body: { action: "sync_appointment", appointment_id: appointmentToEdit.id, user_id: ownerId },
                    }).catch(() => {});
                }
            } else {
                const { data: created, error } = await supabase
                    .from("appointments")
                    .insert(payload)
                    .select()
                    .single();
                if (error) throw error;
                toast({ title: "Agendamento criado!" });
                // Fire-and-forget: sincronizar com Google Calendar
                if (created?.id && ownerId) {
                    supabase.functions.invoke("google-calendar-sync", {
                        body: { action: "sync_appointment", appointment_id: created.id, user_id: ownerId },
                    }).catch(() => {});
                }
            }

            queryClient.invalidateQueries({ queryKey: ["appointments"] });
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
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{appointmentToEdit ? "Editar" : "Novo"} {activeTab === "appointment" ? "Agendamento" : "Ausência"}</DialogTitle>
                </DialogHeader>

                <Tabs value={activeTab} onValueChange={(v) => {
                    if (!appointmentToEdit) {
                        setActiveTab(v as any);
                        form.setValue("type", v as any);
                    }
                }}>
                    {!appointmentToEdit && !hideTypeTabs && (
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="appointment">Agendamento</TabsTrigger>
                            <TabsTrigger value="absence">Ausência</TabsTrigger>
                        </TabsList>
                    )}

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
                            console.log('[DEBUG] Form validation errors:', errors);
                            const firstError = Object.values(errors)[0];
                            if (firstError?.message) {
                                toast({
                                    title: "Erro de validação",
                                    description: String(firstError.message),
                                    variant: "destructive",
                                });
                            }
                        })} className="space-y-4 mt-4">
                            <FormField
                                control={form.control}
                                name="professional_id"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Profissional</FormLabel>
                                        <Select
                                            onValueChange={field.onChange}
                                            defaultValue={field.value}
                                            disabled={!!defaultProfessionalId || !!appointmentToEdit || isPast}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {professionals?.map((p) => (
                                                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {activeTab === "appointment" && (
                                <>
                                    <FormField
                                        control={form.control}
                                        name="contact_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Contato</FormLabel>
                                                <ContactPicker
                                                    value={field.value}
                                                    onChange={(val, contact) => {
                                                        field.onChange(val);
                                                        if (contact) {
                                                            form.setValue("contact_name", contact.push_name);
                                                            const phone = contact.number ? contact.number.split('@')[0] : "";
                                                            form.setValue("contact_phone", phone);
                                                        }
                                                    }}
                                                    disabled={isPast || !!defaultContactId}
                                                />
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="contact_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Nome do Cliente</FormLabel>
                                                <FormControl>
                                                    <Input {...field} disabled={!!form.watch('contact_id') || isPast} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="contact_phone"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Telefone</FormLabel>
                                                <FormControl>
                                                    <Input {...field} disabled={!!form.watch('contact_id') || isPast} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="service_id"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Serviço</FormLabel>
                                                <Select onValueChange={(val) => { field.onChange(val); handleServiceChange(val); }} defaultValue={field.value} disabled={isPast}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Selecione" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {services?.map((s) => (
                                                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="date"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Data</FormLabel>
                                            <FormControl>
                                                <Input type="date" {...field} disabled={isPast} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="start_time"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Início</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value} disabled={isPast}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Selecione" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {availableTimeSlots.map((slot) => (
                                                        <SelectItem
                                                            key={slot.value}
                                                            value={slot.value}
                                                            disabled={slot.disabled}
                                                            className={slot.disabled ? "text-red-400 opacity-50" : ""}
                                                        >
                                                            {slot.label} {slot.disabled && "(ocupado)"}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {activeTab === "appointment" ? (
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        control={form.control}
                                        name="duration"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Duração (min)</FormLabel>
                                                <FormControl>
                                                    <Input type="number" min={10} {...field} disabled={!!form.watch('service_id') || isPast} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="price"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Valor (R$)</FormLabel>
                                                <FormControl>
                                                    <CurrencyInput
                                                        value={field.value || 0}
                                                        onChange={field.onChange}
                                                        disabled={!!form.watch('service_id') || isPast}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            ) : (
                                <FormField
                                    control={form.control}
                                    name="end_time"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Fim</FormLabel>
                                            <FormControl>
                                                <Input type="time" {...field} disabled={isPast} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            )}

                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Descrição</FormLabel>
                                        <FormControl>
                                            <Textarea {...field} disabled={isPast} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <Button type="submit" className="w-full" disabled={isLoading || isPast}>
                                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                {isPast ? "Agendamento Finalizado" : "Salvar"}
                            </Button>
                        </form>
                    </Form>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
