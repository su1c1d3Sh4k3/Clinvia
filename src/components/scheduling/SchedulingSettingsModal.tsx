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
import { Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";

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
            </DialogContent>
        </Dialog>
    );
}
