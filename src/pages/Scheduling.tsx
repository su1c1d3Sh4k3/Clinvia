import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Plus, Filter, ChevronLeft, ChevronRight, Search, PanelLeftClose, PanelLeftOpen, Settings, FileText, RefreshCw } from "lucide-react";
import { SchedulingCalendar } from "@/components/scheduling/SchedulingCalendar";
import { ProfessionalModal } from "@/components/scheduling/ProfessionalModal";
import { AppointmentModal } from "@/components/scheduling/AppointmentModal";
import { SchedulingSettingsModal } from "@/components/scheduling/SchedulingSettingsModal";
import { SaleModal, AppointmentSaleData } from "@/components/sales/SaleModal";
import { format, addDays, subDays, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { generateDailyReport } from "@/utils/generateDailyReport";
import { useOwnerId } from "@/hooks/useOwnerId";

export default function Scheduling() {
    const { toast } = useToast();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { data: ownerId } = useOwnerId();
    const [date, setDate] = useState<Date | undefined>(new Date());
    const [selectedServices, setSelectedServices] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [isProfessionalModalOpen, setIsProfessionalModalOpen] = useState(false);
    const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<{ professionalId: string, date: Date } | undefined>(undefined);
    const [appointmentToEdit, setAppointmentToEdit] = useState<any>(null);
    const [professionalToEdit, setProfessionalToEdit] = useState<any>(null);

    // SaleModal state for appointment completion
    const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
    const [completedAppointmentData, setCompletedAppointmentData] = useState<AppointmentSaleData | undefined>(undefined);

    // Google Calendar sync state
    const [isSyncing, setIsSyncing] = useState(false);
    const hasSyncedOnMount = useRef(false);

    // ── Google Calendar OAuth callback ──────────────────────────────────────
    useEffect(() => {
        const code = searchParams.get("code");
        const state = searchParams.get("state");

        if (!code || !state) return;

        // Validar state
        const storedState = localStorage.getItem("google_oauth_state");
        if (!storedState || storedState !== state) {
            toast({
                title: "Erro de segurança",
                description: "Parâmetro de estado inválido. Tente conectar novamente.",
                variant: "destructive",
            });
            localStorage.removeItem("google_oauth_state");
            navigate("/scheduling", { replace: true });
            return;
        }

        localStorage.removeItem("google_oauth_state");

        // Processar callback
        (async () => {
            toast({ title: "Conectando Google Calendar...", description: "Aguarde um momento." });
            try {
                const { data, error } = await supabase.functions.invoke("google-oauth-callback", {
                    body: {
                        code,
                        state,
                        redirect_uri: `${window.location.origin}/scheduling`,
                    },
                });
                if (error) throw error;
                if (data?.success) {
                    toast({
                        title: "Google Calendar conectado!",
                        description: `Conta ${data.email} conectada com sucesso.`,
                    });
                    // Invalidar queries de conexão para atualizar os modais
                    queryClient.invalidateQueries({ queryKey: ["google-calendar-connection"] });
                    queryClient.invalidateQueries({ queryKey: ["google-calendar-clinic-connection"] });
                } else {
                    throw new Error(data?.error || "Falha na conexão");
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                toast({
                    title: "Erro ao conectar Google Calendar",
                    description: message,
                    variant: "destructive",
                });
            } finally {
                navigate("/scheduling", { replace: true });
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // ────────────────────────────────────────────────────────────────────────

    const handlePreviousDay = () => date && setDate(subDays(date, 1));
    const handleNextDay = () => date && setDate(addDays(date, 1));
    const handleToday = () => setDate(new Date());

    const { data: services } = useQuery({
        queryKey: ["services-list"],
        queryFn: async () => {
            const { data, error } = await supabase.from("products_services").select("*").eq("type", "service");
            if (error) throw error;
            return data;
        },
    });

    const { data: professionals } = useQuery({
        queryKey: ["professionals"],
        queryFn: async () => {
            const { data, error } = await supabase.from("professionals").select("*");
            if (error) throw error;
            return data;
        },
    });

    const { data: appointments, refetch: refetchAppointments } = useQuery({
        queryKey: ["appointments", date],
        queryFn: async () => {
            if (!date) return [];
            const start = new Date(date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(date);
            end.setHours(23, 59, 59, 999);

            const { data, error } = await supabase
                .from("appointments")
                .select(`
                    *,
                    contacts (push_name, number),
                    products_services (name, color)
                `)
                .gte("start_time", start.toISOString())
                .lte("start_time", end.toISOString());

            if (error) throw error;
            return data;
        },
        enabled: !!date,
    });

    const { data: settings } = useQuery({
        queryKey: ["scheduling_settings"],
        queryFn: async () => {
            const { data, error } = await supabase.from("scheduling_settings").select("*").single();
            if (error && error.code !== "PGRST116") throw error; // Ignore not found error
            return data;
        },
    });

    // Verificar se há conexão Google Calendar ativa
    const { data: activeGCalConnection } = useQuery({
        queryKey: ["gcal-active-connection", ownerId],
        queryFn: async () => {
            if (!ownerId) return null;
            const { data } = await supabase
                .from("professional_google_calendars")
                .select("id")
                .eq("user_id", ownerId)
                .eq("is_active", true)
                .limit(1)
                .maybeSingle();
            return data;
        },
        enabled: !!ownerId,
    });

    // Sincronizar Google Calendar (bidirectional poll)
    const handleSyncGCal = async (silent = false) => {
        if (!ownerId || !activeGCalConnection || isSyncing) return;
        setIsSyncing(true);
        if (!silent) {
            toast({ title: "Sincronizando Google Calendar...", description: "Aguarde um momento." });
        }
        try {
            const { data, error } = await supabase.functions.invoke("google-calendar-poll", {
                body: { user_id: ownerId },
            });
            if (error) throw error;
            if (data?.success !== false) {
                await refetchAppointments();
                if (!silent) {
                    toast({
                        title: "Sincronização concluída!",
                        description: `${data?.synced ?? 0} enviados, ${data?.imported ?? 0} importados do Google Calendar.`,
                    });
                }
            }
        } catch (err: unknown) {
            if (!silent) {
                const message = err instanceof Error ? err.message : String(err);
                toast({ title: "Erro na sincronização", description: message, variant: "destructive" });
            }
        } finally {
            setIsSyncing(false);
        }
    };

    // Auto-sync ao carregar a página (se houver conexão ativa)
    useEffect(() => {
        if (!ownerId || !activeGCalConnection || hasSyncedOnMount.current) return;
        hasSyncedOnMount.current = true;
        setIsSyncing(true);
        supabase.functions.invoke("google-calendar-poll", {
            body: { user_id: ownerId },
        }).then(({ data }) => {
            if (data?.success !== false) refetchAppointments();
        }).catch(() => {}).finally(() => setIsSyncing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ownerId, activeGCalConnection]);

    const filteredProfessionals = professionals?.filter(p => {
        if (selectedServices.length === 0) return true;
        // If professional has ANY of the selected services
        return p.service_ids?.some((id: string) => selectedServices.includes(id));
    }) || [];

    const handleSlotClick = (professionalId: string, slotDate: Date) => {
        setSelectedSlot({ professionalId, date: slotDate });
        setAppointmentToEdit(null);
        setIsAppointmentModalOpen(true);
    };

    const handleEventClick = (event: any) => {
        setAppointmentToEdit(event);
        setSelectedSlot(undefined);
        setIsAppointmentModalOpen(true);
    };

    const handleEditProfessional = (professional: any) => {
        setProfessionalToEdit(professional);
        setIsProfessionalModalOpen(true);
    };

    const toggleServiceFilter = (serviceId: string) => {
        setSelectedServices(prev =>
            prev.includes(serviceId)
                ? prev.filter(id => id !== serviceId)
                : [...prev, serviceId]
        );
    };

    const handleStatusChange = async (appointmentId: string, newStatus: string, event?: any) => {
        if (newStatus === 'rescheduled' && event) {
            // Open modal for rescheduling
            setAppointmentToEdit(event);
            setSelectedSlot(undefined);
            setIsAppointmentModalOpen(true);
            return;
        }

        try {
            const { error } = await supabase
                .from("appointments")
                .update({ status: newStatus })
                .eq("id", appointmentId);

            if (error) throw error;

            // Fire-and-forget: sincronizar com Google Calendar
            if (ownerId) {
                const syncAction = newStatus === "canceled" ? "delete_appointment" : "sync_appointment";
                supabase.functions.invoke("google-calendar-sync", {
                    body: { action: syncAction, appointment_id: appointmentId, user_id: ownerId },
                }).catch(() => {});
            }

            // If status is completed, open SaleModal with pre-filled data
            if (newStatus === 'completed' && event) {
                // Skip if no price or type is not 'appointment'
                if (!event.price || event.price <= 0 || event.type === 'absence') {
                    toast({
                        title: "Agendamento concluído",
                        description: "Sem valor para registrar venda.",
                    });
                } else {
                    // Prepare appointment data for SaleModal
                    const appointmentDate = new Date(event.start_time).toISOString().split('T')[0];
                    const serviceType = event.products_services?.type || 'service';

                    setCompletedAppointmentData({
                        contact_id: event.contact_id || undefined,
                        professional_id: event.professional_id || undefined,
                        service_id: event.service_id || undefined,
                        service_type: serviceType as 'product' | 'service',
                        price: event.price,
                        sale_date: appointmentDate,
                        notes: event.description || `Venda de agendamento - ${event.products_services?.name || 'Serviço'}`,
                    });
                    setIsSaleModalOpen(true);
                }
            }

            // Force refetch
            refetchAppointments();

        } catch (error) {
            console.error("Error updating status:", error);
        }
    };

    const handleGenerateDailyReport = async () => {
        if (!date) {
            toast({
                title: "Data não selecionada",
                description: "Por favor, selecione uma data para gerar o relatório.",
                variant: "destructive",
            });
            return;
        }

        try {
            // Show loading toast
            toast({
                title: "Gerando relatório...",
                description: "Aguarde enquanto o PDF está sendo criado.",
            });

            // Debug: log the date and appointments
            console.log('Generating report for date:', date);
            console.log('Appointments:', appointments);
            console.log('Professionals:', filteredProfessionals);

            await generateDailyReport(
                date,
                filteredProfessionals,
                appointments || []
            );

            toast({
                title: "Relatório gerado!",
                description: "O PDF foi baixado com sucesso.",
            });
        } catch (error) {
            console.error("Error generating report:", error);
            toast({
                title: "Erro ao gerar relatório",
                description: "Não foi possível gerar o PDF. Tente novamente.",
                variant: "destructive",
            });
        }
    };

    return (
        <div className="container mx-auto py-4 md:py-6 px-3 md:px-6 h-[calc(100vh-4rem)] flex flex-col md:flex-row gap-4 md:gap-6 animate-fade-in">
            {/* Sidebar - Hidden on mobile by default, toggleable */}
            <div
                className={`shrink-0 flex flex-col gap-4 md:gap-6 transition-all duration-300 relative ${isSidebarOpen ? "w-full md:w-80" : "hidden md:block md:w-12"}`}
            >
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute -right-3 top-0 z-10 h-6 w-6 rounded-full border bg-background shadow-sm hidden md:flex"
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                >
                    {isSidebarOpen ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </Button>

                <div className={`flex flex-col gap-4 md:gap-6 overflow-y-auto pb-4 md:pb-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] transition-opacity duration-300 ${isSidebarOpen ? "opacity-100" : "opacity-0 invisible"}`}>
                    <div className="flex flex-col items-center gap-4 md:gap-6 origin-top md:scale-[0.8]">
                        <div className="space-y-2 text-center w-full">
                            <h1 className="text-xl md:text-2xl font-bold">Agendamento</h1>
                            <p className="text-muted-foreground text-xs md:text-sm">Gerencie sua agenda</p>
                        </div>

                        <Card className="w-full">
                            <CardContent className="p-0">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={setDate}
                                    locale={ptBR}
                                    className="rounded-md border flex justify-center"
                                />
                            </CardContent>
                        </Card>

                        <Button onClick={() => {
                            setProfessionalToEdit(null);
                            setIsProfessionalModalOpen(true);
                        }} variant="outline" className="w-full justify-start bg-white dark:bg-transparent border border-[#D4D5D6] dark:border-border">
                            <Plus className="w-4 h-4 mr-2" />
                            Adicionar Profissional
                        </Button>

                        <Button
                            onClick={handleGenerateDailyReport}
                            variant="outline"
                            className="w-full justify-start bg-white dark:bg-transparent border border-[#D4D5D6] dark:border-border"
                        >
                            <FileText className="w-4 h-4 mr-2" />
                            Relatório Diário
                        </Button>

                        {activeGCalConnection && (
                            <Button
                                onClick={() => handleSyncGCal(false)}
                                disabled={isSyncing}
                                variant="outline"
                                className="w-full justify-start bg-white dark:bg-transparent border border-[#D4D5D6] dark:border-border"
                            >
                                <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
                                {isSyncing ? "Sincronizando..." : "Sincronizar Google"}
                            </Button>
                        )}

                        <Card className="w-full">
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm font-medium flex items-center">
                                    <Filter className="w-4 h-4 mr-2" />
                                    Filtrar por Serviço
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2">
                                {services?.map((service) => (
                                    <div key={service.id} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={`filter-${service.id}`}
                                            checked={selectedServices.includes(service.id)}
                                            onCheckedChange={() => toggleServiceFilter(service.id)}
                                        />
                                        <Label htmlFor={`filter-${service.id}`} className="text-sm font-normal cursor-pointer">
                                            {service.name}
                                        </Label>
                                    </div>
                                ))}
                                {services?.length === 0 && <span className="text-muted-foreground text-xs">Nenhum serviço cadastrado</span>}
                            </CardContent>
                        </Card>

                        {/* Mobile: Close sidebar button */}
                        <Button
                            variant="outline"
                            className="w-full md:hidden"
                            onClick={() => setIsSidebarOpen(false)}
                        >
                            Ver Agenda
                        </Button>
                    </div>
                </div>
            </div>

            {/* Main Calendar */}
            <div className={`flex-1 flex flex-col gap-3 md:gap-4 overflow-hidden ${isSidebarOpen ? "hidden md:flex" : "flex"}`}>
                <div className="flex flex-col gap-3 md:gap-4">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                        <div className="flex items-center gap-1 md:gap-2">
                            {/* Mobile: Toggle sidebar */}
                            <Button
                                variant="outline"
                                size="icon"
                                className="h-9 w-9 md:hidden"
                                onClick={() => setIsSidebarOpen(true)}
                            >
                                <Filter className="h-4 w-4" />
                            </Button>

                            <div className="flex items-center border rounded-md bg-white dark:bg-background border-[#D4D5D6] dark:border-border">
                                <Button variant="ghost" size="icon" onClick={handlePreviousDay} className="h-9 w-9 rounded-none rounded-l-md border-r">
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="px-2 md:px-4 py-2 text-xs md:text-sm font-medium min-w-[100px] md:min-w-[140px] text-center">
                                    {date ? (
                                        <div className="flex flex-col leading-none">
                                            <span className="font-bold">{format(date, "d MMM", { locale: ptBR })}</span>
                                            <span className="text-[10px] md:text-xs text-muted-foreground capitalize hidden sm:block">{format(date, "EEEE", { locale: ptBR })}</span>
                                        </div>
                                    ) : "Selecione"}
                                </div>
                                <Button variant="ghost" size="icon" onClick={handleNextDay} className="h-9 w-9 rounded-none rounded-r-md border-l">
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                            <Button variant="outline" onClick={handleToday} className="h-9 text-xs md:text-sm px-2 md:px-3 bg-white dark:bg-transparent border border-[#D4D5D6] dark:border-border">
                                Hoje
                            </Button>
                            <Button variant="outline" size="icon" onClick={() => setIsSettingsModalOpen(true)} className="h-9 w-9">
                                <Settings className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="hidden md:flex items-center gap-2 flex-1 max-w-md mx-4">
                            <div className="relative w-full">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar clientes agendados hoje"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-8 bg-white dark:bg-background border border-[#D4D5D6] dark:border-border"
                                />
                            </div>
                        </div>

                        <Button onClick={() => {
                            setSelectedSlot(undefined);
                            setAppointmentToEdit(null);
                            setIsAppointmentModalOpen(true);
                        }} className="h-9 text-xs md:text-sm">
                            <Plus className="w-4 h-4 md:mr-2" />
                            <span className="hidden md:inline">Criar Agendamento</span>
                        </Button>
                    </div>

                    {/* Mobile search bar */}
                    <div className="md:hidden">
                        <div className="relative w-full">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar clientes..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8 h-9 text-sm bg-white dark:bg-background border border-[#D4D5D6] dark:border-border"
                            />
                        </div>
                    </div>
                </div>

                {date && (
                    <SchedulingCalendar
                        date={date}
                        professionals={filteredProfessionals}
                        appointments={appointments?.filter(apt => {
                            if (!searchTerm) return true;
                            const searchLower = searchTerm.toLowerCase();
                            const contactName = apt.contacts?.push_name?.toLowerCase() || apt.contact_name?.toLowerCase() || "";
                            const phone = apt.contacts?.number || apt.contact_phone || "";
                            return contactName.includes(searchLower) || phone.includes(searchLower);
                        }) || []}
                        settings={settings}
                        onSlotClick={handleSlotClick}
                        onEventClick={handleEventClick}
                        onStatusChange={handleStatusChange}
                        onEditProfessional={handleEditProfessional}
                    />
                )}
            </div>

            <ProfessionalModal
                open={isProfessionalModalOpen}
                onOpenChange={setIsProfessionalModalOpen}
                professionalToEdit={professionalToEdit}
            />

            <AppointmentModal
                open={isAppointmentModalOpen}
                onOpenChange={setIsAppointmentModalOpen}
                defaultDate={selectedSlot?.date || date}
                defaultProfessionalId={selectedSlot?.professionalId}
                appointmentToEdit={appointmentToEdit}
            />

            <SchedulingSettingsModal
                open={isSettingsModalOpen}
                onOpenChange={setIsSettingsModalOpen}
                currentSettings={settings}
            />

            <SaleModal
                open={isSaleModalOpen}
                onOpenChange={setIsSaleModalOpen}
                appointmentData={completedAppointmentData}
            />
        </div>
    );
}
