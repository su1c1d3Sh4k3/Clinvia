import { useEffect, useState } from "react";
import {
    ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion, Gauge, Timer,
    Zap, ChevronDown, Lightbulb, Smartphone, TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useMetaQuality, MetaQualityInstance } from "@/hooks/useMetaQuality";

const RATING_META: Record<string, { label: string; icon: any; badge: string; bar: string; ring: string }> = {
    GREEN: {
        label: "Qualidade Alta",
        icon: ShieldCheck,
        badge: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-700",
        bar: "bg-emerald-500",
        ring: "border-l-emerald-500",
    },
    YELLOW: {
        label: "Qualidade Média",
        icon: ShieldAlert,
        badge: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700",
        bar: "bg-amber-500",
        ring: "border-l-amber-500",
    },
    RED: {
        label: "Qualidade Baixa",
        icon: ShieldX,
        badge: "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700",
        bar: "bg-red-500",
        ring: "border-l-red-500",
    },
    NA: {
        label: "Sem avaliação",
        icon: ShieldQuestion,
        badge: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
        bar: "bg-slate-400",
        ring: "border-l-slate-400",
    },
};

const THROUGHPUT_LABEL: Record<string, string> = {
    STANDARD: "Padrão (~80 msg/s)",
    HIGH: "Alta (~1.000 msg/s)",
    NOT_APPLICABLE: "Não aplicável",
};

const TIPS = [
    { icon: ShieldCheck, text: "Verifique sua empresa na Meta (Business Verification) — sobe o limite inicial de 250 para 2.000 contatos/dia." },
    { icon: TrendingUp, text: "Aumente o volume gradualmente: a Meta reavalia o número a cada 6 horas e sobe o limite automaticamente quando a qualidade se mantém alta." },
    { icon: Lightbulb, text: "Dispare apenas para contatos que deram consentimento (opt-in) e interagiram recentemente — bases frias geram bloqueios e denúncias." },
    { icon: ShieldAlert, text: "Inclua uma opção de saída no template (ex.: \"Responda SAIR para não receber mais\") — o cliente sai em vez de denunciar." },
    { icon: Timer, text: "Não repita disparos para a mesma audiência em poucos dias e respeite o limite diário — exceder derruba a qualidade do número." },
    { icon: Gauge, text: "Acompanhe o índice no WhatsApp Manager: se cair para Média/Baixa, pause campanhas por alguns dias até voltar ao verde." },
];

function useCountdown(target: string | null | undefined): string | null {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    if (!target) return null;
    const diff = new Date(target).getTime() - now;
    if (diff <= 0) return "renovada";
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function QualityCard({ inst }: { inst: MetaQualityInstance }) {
    const [tipsOpen, setTipsOpen] = useState(false);
    const countdown = useCountdown(inst.window_resets_at);

    const meta = RATING_META[inst.quality_rating || "NA"] || RATING_META.NA;
    const RatingIcon = meta.icon;
    const limit = inst.tier_limit;
    const used = inst.used_24h ?? 0;
    const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    if (inst.error) {
        return (
            <div className="border rounded-xl p-4 bg-card text-sm text-muted-foreground">
                <span className="font-medium">{inst.instance_name || "Instância Meta"}:</span>{" "}
                não foi possível consultar a qualidade agora ({inst.error}).
            </div>
        );
    }

    return (
        <div className={cn("border border-l-4 rounded-xl bg-card overflow-hidden", meta.ring)}>
            <div className="p-4 space-y-3">
                {/* Cabeçalho: instância + rating */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Smartphone className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-semibold truncate">
                            {inst.verified_name || inst.instance_name || "WhatsApp Oficial"}
                        </span>
                        {inst.display_phone_number && (
                            <span className="text-xs text-muted-foreground shrink-0">{inst.display_phone_number}</span>
                        )}
                    </div>
                    <Badge variant="outline" className={cn("gap-1", meta.badge)}>
                        <RatingIcon className="w-3.5 h-3.5" /> {meta.label}
                    </Badge>
                </div>

                {/* Métricas */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <div className="border rounded-xl p-3 space-y-1.5 col-span-2 md:col-span-1">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Gauge className="w-3.5 h-3.5" /> Limite diário de contatos
                        </div>
                        <p className="text-lg font-bold leading-none">
                            {limit != null ? (
                                <>
                                    {used.toLocaleString("pt-BR")}
                                    <span className="text-sm font-normal text-muted-foreground"> / {limit.toLocaleString("pt-BR")}</span>
                                </>
                            ) : (
                                "Ilimitado"
                            )}
                        </p>
                        {limit != null && (
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                    className={cn("h-full rounded-full transition-all", pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : meta.bar)}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                        )}
                    </div>
                    <div className="border rounded-xl p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Timer className="w-3.5 h-3.5" /> Janela renova em
                        </div>
                        <p className="text-lg font-bold leading-none tabular-nums">
                            {countdown ?? "—"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">24h após o último envio</p>
                    </div>
                    <div className="border rounded-xl p-3 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Zap className="w-3.5 h-3.5" /> Velocidade de envio
                        </div>
                        <p className="text-lg font-bold leading-none">
                            {inst.throughput_level ? (THROUGHPUT_LABEL[inst.throughput_level] || inst.throughput_level) : "—"}
                        </p>
                    </div>
                </div>

                {/* Dicas */}
                <button
                    type="button"
                    onClick={() => setTipsOpen((o) => !o)}
                    className="w-full flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                >
                    <Lightbulb className="w-4 h-4" />
                    Como aumentar sua qualidade e enviar para mais números
                    <ChevronDown className={cn("w-4 h-4 transition-transform", tipsOpen && "rotate-180")} />
                </button>
                {tipsOpen && (
                    <ul className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                        {TIPS.map((tip, i) => {
                            const TipIcon = tip.icon;
                            return (
                                <li key={i} className="flex items-start gap-2.5 text-sm border rounded-xl p-2.5 bg-muted/30">
                                    <TipIcon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                                    <span>{tip.text}</span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}

/** Painel de saúde das instâncias Meta (qualidade, limite e throughput em tempo real). */
export function MetaQualityPanel() {
    const { data, isLoading } = useMetaQuality();

    if (isLoading) {
        return <div className="h-24 border rounded-xl bg-muted/30 animate-pulse" />;
    }
    if (!data || data.length === 0) return null;

    return (
        <div className="space-y-3">
            {data.map((inst) => (
                <QualityCard key={inst.instance_id} inst={inst} />
            ))}
        </div>
    );
}

/** Badge compacto do quality_rating (usado ao lado do nome da conexão). */
export function MetaQualityBadge({ rating }: { rating?: string | null }) {
    if (!rating) return null;
    const meta = RATING_META[rating] || RATING_META.NA;
    const RatingIcon = meta.icon;
    return (
        <Badge variant="outline" className={cn("gap-1 text-[10px] md:text-xs", meta.badge)}>
            <RatingIcon className="w-3 h-3" /> {meta.label}
        </Badge>
    );
}
