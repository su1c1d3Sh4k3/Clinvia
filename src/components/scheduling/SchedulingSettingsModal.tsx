import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Building2, CheckCircle2, Unlink, CalendarDays, RefreshCw } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { GoogleCalendarConnection, GoogleSyncMode } from "@/types/googleCalendar";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

function buildGoogleOAuthUrl(userId: string): string {
    const state = btoa(JSON.stringify({
        user_id: userId,
        professional_id: null, // null = agenda da clínica
        nonce: crypto.randomUUID(),
        timestamp: Date.now(),
    }));
    localStorage.setItem("google_oauth_state", state);

    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: `${window.location.origin}/scheduling`,
        response_type: "code",
        scope: [
            "https://www.googleapis.com/auth/calendar", // superset: inclui calendar.events + permite criar/gerenciar sub-calendários
            "https://www.googleapis.com/auth/userinfo.email",
        ].join(" "),
        access_type: "offline",
        prompt: "consent",
        state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

const formSchema = z.object({
    start_hour: z.coerce.number().min(0).max(23),
    end_hour: z.coerce.number().min(0).max(23),
    work_days: z.array(z.number()),
    auto_complete: z.boolean().default(false),
});

interface SchedulingSettingsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentSettings?: any;
}

const DAYS = [
    { id: 0, label: "Domingo" },
    { id: 1, label: "Segunda" },
    { id: 2, label: "Terça" },
    { id: 3, label: "Quarta" },
    { id: 4, label: "Quinta" },
    { id: 5, label: "Sexta" },
    { id: 6, label: "Sábado" },
];

export function SchedulingSettingsModal({ open, onOpenChange, currentSettings }: SchedulingSettingsModalProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isLoading, setIsLoading] = useState(false);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            start_hour: 8,
            end_hour: 19,
            work_days: [1, 2, 3, 4, 5],
            auto_complete: false,
        },
    });

    useEffect(() => {
        if (currentSettings) {
            form.reset({
                start_hour: currentSettings.start_hour,
                end_hour: currentSettings.end_hour,
                work_days: currentSettings.work_days,
                auto_complete: currentSettings.auto_complete ?? false,
            });
        }
    }, [currentSettings, form]);

    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Usuário não autenticado");

            if (values.end_hour <= values.start_hour) {
                throw new Error("Horário de fim deve ser maior que o início");
            }

            const payload = {
                user_id: user.id,
                start_hour: values.start_hour,
                end_hour: values.end_hour,
                work_days: values.work_days,
                auto_complete: values.auto_complete,
            };

            // Upsert settings
            const { error } = await supabase
                .from("scheduling_settings")
                .upsert(payload, { onConflict: "user_id" });

            if (error) throw error;

            toast({ title: "Configurações salvas!" });
            queryClient.invalidateQueries({ queryKey: ["scheduling_settings"] });
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
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Configurações de Agendamento</DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="start_hour"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Início do Expediente</FormLabel>
                                        <Select
                                            onValueChange={(val) => field.onChange(Number(val))}
                                            value={String(field.value)}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {Array.from({ length: 24 }).map((_, i) => (
                                                    <SelectItem key={i} value={String(i)}>
                                                        {String(i).padStart(2, '0')}:00
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
                                name="end_hour"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Fim do Expediente</FormLabel>
                                        <Select
                                            onValueChange={(val) => field.onChange(Number(val))}
                                            value={String(field.value)}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Selecione" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {Array.from({ length: 24 }).map((_, i) => (
                                                    <SelectItem key={i} value={String(i)}>
                                                        {String(i).padStart(2, '0')}:00
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="work_days"
                            render={() => (
                                <FormItem>
                                    <div className="mb-4">
                                        <FormLabel className="text-base">Dias de Trabalho</FormLabel>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {DAYS.map((day) => (
                                            <FormField
                                                key={day.id}
                                                control={form.control}
                                                name="work_days"
                                                render={({ field }) => {
                                                    return (
                                                        <FormItem
                                                            key={day.id}
                                                            className="flex flex-row items-start space-x-3 space-y-0"
                                                        >
                                                            <FormControl>
                                                                <Checkbox
                                                                    checked={field.value?.includes(day.id)}
                                                                    onCheckedChange={(checked) => {
                                                                        return checked
                                                                            ? field.onChange([...field.value, day.id])
                                                                            : field.onChange(
                                                                                field.value?.filter(
                                                                                    (value) => value !== day.id
                                                                                )
                                                                            )
                                                                    }}
                                                                />
                                                            </FormControl>
                                                            <FormLabel className="font-normal">
                                                                {day.label}
                                                            </FormLabel>
                                                        </FormItem>
                                                    )
                                                }}
                                            />
                                        ))}
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="auto_complete"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                    <div className="space-y-0.5">
                                        <FormLabel className="text-base">
                                            Lançar receita de agendamentos automaticamente
                                        </FormLabel>
                                        <p className="text-xs text-muted-foreground">
                                            Quando ativo, agendamentos confirmados serão concluídos automaticamente
                                            ao atingir o horário de término, gerando receita automaticamente.
                                            Você pode editar ou cancelar posteriormente na aba Financeiro.
                                        </p>
                                    </div>
                                    <FormControl>
                                        <Switch
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />

                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Salvar Configurações
                        </Button>
                    </form>
                </Form>

                {/* Agenda Global da Clínica */}
                <ClinicCalendarSection />
            </DialogContent>
        </Dialog>
    );
}

// ─── Agenda Global da Clínica ─────────────────────────────────────────────────

function ClinicCalendarSection() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isDisconnecting, setIsDisconnecting] = useState(false);
    const [isSavingMode, setIsSavingMode] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);

    const { data: connection, isLoading } = useQuery<GoogleCalendarConnection | null>({
        queryKey: ["google-calendar-clinic-connection"],
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return null;
            const { data } = await supabase
                .from("professional_google_calendars")
                .select("*")
                .eq("user_id", user.id)
                .is("professional_id", null)
                .eq("is_active", true)
                .maybeSingle();
            return data as GoogleCalendarConnection | null;
        },
    });

    const handleConnect = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        if (!GOOGLE_CLIENT_ID) {
            toast({
                title: "Configuração pendente",
                description: "VITE_GOOGLE_CLIENT_ID não configurado.",
                variant: "destructive",
            });
            return;
        }
        window.location.href = buildGoogleOAuthUrl(user.id);
    };

    const handleDisconnect = async () => {
        if (!connection) return;
        setIsDisconnecting(true);
        try {
            await supabase
                .from("professional_google_calendars")
                .update({ is_active: false })
                .eq("id", connection.id);
            toast({ title: "Agenda da clínica desconectada" });
            queryClient.invalidateQueries({ queryKey: ["google-calendar-clinic-connection"] });
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
            toast({ title: "Modo atualizado" });
            queryClient.invalidateQueries({ queryKey: ["google-calendar-clinic-connection"] });
        } catch {
            toast({ title: "Erro ao atualizar", variant: "destructive" });
        } finally {
            setIsSavingMode(false);
        }
    };

    const handleSyncNow = async () => {
        if (!connection) return;
        setIsSyncing(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Não autenticado");
            const { data, error } = await supabase.functions.invoke("google-calendar-poll", {
                body: { user_id: user.id, connection_id: connection.id },
            });
            if (error) throw error;
            const synced = data?.synced ?? 0;
            const imported = data?.imported ?? 0;
            toast({
                title: "Sincronização concluída",
                description: `${synced} agendamento(s) enviado(s)${imported > 0 ? `, ${imported} evento(s) importado(s) do Google` : ""}.`,
            });
            queryClient.invalidateQueries({ queryKey: ["appointments"] });
        } catch (err: unknown) {
            toast({
                title: "Erro na sincronização",
                description: err instanceof Error ? err.message : String(err),
                variant: "destructive",
            });
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <>
            <Separator className="my-4" />
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-muted-foreground" />
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Agenda Global da Clínica</span>
                </div>
                <p className="text-xs text-muted-foreground">
                    Conecte uma conta Google para receber <strong>todos</strong> os agendamentos de todos os profissionais.
                </p>

                {isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Verificando...
                    </div>
                ) : connection ? (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between rounded-lg border p-3 bg-green-50 dark:bg-green-950/20">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4 text-green-600" />
                                <div>
                                    <p className="text-sm font-medium text-green-800 dark:text-green-400">Agenda conectada</p>
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

                        <div className="space-y-2">
                            <p className="text-xs text-muted-foreground">Modo de sincronização</p>
                            <RadioGroup
                                value={connection.sync_mode}
                                onValueChange={(v) => handleSyncModeChange(v as GoogleSyncMode)}
                                disabled={isSavingMode}
                            >
                                <div className="flex items-start space-x-2">
                                    <RadioGroupItem value="one_way" id="clinic_one_way" className="mt-1" />
                                    <Label htmlFor="clinic_one_way" className="cursor-pointer">
                                        <span className="font-medium text-sm">Mão única</span>
                                        <p className="text-xs text-muted-foreground">Agendamentos da plataforma → Google Calendar</p>
                                    </Label>
                                </div>
                                <div className="flex items-start space-x-2">
                                    <RadioGroupItem value="two_way" id="clinic_two_way" className="mt-1" />
                                    <Label htmlFor="clinic_two_way" className="cursor-pointer">
                                        <span className="font-medium text-sm">Mão dupla</span>
                                        <p className="text-xs text-muted-foreground">Sincronização bidirecional completa</p>
                                    </Label>
                                </div>
                            </RadioGroup>
                        </div>

                        {/* Sincronização manual */}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full gap-2"
                            onClick={handleSyncNow}
                            disabled={isSyncing}
                        >
                            {isSyncing
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <RefreshCw className="w-4 h-4" />}
                            Sincronizar agora
                        </Button>
                    </div>
                ) : (
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
                        Conectar Agenda da Clínica
                    </Button>
                )}
            </div>
        </>
    );
}
