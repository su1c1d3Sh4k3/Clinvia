import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Loader2, Clock, Check, ChevronLeft, ChevronRight, User, ArrowLeft } from "lucide-react";
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

interface BookingParams { user_id: string; contact_id: string; contact_name: string; }
type Step = "service" | "professional" | "datetime" | "confirm" | "done";

export default function PublicBooking() {
  const [searchParams] = useSearchParams();
  const [params, setParams] = useState<BookingParams | null>(null);
  const [error, setError] = useState("");

  const [categories, setCategories] = useState<any[]>([]);
  const [serviceNames, setServiceNames] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [allProfessionals, setAllProfessionals] = useState<any[]>([]);
  const [slots, setSlots] = useState<string[]>([]);

  const [step, setStep] = useState<Step>("service");
  const [selCatId, setSelCatId] = useState("");
  const [selSvcId, setSelSvcId] = useState("");
  const [selApp, setSelApp] = useState<any>(null);
  const [selProf, setSelProf] = useState<any>(null);
  const [selDate, setSelDate] = useState<Date | null>(null);
  const [selTime, setSelTime] = useState("");
  const [calMonth, setCalMonth] = useState(new Date());

  const [loading, setLoading] = useState(true);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const tomorrow = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); return d;
  }, []);

  // Parse token
  useEffect(() => {
    try {
      const d = searchParams.get("d");
      if (!d) { setError("Link inválido"); setLoading(false); return; }
      const decoded = JSON.parse(atob(d));
      if (!decoded.user_id || !decoded.contact_id) { setError("Link inválido"); setLoading(false); return; }
      setParams(decoded);
    } catch { setError("Link expirado ou inválido"); setLoading(false); }
  }, [searchParams]);

  // Fetch services + professionals
  useEffect(() => {
    if (!params) return;
    (async () => {
      setLoading(true);
      try {
        const [svcData, profData] = await Promise.all([
          callApi({ action: "get_services", user_id: params.user_id }),
          callApi({ action: "get_prof_list", user_id: params.user_id }),
        ]);
        setCategories(svcData.categories || []);
        setServiceNames(svcData.service_names || []);
        setApplications(svcData.applications || []);
        setAllProfessionals(profData.professionals || []);
      } catch (err: any) { setError(err.message); }
      setLoading(false);
    })();
  }, [params]);

  const filteredSns = useMemo(() => serviceNames.filter(s => s.category_id === selCatId), [serviceNames, selCatId]);
  const filteredApps = useMemo(() => applications.filter(a => a.service_name_id === selSvcId), [applications, selSvcId]);
  const filteredProfs = useMemo(() => {
    if (!selApp) return [];
    return allProfessionals.filter(p => (selApp.professionals || []).includes(p.id));
  }, [selApp, allProfessionals]);

  // Fetch slots
  useEffect(() => {
    if (!selDate || !selProf || !selApp || !params) return;
    (async () => {
      setLoadingSlots(true);
      setSelTime("");
      try {
        const data = await callApi({
          action: "get_slots",
          user_id: params.user_id,
          professional_id: selProf.id,
          service_id: selApp.id,
          date: format(selDate, "yyyy-MM-dd"),
        });
        setSlots(data.slots || []);
      } catch { setSlots([]); }
      setLoadingSlots(false);
    })();
  }, [selDate, selProf, selApp, params]);

  // Calendar days
  const calDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(calMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(calMonth), { weekStartsOn: 0 });
    const days: Date[] = [];
    let d = start;
    while (d <= end) { days.push(new Date(d)); d = addDays(d, 1); }
    return days;
  }, [calMonth]);

  const handleSelectApp = (app: any) => {
    setSelApp(app);
    const profs = allProfessionals.filter(p => (app.professionals || []).includes(p.id));
    if (profs.length === 1) {
      setSelProf(profs[0]);
      setStep("datetime");
    } else {
      setStep("professional");
    }
  };

  const handleConfirm = async () => {
    if (!params || !selApp || !selProf || !selDate || !selTime) return;
    setSubmitting(true);
    setError("");
    try {
      await callApi({
        action: "create_booking",
        user_id: params.user_id,
        contact_id: params.contact_id,
        service_id: selApp.id,
        professional_id: selProf.id,
        date: format(selDate, "yyyy-MM-dd"),
        time: selTime,
      });
      setStep("done");
    } catch (err: any) { setError(err.message); }
    setSubmitting(false);
  };

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (error && !params) return <div className="min-h-screen flex items-center justify-center bg-background p-6"><p className="text-destructive text-center">{error}</p></div>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">Agendar Atendimento</h1>
          {params?.contact_name && <p className="text-sm text-muted-foreground">Olá, {params.contact_name}</p>}
        </div>

        {/* Steps */}
        <div className="flex items-center justify-center gap-2">
          {(["service", "professional", "datetime", "confirm"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                step === s ? "bg-primary text-primary-foreground" :
                (["service", "professional", "datetime", "confirm"].indexOf(step) > i || step === "done") ? "bg-primary/20 text-primary" :
                "bg-muted text-muted-foreground"
              )}>{step === "done" && i < 4 ? <Check className="w-3.5 h-3.5" /> : i + 1}</div>
              {i < 3 && <div className="w-6 h-px bg-border" />}
            </div>
          ))}
        </div>

        {/* ── Step 1: Service ── */}
        {step === "service" && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Escolha o serviço</h2>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Categoria</label>
              <div className="grid grid-cols-2 gap-2">
                {categories.map(c => (
                  <button key={c.id} onClick={() => { setSelCatId(c.id); setSelSvcId(""); setSelApp(null); }}
                    className={cn("p-3 rounded-lg border text-sm font-medium text-left transition-all",
                      selCatId === c.id ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/50"
                    )}>{c.name}</button>
                ))}
              </div>
            </div>

            {selCatId && filteredSns.length > 0 && (
              <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <label className="text-xs text-muted-foreground">Serviço</label>
                <div className="grid grid-cols-1 gap-2">
                  {filteredSns.map(s => (
                    <button key={s.id} onClick={() => { setSelSvcId(s.id); setSelApp(null); }}
                      className={cn("p-3 rounded-lg border text-sm font-medium text-left transition-all",
                        selSvcId === s.id ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/50"
                      )}>{s.name}</button>
                  ))}
                </div>
              </div>
            )}

            {selSvcId && filteredApps.length > 0 && (
              <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <label className="text-xs text-muted-foreground">Aplicação</label>
                <div className="grid grid-cols-1 gap-2">
                  {filteredApps.map(a => (
                    <button key={a.id} onClick={() => handleSelectApp(a)}
                      className={cn("p-3 rounded-lg border text-left transition-all",
                        selApp?.id === a.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                      )}>
                      <span className="text-sm font-medium">{a.name}</span>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-primary font-semibold">{fmt(a.price)}</span>
                        {a.duration_minutes && <span className="text-xs text-muted-foreground">{a.duration_minutes} min</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Professional ── */}
        {step === "professional" && (
          <div className="space-y-4">
            <button onClick={() => setStep("service")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <h2 className="text-sm font-semibold text-muted-foreground">Escolha o profissional</h2>
            <div className="grid grid-cols-2 gap-3">
              {filteredProfs.map(p => (
                <button key={p.id} onClick={() => { setSelProf(p); setStep("datetime"); }}
                  className={cn("flex flex-col items-center gap-2 p-4 rounded-lg border transition-all",
                    selProf?.id === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  )}>
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

        {/* ── Step 3: Date + Time ── */}
        {step === "datetime" && (
          <div className="space-y-4">
            <button onClick={() => setStep(filteredProfs.length > 1 ? "professional" : "service")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <h2 className="text-sm font-semibold text-muted-foreground">Escolha data e horário</h2>

            <div className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-3">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCalMonth(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; })}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium capitalize">{format(calMonth, "MMMM yyyy", { locale: ptBR })}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setCalMonth(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; })}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center">
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
                  <div className="grid grid-cols-4 gap-2">
                    {slots.map(t => (
                      <button key={t} onClick={() => { setSelTime(t); setStep("confirm"); }}
                        className={cn("py-2.5 rounded-lg border text-sm font-medium transition-all",
                          selTime === t ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50"
                        )}>{t}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Step 4: Confirm ── */}
        {step === "confirm" && selApp && selProf && selDate && selTime && (
          <div className="space-y-4">
            <button onClick={() => setStep("datetime")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <h2 className="text-sm font-semibold text-muted-foreground">Confirme seu agendamento</h2>
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Serviço</span><span className="text-sm font-medium">{selApp.name}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Profissional</span><span className="text-sm font-medium">{selProf.name}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Data</span><span className="text-sm font-medium capitalize">{format(selDate, "EEEE, dd/MM", { locale: ptBR })}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Horário</span><span className="text-sm font-medium">{selTime}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Duração</span><span className="text-sm font-medium">{selApp.duration_minutes} min</span></div>
              <div className="flex items-center justify-between pt-2 border-t"><span className="text-sm font-semibold">Valor</span><span className="text-base font-bold text-primary">{fmt(selApp.price)}</span></div>
            </div>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <Button className="w-full h-12 text-base font-semibold" onClick={handleConfirm} disabled={submitting}>
              {submitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Check className="w-5 h-5 mr-2" />}
              Confirmar Agendamento
            </Button>
          </div>
        )}

        {/* ── Step 5: Done ── */}
        {step === "done" && (
          <div className="text-center space-y-4 py-8 animate-in fade-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold">Agendamento Confirmado!</h2>
            <p className="text-sm text-muted-foreground">Seu atendimento foi agendado com sucesso.</p>
            <div className="border rounded-lg p-4 space-y-2 text-left">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Serviço</span><span className="font-medium">{selApp?.name}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Profissional</span><span className="font-medium">{selProf?.name}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Data</span><span className="font-medium">{selDate && format(selDate, "dd/MM/yyyy")}</span></div>
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Horário</span><span className="font-medium">{selTime}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
