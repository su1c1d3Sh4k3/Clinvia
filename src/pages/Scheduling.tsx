import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Plus, Filter, ChevronLeft, ChevronRight, Search, Settings, FileText, RefreshCw, Upload, CalendarDays, UserPlus } from "lucide-react";
import { SchedulingCalendar } from "@/components/scheduling/SchedulingCalendar";
import { ProfessionalModal } from "@/components/scheduling/ProfessionalModal";
import { AppointmentModal } from "@/components/scheduling/AppointmentModal";
import { ViewAppointmentModal } from "@/components/scheduling/ViewAppointmentModal";
import { SchedulingSettingsModal } from "@/components/scheduling/SchedulingSettingsModal";
import { AppointmentImportWizard } from "@/components/scheduling/AppointmentImportWizard";
import { format, addDays, subDays, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { generateDailyReport } from "@/utils/generateDailyReport";
import { useOwnerId } from "@/hooks/useOwnerId";
import { usePermissions } from "@/hooks/usePermissions";
import { useCrmAppointmentSync } from "@/hooks/useCrmAppointmentSync";
import { useSuporteTour } from "@/lib/suporteTours";

export default function Scheduling() {
    const { toast } = useToast();
    useSuporteTour();
    const { canCreate, canEdit, canDelete } = usePermissions();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { data: ownerId } = useOwnerId();
    const { onAppointmentCompleted, onAppointmentLost } = useCrmAppointmentSync();
    const [date, setDate] = useState<Date | undefined>(new Date());
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
    const [selectedServiceNameId, setSelectedServiceNameId] = useState<string>("");
    const [searchTerm, setSearchTerm] = useState("");
    const [isSidebarOpen, setIsSidebarOpen] = useState(true); // mobile
    const [isSidebarExpanded, setIsSidebarExpanded] = useState(false); // desktop (hover no rail)
    const [isProfessionalModalOpen, setIsProfessionalModalOpen] = useState(false);
    const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [appointmentToView, setAppointmentToView] = useState<any>(null);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [isImportWizardOpen, setIsImportWizardOpen] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<{ professionalId: string, date: Date } | undefined>(undefined);
    const [appointmentToEdit, setAppointmentToEdit] = useState<any>(null);
    const [professionalToEdit, setProfessionalToEdit] = useState<any>(null);

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

    // ── Novo sistema de serviços: categorias + service_name + services_client ──
    const { data: categories } = useQuery({
        queryKey: ["services-categories"],
        queryFn: async () => {
            const { data, error } = await supabase.from("services_category").select("*");
            if (error) throw error;
            return data as any[];
        },
    });

    const { data: serviceNamesAll } = useQuery({
        queryKey: ["service-names-all"],
        queryFn: async () => {
            const { data, error } = await supabase.from("service_name").select("*");
            if (error) throw error;
            return data as any[];
        },
    });

    const { data: serviceClients } = useQuery({
        queryKey: ["services-client-active"],
        queryFn: async () => {
            const { data, error } = await supabase.from("services_client").select("*").eq("status", true);
            if (error) throw error;
            return data as any[];
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
                    contacts (push_name, number)
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

    // Filtro por categoria/serviço: encontra profissionais com aplicações vinculadas
    const filteredProfessionals = useMemo(() => {
        if (!professionals) return [];
        if (!selectedCategoryId && !selectedServiceNameId) return professionals;

        let filtered = serviceClients || [];
        if (selectedCategoryId) {
            filtered = filtered.filter((sc: any) => sc.category_id === selectedCategoryId);
        }
        if (selectedServiceNameId) {
            filtered = filtered.filter((sc: any) => sc.service_name_id === selectedServiceNameId);
        }

        const profIds = new Set<string>();
        filtered.forEach((sc: any) => {
            sc.professionals?.forEach((pid: string) => profIds.add(pid));
        });

        return professionals.filter(p => profIds.has(p.id));
    }, [professionals, serviceClients, selectedCategoryId, selectedServiceNameId]);

    const handleSlotClick = (professionalId: string, slotDate: Date) => {
        setSelectedSlot({ professionalId, date: slotDate });
        setAppointmentToEdit(null);
        setIsAppointmentModalOpen(true);
    };

    const handleEventClick = (event: any) => {
        setAppointmentToView(event);
        setIsViewModalOpen(true);
    };

    const handleEditProfessional = (professional: any) => {
        setProfessionalToEdit(professional);
        setIsProfessionalModalOpen(true);
    };

    // Service names filtrados pela categoria selecionada
    const filteredServiceNames = useMemo(() => {
        if (!serviceNamesAll || !selectedCategoryId) return [];
        return serviceNamesAll.filter((sn: any) => sn.category_id === selectedCategoryId);
    }, [serviceNamesAll, selectedCategoryId]);

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
                const syncAction = (newStatus === "canceled" || newStatus === "no-show") ? "delete_appointment" : "sync_appointment";
                supabase.functions.invoke("google-calendar-sync", {
                    body: { action: syncAction, appointment_id: appointmentId, user_id: ownerId },
                }).catch(() => {});
            }

            // CRM automation based on status
            if (event?.contact_id && ownerId) {
                const crmParams = {
                    contactId: event.contact_id,
                    ownerId,
                    serviceClientId: event.service_id || null,
                    serviceName: event.service_name || "Serviço",
                    servicePrice: event.price || 0,
                    professionalId: event.professional_id || undefined,
                    instanceId: event.instance_id || null,
                };

                if (newStatus === 'completed') {
                    // Create sale (pending) + update CRM deal + handle Ganho/Recorrência
                    onAppointmentCompleted(crmParams).catch(() => {});
                } else if (newStatus === 'canceled') {
                    onAppointmentLost({ ...crmParams, lossType: "canceled" }).catch(() => {});
                } else if (newStatus === 'no-show') {
                    onAppointmentLost({ ...crmParams, lossType: "no_show" }).catch(() => {});
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
        <div className="w-full pt-4 md:pt-6 px-3 md:px-6 h-[calc(100vh-4rem)] flex flex-col gap-3 md:gap-4 animate-fade-in">
            {/* Header (largura total, elementos centralizados) */}
            <div className="flex flex-col gap-3 md:gap-4">
                <div className="flex flex-wrap justify-center items-center gap-2 md:gap-12">
                    {/* Mobile: Toggle sidebar */}
                    <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 md:hidden"
                        onClick={() => setIsSidebarOpen(true)}
                    >
                        <Filter className="h-4 w-4" />
                    </Button>

                    <div data-tour="agenda-nav" className="flex items-center border rounded-md bg-white dark:bg-background border-[#D4D5D6] dark:border-border">
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
                    <Button variant="outline" onClick={handleToday} className="h-9 md:h-auto md:self-stretch text-xs md:text-sm px-2 md:px-4 bg-white dark:bg-transparent border border-[#D4D5D6] dark:border-border">
                        Hoje
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => setIsSettingsModalOpen(true)} className="h-9 w-9 md:h-auto md:w-12 md:self-stretch">
                        <Settings className="h-4 w-4" />
                    </Button>

                    <div className="hidden md:block md:w-72 lg:w-96 xl:w-[40rem] self-stretch">
                        <div className="relative w-full h-full">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar clientes agendados hoje"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8 h-full bg-white dark:bg-background border border-[#D4D5D6] dark:border-border"
                            />
                        </div>
                    </div>

                    {canCreate('appointments') && (
                        <Button data-tour="agenda-criar" onClick={() => {
                            setSelectedSlot(undefined);
                            setAppointmentToEdit(null);
                            setIsAppointmentModalOpen(true);
                        }} className="h-9 md:h-auto md:self-stretch text-xs md:text-sm md:px-4">
                            <Plus className="w-4 h-4 md:mr-2" />
                            <span className="hidden md:inline">Criar Agendamento</span>
                        </Button>
                    )}
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

            {/* Corpo: sidebar + agenda alinhados pelo topo */}
            <div className="flex-1 flex flex-col md:flex-row gap-4 md:gap-6 overflow-hidden">
            {/* Sidebar: rail de ícones no desktop (expande no hover, empurrando a agenda); painel completo no mobile */}
            <div
                data-tour="agenda-sidebar"
                className={`shrink-0 flex-col transition-all duration-300 ${isSidebarOpen ? "flex w-full" : "hidden"} md:flex ${isSidebarExpanded ? "md:w-80" : "md:w-14"}`}
                onMouseEnter={() => setIsSidebarExpanded(true)}
                onMouseLeave={() => setIsSidebarExpanded(false)}
            >
                {/* Rail de ícones (desktop recolhido) */}
                {!isSidebarExpanded && (
                    <div className="hidden md:flex flex-col items-center gap-1 py-2 border rounded-lg bg-background animate-in fade-in duration-200">
                        <Button variant="ghost" size="icon" title="Calendário" onClick={() => setIsSidebarExpanded(true)}>
                            <CalendarDays className="h-5 w-5" />
                        </Button>
                        {canCreate('professionals') && (
                            <Button variant="ghost" size="icon" title="Adicionar Profissional" onClick={() => {
                                setProfessionalToEdit(null);
                                setIsProfessionalModalOpen(true);
                            }}>
                                <UserPlus className="h-5 w-5" />
                            </Button>
                        )}
                        {canCreate('appointments') && (
                            <Button variant="ghost" size="icon" title="Importar Agendamentos" onClick={() => setIsImportWizardOpen(true)}>
                                <Upload className="h-5 w-5" />
                            </Button>
                        )}
                        <Button variant="ghost" size="icon" title="Relatório Diário" onClick={handleGenerateDailyReport}>
                            <FileText className="h-5 w-5" />
                        </Button>
                        {activeGCalConnection && (
                            <Button variant="ghost" size="icon" title="Sincronizar Google" disabled={isSyncing} onClick={() => handleSyncGCal(false)}>
                                <RefreshCw className={`h-5 w-5 ${isSyncing ? "animate-spin" : ""}`} />
                            </Button>
                        )}
                        <Button variant="ghost" size="icon" title="Filtrar por Serviço" onClick={() => setIsSidebarExpanded(true)}>
                            <Filter className="h-5 w-5" />
                        </Button>
                    </div>
                )}

                {/* Painel completo (desktop expandido no hover / mobile aberto) */}
                <div className={`flex-col gap-4 md:gap-6 overflow-y-auto pb-4 md:pb-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] ${isSidebarOpen ? "flex" : "hidden"} ${isSidebarExpanded ? "md:flex animate-in fade-in slide-in-from-left-4 duration-200" : "md:hidden"}`}>
                    <div className="flex flex-col items-center gap-4 md:gap-6 origin-top md:scale-[0.8]">
                        {/* Recolher no touch (mouseLeave não dispara em tablets) */}
                        <Button
                            variant="ghost"
                            size="sm"
                            className="hidden md:flex self-end -my-2 text-muted-foreground"
                            onClick={() => setIsSidebarExpanded(false)}
                        >
                            <ChevronLeft className="w-4 h-4 mr-1" /> Recolher
                        </Button>
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

                        {canCreate('professionals') && (
                            <Button onClick={() => {
                                setProfessionalToEdit(null);
                                setIsProfessionalModalOpen(true);
                            }} variant="outline" className="w-full justify-start bg-white dark:bg-transparent border border-[#D4D5D6] dark:border-border">
                                <Plus className="w-4 h-4 mr-2" />
                                Adicionar Profissional
                            </Button>
                        )}

                        {canCreate('appointments') && (
                            <Button
                                onClick={() => setIsImportWizardOpen(true)}
                                variant="outline"
                                className="w-full justify-start bg-white dark:bg-transparent border border-[#D4D5D6] dark:border-border"
                            >
                                <Upload className="w-4 h-4 mr-2" />
                                Importar Agendamentos
                            </Button>
                        )}

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
                            <CardContent className="space-y-3 px-4 pb-4 pt-0">
                                {/* Filtro por Categoria */}
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Categoria</Label>
                                    <select
                                        className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                        value={selectedCategoryId}
                                        onChange={(e) => {
                                            setSelectedCategoryId(e.target.value);
                                            setSelectedServiceNameId("");
                                        }}
                                    >
                                        <option value="">Todas</option>
                                        {categories?.map((c: any) => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Filtro por Serviço (aparece quando categoria selecionada) */}
                                {selectedCategoryId && filteredServiceNames.length > 0 && (
                                    <div className="space-y-1">
                                        <Label className="text-xs text-muted-foreground">Serviço</Label>
                                        <select
                                            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                            value={selectedServiceNameId}
                                            onChange={(e) => setSelectedServiceNameId(e.target.value)}
                                        >
                                            <option value="">Todos</option>
                                            {filteredServiceNames.map((sn: any) => (
                                                <option key={sn.id} value={sn.id}>{sn.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {!categories?.length && <span className="text-muted-foreground text-xs">Nenhuma categoria cadastrada</span>}
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
            <div data-tour="agenda-grade" className={`flex-1 flex flex-col overflow-hidden ${isSidebarOpen ? "hidden md:flex" : "flex"}`}>
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
                        canCreateAppointment={canCreate('appointments')}
                        canEditAppointment={canEdit('appointments')}
                        canEditProfessional={canEdit('professionals')}
                    />
                )}
            </div>
            </div>

            <ProfessionalModal
                open={isProfessionalModalOpen}
                onOpenChange={setIsProfessionalModalOpen}
                professionalToEdit={professionalToEdit}
            />

            <ViewAppointmentModal
                appointment={appointmentToView}
                open={isViewModalOpen}
                onOpenChange={setIsViewModalOpen}
                onEdit={(apt) => {
                    setAppointmentToEdit(apt);
                    setSelectedSlot(undefined);
                    setIsAppointmentModalOpen(true);
                }}
                onStatusChange={handleStatusChange}
                canEdit={canEdit('appointments')}
            />

            <AppointmentModal
                open={isAppointmentModalOpen}
                onOpenChange={setIsAppointmentModalOpen}
                defaultDate={selectedSlot?.date || date}
                defaultProfessionalId={selectedSlot?.professionalId}
                appointmentToEdit={appointmentToEdit}
                lockHour={!!selectedSlot}
            />

            <SchedulingSettingsModal
                open={isSettingsModalOpen}
                onOpenChange={setIsSettingsModalOpen}
                currentSettings={settings}
            />

            <AppointmentImportWizard
                open={isImportWizardOpen}
                onOpenChange={setIsImportWizardOpen}
            />
        </div>
    );
}
