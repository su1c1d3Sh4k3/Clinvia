import { useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { BellRing, Clock, Star, MessageCircle, CalendarClock, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Simulador — linha do tempo das mensagens automáticas do agendamento
// ---------------------------------------------------------------------------

interface FlowStep {
    key: string;
    when: string;
    label: string;
    icon: any;
    message: string;
    buttons?: string[];
    effect: string;
}

const FLOW_STEPS: FlowStep[] = [
    {
        key: "confirm",
        when: "24h antes",
        label: "Confirmação",
        icon: BellRing,
        message: "Olá, Maria! Passando para confirmar seu horário de amanhã às 14:00 (Toxina Botulínica com Dra. Ana). Podemos confirmar?",
        buttons: ["✅ Confirmar", "🔄 Reagendar", "❌ Cancelar", "💬 Falar com atendente"],
        effect: "O cliente responde pelos botões: Confirmar marca o agendamento como confirmado; Reagendar/Cancelar atualizam a agenda sozinhos; Falar com atendente chama a equipe. Se houver mais de um horário no dia, tudo vai numa mensagem só.",
    },
    {
        key: "reminder",
        when: "2h antes",
        label: "Lembrete",
        icon: Clock,
        message: "Oi, Maria! Lembrando que seu horário é hoje às 14:00. Até já! 😊",
        effect: "Mensagem simples de texto — só um empurrãozinho para reduzir faltas. Não espera resposta.",
    },
    {
        key: "feedback",
        when: "24h depois",
        label: "Pesquisa de satisfação",
        icon: Star,
        message: "Maria, como foi sua experiência ontem? Responda de 1 a 5:",
        buttons: ["1", "2", "3", "4", "5"],
        effect: "A nota vira o NPS do PROFISSIONAL que atendeu e alimenta o dashboard de Satisfação. Enquanto a pesquisa está ativa, o card do cliente fica na etapa 'Pesquisa de Satisfação' do CRM — ao responder (ou após 24h), vai para 'Finalizado'.",
    },
];

export function ConfirmationFlowSimulator() {
    const [sel, setSel] = useState(FLOW_STEPS[0]);
    const [panelRef] = useAutoAnimate();

    return (
        <div className="rounded-2xl border bg-card p-4 md:p-5 space-y-4">
            <p className="text-sm font-semibold">Simulação: as 3 mensagens automáticas de um agendamento</p>

            {/* Timeline */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {FLOW_STEPS.map((s, i) => (
                    <div key={s.key} className="flex items-center shrink-0">
                        {i > 0 && <div className="mx-1 h-px w-6 bg-border" />}
                        <button
                            onClick={() => setSel(s)}
                            className={cn(
                                "flex flex-col items-center gap-1 rounded-xl border px-3 py-2 text-xs transition-colors",
                                sel.key === s.key
                                    ? "border-primary bg-primary/10 text-foreground"
                                    : "text-muted-foreground hover:border-primary/40",
                            )}
                        >
                            <s.icon className={cn("h-4 w-4", sel.key === s.key && "text-primary")} />
                            <span className="font-medium">{s.label}</span>
                            <Badge variant="outline" className="border-0 bg-muted px-1.5 text-[10px]">{s.when}</Badge>
                        </button>
                    </div>
                ))}
            </div>

            <div ref={panelRef} className="space-y-3">
                {/* Bolha WhatsApp */}
                <div key={`msg-${sel.key}`} className="rounded-xl bg-muted/50 p-3.5">
                    <div className="max-w-md rounded-2xl rounded-tl-sm border bg-background p-3 shadow-sm">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                            <MessageCircle className="h-3 w-3" /> Clínica (automático)
                        </p>
                        <p className="mt-1 text-sm">{sel.message}</p>
                        {sel.buttons && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {sel.buttons.map((b) => (
                                    <span key={b} className="rounded-full border bg-muted/60 px-2.5 py-1 text-xs">{b}</span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div key={`fx-${sel.key}`} className="rounded-xl bg-muted/50 p-3.5 text-sm text-muted-foreground animate-in fade-in slide-in-from-bottom-1 duration-300">
                    {sel.effect}
                </div>
            </div>

            <p className="text-xs text-muted-foreground">
                Tudo automático: basta o agendamento existir na Agenda. Os textos são editáveis em Conexões
                (Templates para número oficial / Mensagens API não oficial).
            </p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Demo — horário global vs. horário individual por dia
// ---------------------------------------------------------------------------

const WEEK: { day: string; hours: string; off?: boolean }[] = [
    { day: "Seg", hours: "08:00–18:00" },
    { day: "Ter", hours: "08:00–18:00" },
    { day: "Qua", hours: "10:00–20:00" },
    { day: "Qui", hours: "08:00–18:00" },
    { day: "Sex", hours: "08:00–14:00" },
    { day: "Sáb", hours: "09:00–13:00" },
    { day: "Dom", hours: "—", off: true },
];

export function DailyScheduleDemo() {
    const [individual, setIndividual] = useState(false);
    const [panelRef] = useAutoAnimate();

    return (
        <div className="rounded-2xl border bg-card p-4 md:p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className="text-sm font-semibold">Demo: horário da Dra. Ana</p>
                    <p className="text-xs text-muted-foreground">Ligue o switch para configurar dia a dia</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Horário individual</span>
                    <Switch checked={individual} onCheckedChange={setIndividual} />
                </div>
            </div>

            <div ref={panelRef}>
                {individual ? (
                    <div key="daily" className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                        {WEEK.map((d) => (
                            <div
                                key={d.day}
                                className={cn(
                                    "rounded-xl border p-2 text-center",
                                    d.off ? "bg-muted/50 text-muted-foreground" : "border-primary/30 bg-primary/5",
                                )}
                            >
                                <p className="text-xs font-semibold">{d.day}</p>
                                <p className="mt-0.5 text-[11px] text-muted-foreground">{d.hours}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div key="global" className="flex items-center gap-3 rounded-xl border p-3.5">
                        <Sun className="h-5 w-5 text-primary" />
                        <div>
                            <p className="text-sm font-medium">Horário global: 08:00–18:00, seg a sáb</p>
                            <p className="text-xs text-muted-foreground">Um único horário vale para todos os dias de trabalho.</p>
                        </div>
                    </div>
                )}
            </div>

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarClock className="h-3.5 w-3.5" />
                O horário do profissional limita TUDO: grade da agenda, IA, link público e APIs só oferecem horários dentro dele.
            </p>
        </div>
    );
}
