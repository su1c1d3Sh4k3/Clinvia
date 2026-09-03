import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, Clock, Check, ChevronLeft, ChevronRight, User, ArrowLeft, Calendar, X, CalendarClock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { format, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isSameMonth, isSameDay, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";

const API_BASE = "https://swfshqvvbohnahdyndch.supabase.co/functions/v1/api-public-booking";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3ZnNocXZ2Ym9obmFoZHluZGNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMxNjI4NjgsImV4cCI6MjA0ODczODg2OH0.MbOhXXnaJFAcZKoSWRj3V9cDBdfBpqH4V0iyasUVef0";

async function callApi(body: any) {
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erro");
  return data;
}

interface BookingParams { user_id: string; contact_id: string; contact_name: string; instance_id: string; }
type Step = "home" | "service" | "convenio" | "professional" | "datetime" | "confirm" | "done" | "reschedule" | "canceled";

export default function PublicBooking() {
  const [searchParams] = useSearchParams();
  const [params, setParams] = useState<BookingParams | null>(null);
  const [error, setError] = useState("");

  const [applications, setApplications] = useState<any[]>([]);
  const [convenios, setConvenios] = useState<any[]>([]);
  const [allProfessionals, setAllProfessionals] = useState<any[]>([]);
  const [pendingApts, setPendingApts] = useState<any[]>([]);
  const [slots, setSlots] = useState<string[]>([]);

  const [step, setStep] = useState<Step>("home");
  const [selApp, setSelApp] = useState<any>(null);
  /** null = particular. Guarda o convênio escolhido para o serviço atual. */
  const [selConvenio, setSelConvenio] = useState<any>(null);
  const [selProf, setSelProf] = useState<any>(null);
  const [selDate, setSelDate] = useState<Date | null>(null);
  const [selTime, setSelTime] = useState("");
  const [calMonth, setCalMonth] = useState(new Date());
  const [managingApt, setManagingApt] = useState<any>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const tomorrow = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); return d;
  }, []);

  useEffect(() => {
    try {
      const d = searchParams.get("d");
      if (!d) { setError("Link inválido"); setLoading(false); return; }
      // O nome do contato pode ter emoji, então o link vem em base64 de bytes
      // UTF-8. Para nome ASCII o resultado é idêntico ao formato antigo.
      const bytes = Uint8Array.from(atob(d), (ch) => ch.charCodeAt(0));
      const decoded = JSON.parse(new TextDecoder().decode(bytes));
      if (!decoded.user_id || !decoded.contact_id) { setError("Link inválido"); setLoading(false); return; }
      // A conexão define em qual funil do CRM o agendamento entra — link antigo não serve
      if (!decoded.instance_id) {
        setError("Este link de agendamento é antigo e não identifica a conexão. Peça um link novo à clínica.");
        setLoading(false); return;
      }
      setParams(decoded);
    } catch { setError("Link expirado ou inválido"); setLoading(false); }
  }, [searchParams]);

  const loadData = async () => {
    if (!params) return;
    setLoading(true);
    try {
      const [svcData, profData, aptData] = await Promise.all([
        callApi({ action: "get_services", user_id: params.user_id, contact_id: params.contact_id, instance_id: params.instance_id }),
        callApi({ action: "get_prof_list", user_id: params.user_id }),
        callApi({ action: "get_pending", user_id: params.user_id, contact_id: params.contact_id }),
      ]);
      setApplications(svcData.applications || []);
      setConvenios(svcData.convenios || []);
      setAllProfessionals(profData.professionals || []);
      setPendingApts(aptData.appointments || []);
    } catch (err: any) { setError(err.message); }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [params]);

  /** Convênios que atendem o serviço escolhido (vazio = só particular). */
  const appConvenios = useMemo(() => {
    const ids: string[] = selApp?.convenio_ids || [];
    return convenios.filter(c => ids.includes(c.id));
  }, [selApp, convenios]);

  const profsForApp = (app: any, convenio: any) => {
    const base = allProfessionals.filter(p => (app?.professionals || []).includes(p.id));
    if (!convenio) return base;
    const rooms: string[] = convenio.professional_ids || [];
    return base.filter(p => rooms.includes(p.id));
  };

  const filteredProfs = useMemo(
    () => (selApp ? profsForApp(selApp, selConvenio) : []),
    [selApp, selConvenio, allProfessionals],
  );

  useEffect(() => {
    if (!selDate || !selProf || !selApp || !params) return;
    const profId = managingApt ? managingApt.professional_id : selProf.id;
    const svcId = managingApt ? managingApt.service_id : selApp.id;
    // Reagendamento herda o convênio do agendamento original.
    const convId = managingApt ? (managingApt.convenio_id || null) : (selConvenio?.id || null);
    (async () => {
      setLoadingSlots(true); setSelTime("");
      try {
        const data = await callApi({ action: "get_slots", user_id: params.user_id, professional_id: profId, service_id: svcId, date: format(selDate, "yyyy-MM-dd"), convenio_id: convId });
        setSlots(data.slots || []);
      } catch { setSlots([]); }
      setLoadingSlots(false);
    })();
  }, [selDate, selProf, selApp, selConvenio, params, managingApt]);

  const calDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(calMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(calMonth), { weekStartsOn: 0 });
    const days: Date[] = []; let d = start;
    while (d <= end) { days.push(new Date(d)); d = addDays(d, 1); }
    return days;
  }, [calMonth]);

  const goToProfessional = (app: any, convenio: any) => {
    const profs = profsForApp(app, convenio);
    if (profs.length === 1) { setSelProf(profs[0]); setStep("datetime"); }
    else { setSelProf(null); setStep("professional"); }
  };

  const handleSelectApp = (app: any) => {
    setSelApp(app);
    setSelConvenio(null);
    // Serviço apto a convênio: o paciente escolhe antes, porque a sala e o
    // horário mudam conforme a janela dedicada.
    const ids: string[] = app.convenio_ids || [];
    if (convenios.some(c => ids.includes(c.id))) { setStep("convenio"); return; }
    goToProfessional(app, null);
  };

  const handleSelectConvenio = (convenio: any) => {
    setSelConvenio(convenio);
    goToProfessional(selApp, convenio);
  };

  const handleConfirm = async () => {
    if (!params || !selApp || !selProf || !selDate || !selTime) return;
    setSubmitting(true); setError("");
    try {
      await callApi({ action: "create_booking", user_id: params.user_id, contact_id: params.contact_id, instance_id: params.instance_id, service_id: selApp.id, professional_id: selProf.id, date: format(selDate, "yyyy-MM-dd"), time: selTime, convenio_id: selConvenio?.id || null });
      setStep("done");
      loadData();
    } catch (err: any) { setError(err.message); }
    setSubmitting(false);
  };

  const handleCancelApt = async () => {
    if (!managingApt || !params) return;
    setSubmitting(true);
    try {
      await callApi({ action: "cancel_booking", user_id: params.user_id, appointment_id: managingApt.id });
      setStep("canceled");
      loadData();
    } catch (err: any) { setError(err.message); }
    setSubmitting(false);
  };

  const handleRescheduleConfirm = async () => {
    if (!managingApt || !params || !selDate || !selTime) return;
    setSubmitting(true); setError("");
    try {
      await callApi({ action: "reschedule_booking", user_id: params.user_id, appointment_id: managingApt.id, date: format(selDate, "yyyy-MM-dd"), time: selTime });
      setStep("done");
      loadData();
    } catch (err: any) { setError(err.message); }
    setSubmitting(false);
  };

  const startReschedule = (apt: any) => {
    setManagingApt(apt);
    setSelProf({ id: apt.professional_id, name: apt.professional_name });
    setSelApp({ id: apt.service_id, duration_minutes: 0 });
    setSelDate(null); setSelTime(""); setConfirmCancel(false);
    setStep("reschedule");
  };

  const goHome = () => {
    setStep("home"); setManagingApt(null); setSelApp(null); setSelConvenio(null); setSelProf(null); setSelDate(null); setSelTime(""); setConfirmCancel(false); setError("");
  };

  const fmtDate = (iso: string) => { try { return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); } catch { return iso; } };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (error && !params) return <div className="min-h-screen flex items-center justify-center bg-background p-6"><p className="text-destructive text-center">{error}</p></div>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">
            {step === "reschedule" ? "Reagendar" : step === "canceled" ? "Cancelado" : "Agendar Atendimento"}
          </h1>
          {params?.contact_name && <p className="text-sm text-muted-foreground">Olá, {params.contact_name}</p>}
        </div>

        {/* ── HOME: pending appointments + new booking button ── */}
        {step === "home" && (
          <div className="space-y-4">
            {pendingApts.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-muted-foreground">Seus agendamentos</h2>
                {pendingApts.map(apt => (
                  <div key={apt.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">{apt.service_name}</p>
                        <p className="text-xs text-muted-foreground">{apt.professional_name}</p>
                      </div>
                      <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full",
                        apt.status === "confirmed" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" :
                        apt.status === "rescheduled" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" :
                        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                      )}>
                        {apt.status === "confirmed" ? "Confirmado" : apt.status === "rescheduled" ? "Reagendado" : "Pendente"}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {fmtDate(apt.start_time)}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={() => startReschedule(apt)}>
                        <CalendarClock className="w-3.5 h-3.5" /> Reagendar
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs text-destructive hover:text-destructive" onClick={() => { setManagingApt(apt); setConfirmCancel(true); }}>
                        <X className="w-3.5 h-3.5" /> Cancelar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Cancel confirmation */}
            {confirmCancel && managingApt && (
              <div className="border border-destructive/30 rounded-lg p-4 space-y-3 bg-destructive/5 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-semibold">Cancelar agendamento?</span>
                </div>
                <p className="text-xs text-muted-foreground">{managingApt.service_name} — {fmtDate(managingApt.start_time)}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setConfirmCancel(false); setManagingApt(null); }}>Voltar</Button>
                  <Button variant="destructive" size="sm" className="flex-1" onClick={handleCancelApt} disabled={submitting}>
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar cancelamento"}
                  </Button>
                </div>
              </div>
            )}

            <Button className="w-full h-12 text-base font-semibold" onClick={() => setStep("service")}>
              Novo Agendamento
            </Button>
          </div>
        )}

        {/* ── STEP: Service ── */}
        {step === "service" && (
          <div className="space-y-4">
            <button onClick={goHome} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Voltar</button>
            <h2 className="text-sm font-semibold text-muted-foreground">Escolha o serviço</h2>
            {applications.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum serviço disponível para agendamento.</p>
            ) : (
              <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="grid grid-cols-1 gap-2">
                  {applications.map(a => (
                    <button key={a.id} onClick={() => handleSelectApp(a)}
                      className={cn("p-3 rounded-lg border text-left transition-all", selApp?.id === a.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}>
                      <span className="text-sm font-medium">{a.name}</span>
                      {a.description && <p className="text-xs text-muted-foreground mt-1">{a.description}</p>}
                      {a.duration_minutes && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" /> {a.duration_minutes} min
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP: Particular x Convênio ── */}
        {step === "convenio" && (
          <div className="space-y-4">
            <button onClick={() => setStep("service")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Voltar</button>
            <h2 className="text-sm font-semibold text-muted-foreground">Como você quer ser atendido?</h2>
            <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <button onClick={() => handleSelectConvenio(null)}
                className="w-full p-3 rounded-lg border border-border hover:border-primary/50 text-left transition-all">
                <span className="text-sm font-medium">Particular</span>
                <p className="text-xs text-muted-foreground mt-1">Sem convênio</p>
              </button>
              {appConvenios.map(c => (
                <button key={c.id} onClick={() => handleSelectConvenio(c)}
                  disabled={(c.professional_ids || []).length === 0}
                  className={cn(
                    "w-full p-3 rounded-lg border text-left transition-all",
                    (c.professional_ids || []).length === 0
                      ? "border-border opacity-50 cursor-not-allowed"
                      : "border-border hover:border-primary/50",
                  )}>
                  <span className="text-sm font-medium">{c.nome}</span>
                  {c.descricao && <p className="text-xs text-muted-foreground mt-1">{c.descricao}</p>}
                  {(c.professional_ids || []).length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">Sem horário disponível no momento</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: Professional ── */}
        {step === "professional" && (
          <div className="space-y-4">
            <button onClick={() => setStep(appConvenios.length > 0 ? "convenio" : "service")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Voltar</button>
            <h2 className="text-sm font-semibold text-muted-foreground">Escolha o profissional</h2>
            {filteredProfs.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhum profissional disponível para essa opção. Fale com a clínica.
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredProfs.map(p => (
                <button key={p.id} onClick={() => { setSelProf(p); setStep("datetime"); }}
                  className={cn("flex flex-col items-center gap-2 p-4 rounded-lg border transition-all", selProf?.id === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50")}>
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                    {p.photo_url ? <img src={p.photo_url} className="w-full h-full object-cover" /> : <User className="w-6 h-6 text-muted-foreground" />}
                  </div>
                  <span className="text-sm font-medium text-center">{p.name}</span>
                  {p.role && <span className="text-[10px] text-muted-foreground">{p.role}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP: DateTime (new booking + reschedule) ── */}
        {(step === "datetime" || step === "reschedule") && (
          <div className="space-y-4">
            <button onClick={() => step === "reschedule" ? goHome() : setStep(filteredProfs.length > 1 ? "professional" : appConvenios.length > 0 ? "convenio" : "service")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            {step === "reschedule" && managingApt && (
              <div className="p-3 rounded-lg border bg-muted/30 text-xs space-y-1">
                <p className="font-medium">{managingApt.service_name}</p>
                <p className="text-muted-foreground">com {managingApt.professional_name}</p>
                <p className="text-muted-foreground">Atual: {fmtDate(managingApt.start_time)}</p>
              </div>
            )}
            <h2 className="text-sm font-semibold text-muted-foreground">
              {step === "reschedule" ? "Escolha a nova data e horário" : "Escolha data e horário"}
            </h2>

            <div className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-3">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCalMonth(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; })}><ChevronLeft className="w-4 h-4" /></Button>
                <span className="text-sm font-medium capitalize">{format(calMonth, "MMMM yyyy", { locale: ptBR })}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCalMonth(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; })}><ChevronRight className="w-4 h-4" /></Button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 sm:gap-1 text-center">
                {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => (
                  <div key={d} className="text-[10px] text-muted-foreground font-medium py-1">{d}</div>
                ))}
                {calDays.map((day, i) => {
                  const isDisabled = isBefore(day, tomorrow) || !isSameMonth(day, calMonth);
                  const isSelected = selDate && isSameDay(day, selDate);
                  return (
                    <button key={i} disabled={isDisabled} onClick={() => setSelDate(day)}
                      className={cn("h-9 w-full rounded-md text-sm transition-all",
                        isDisabled && "text-muted-foreground/30 cursor-not-allowed",
                        !isDisabled && !isSelected && "hover:bg-accent",
                        isSelected && "bg-primary text-primary-foreground font-bold"
                      )}>{day.getDate()}</button>
                  );
                })}
              </div>
            </div>

            {selDate && (
              <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{format(selDate, "dd 'de' MMMM", { locale: ptBR })}</span>
                </div>
                {loadingSlots ? (
                  <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
                ) : slots.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum horário disponível neste dia</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 sm:gap-2">
                    {slots.map(t => (
                      <button key={t} onClick={() => { setSelTime(t); if (step === "reschedule") {} else setStep("confirm"); }}
                        className={cn("py-2.5 rounded-lg border text-sm font-medium transition-all",
                          selTime === t ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50"
                        )}>{t}</button>
                    ))}
                  </div>
                )}
                {step === "reschedule" && selTime && (
                  <Button className="w-full h-11 font-semibold mt-2" onClick={handleRescheduleConfirm} disabled={submitting}>
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CalendarClock className="w-4 h-4 mr-2" />}
                    Confirmar Reagendamento
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STEP: Confirm (new booking) ── */}
        {step === "confirm" && selApp && selProf && selDate && selTime && (
          <div className="space-y-4">
            <button onClick={() => setStep("datetime")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Voltar</button>
            <h2 className="text-sm font-semibold text-muted-foreground">Confirme seu agendamento</h2>
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Serviço</span><span className="text-sm font-medium">{selApp.name}</span></div>
              {appConvenios.length > 0 && (
                <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Atendimento</span><span className="text-sm font-medium">{selConvenio ? selConvenio.nome : "Particular"}</span></div>
              )}
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Profissional</span><span className="text-sm font-medium">{selProf.name}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Data</span><span className="text-sm font-medium capitalize">{format(selDate, "EEEE, dd/MM", { locale: ptBR })}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Horário</span><span className="text-sm font-medium">{selTime}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Duração</span><span className="text-sm font-medium">{selApp.duration_minutes} min</span></div>
            </div>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button className="w-full h-12 text-base font-semibold" onClick={handleConfirm} disabled={submitting}>
              {submitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Check className="w-5 h-5 mr-2" />}
              Confirmar Agendamento
            </Button>
          </div>
        )}

        {/* ── DONE ── */}
        {step === "done" && (
          <div className="text-center space-y-4 py-8 animate-in fade-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold">{managingApt ? "Reagendamento Confirmado!" : "Agendamento Confirmado!"}</h2>
            <p className="text-sm text-muted-foreground">Seu atendimento foi {managingApt ? "reagendado" : "agendado"} com sucesso.</p>
            <Button variant="outline" onClick={goHome} className="mt-4">Voltar ao início</Button>
          </div>
        )}

        {/* ── CANCELED ── */}
        {step === "canceled" && (
          <div className="text-center space-y-4 py-8 animate-in fade-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
              <X className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold">Agendamento Cancelado</h2>
            <p className="text-sm text-muted-foreground">Seu agendamento foi cancelado com sucesso.</p>
            <Button variant="outline" onClick={goHome} className="mt-4">Voltar ao início</Button>
          </div>
        )}
      </div>
    </div>
  );
}
