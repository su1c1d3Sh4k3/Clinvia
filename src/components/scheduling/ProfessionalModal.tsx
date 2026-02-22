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
import { Loader2, Upload, X, CalendarDays, CheckCircle2, Unlink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { GoogleCalendarConnection, GoogleSyncMode } from "@/types/googleCalendar";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

function buildGoogleOAuthUrl(userId: string, professionalId: string | null): string {
    const state = btoa(JSON.stringify({
        user_id: userId,
        professional_id: professionalId,
        nonce: crypto.randomUUID(),
        timestamp: Date.now(),
    }));
    localStorage.setItem("google_oauth_state", state);

    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: `${window.location.origin}/scheduling`,
        response_type: "code",
        scope: [
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/userinfo.email",
        ].join(" "),
        access_type: "offline",
        prompt: "consent",
        state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

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
                                        <Input placeholder="Ex: Biomédica" {...field} />
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

                        {/* Google Calendar – só disponível ao editar profissional existente */}
                        {professionalToEdit && (
                            <GoogleCalendarSection professionalId={professionalToEdit.id} />
                        )}

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

// ─── Google Calendar Section ─────────────────────────────────────────────────

function GoogleCalendarSection({ professionalId }: { professionalId: string }) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const [isSavingMode, setIsSavingMode] = useState(false);

    const { data: connection, isLoading } = useQuery<GoogleCalendarConnection | null>({
        queryKey: ["google-calendar-connection", professionalId],
        queryFn: async () => {
            const { data } = await supabase
                .from("professional_google_calendars")
                .select("*")
                .eq("professional_id", professionalId)
                .eq("is_active", true)
                .maybeSingle();
            return data as GoogleCalendarConnection | null;
        },
    });

    const handleConnect = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            toast({ title: "Erro", description: "Usuário não autenticado", variant: "destructive" });
            return;
        }
        if (!GOOGLE_CLIENT_ID) {
            toast({
                title: "Configuração pendente",
                description: "VITE_GOOGLE_CLIENT_ID não configurado. Adicione a variável no .env.",
                variant: "destructive",
            });
            return;
        }
        window.location.href = buildGoogleOAuthUrl(user.id, professionalId);
    };

    const handleDisconnect = async () => {
        if (!connection) return;
        setIsDisconnecting(true);
        try {
            await supabase
                .from("professional_google_calendars")
                .update({ is_active: false })
                .eq("id", connection.id);
            toast({ title: "Google Calendar desconectado" });
            queryClient.invalidateQueries({ queryKey: ["google-calendar-connection", professionalId] });
        } catch {
            toast({ title: "Erro ao desconectar", variant: "destructive" });
        } finally {
            setIsDisconnecting(false);
        }
    };

    const handleSyncModeChange = async (mode: GoogleSyncMode) => {
        if (!connection) return;
        setIsSavingMode(true);
        try {
            await supabase
                .from("professional_google_calendars")
                .update({ sync_mode: mode })
                .eq("id", connection.id);
            toast({ title: "Modo de sincronização atualizado" });
            queryClient.invalidateQueries({ queryKey: ["google-calendar-connection", professionalId] });
        } catch {
            toast({ title: "Erro ao atualizar", variant: "destructive" });
        } finally {
            setIsSavingMode(false);
        }
    };

    return (
        <>
            <Separator />
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Google Calendar</span>
                </div>

                {isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Verificando conexão...
                    </div>
                ) : connection ? (
                    <div className="space-y-3">
                        {/* Status conectado */}
                        <div className="flex items-center justify-between rounded-lg border p-3 bg-green-50 dark:bg-green-950/20">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                                <div>
                                    <p className="text-sm font-medium text-green-800 dark:text-green-400">Conectado</p>
                                    <p className="text-xs text-muted-foreground">{connection.google_account_email}</p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleDisconnect}
                                disabled={isDisconnecting}
                                className="text-destructive hover:text-destructive"
                            >
                                {isDisconnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
                            </Button>
                        </div>

                        {/* Modo de sincronização */}
                        <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">Modo de sincronização</p>
                            <RadioGroup
                                value={connection.sync_mode}
                                onValueChange={(v) => handleSyncModeChange(v as GoogleSyncMode)}
                                disabled={isSavingMode}
                            >
                                <div className="flex items-start space-x-2">
                                    <RadioGroupItem value="one_way" id={`one_way_${professionalId}`} className="mt-1" />
                                    <Label htmlFor={`one_way_${professionalId}`} className="cursor-pointer">
                                        <span className="font-medium text-sm">Mão única</span>
                                        <p className="text-xs text-muted-foreground">Agendamentos da plataforma aparecem no Google Calendar</p>
                                    </Label>
                                </div>
                                <div className="flex items-start space-x-2">
                                    <RadioGroupItem value="two_way" id={`two_way_${professionalId}`} className="mt-1" />
                                    <Label htmlFor={`two_way_${professionalId}`} className="cursor-pointer">
                                        <span className="font-medium text-sm">Mão dupla</span>
                                        <p className="text-xs text-muted-foreground">Sincronização completa — bloqueios do Google valem na plataforma</p>
                                    </Label>
                                </div>
                            </RadioGroup>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                            Conecte para espelhar os agendamentos deste profissional no Google Calendar.
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full gap-2"
                            onClick={handleConnect}
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            Conectar Google Calendar
                        </Button>
                    </div>
                )}
            </div>
        </>
    );
}
