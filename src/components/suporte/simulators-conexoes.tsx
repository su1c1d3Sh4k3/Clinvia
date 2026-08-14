import { useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Gauge, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Demo — limite diário (tier) do número oficial Meta
// ---------------------------------------------------------------------------

const TIERS = [
    { key: "250", label: "TIER 250", limit: 250, note: "número novo / negócio não verificado" },
    { key: "1k", label: "TIER 1K", limit: 1000, note: "primeiro upgrade automático" },
    { key: "10k", label: "TIER 10K", limit: 10000, note: "número maduro com boa qualidade" },
];

const SIZES = [100, 300, 800, 2000];

export function QualityTierDemo() {
    const [tier, setTier] = useState(TIERS[0]);
    const [size, setSize] = useState(SIZES[2]);
    const [panelRef] = useAutoAnimate();

    const pct = Math.min(100, Math.round((size / tier.limit) * 100));
    const exceeds = size > tier.limit;

    return (
        <div className="rounded-2xl border bg-card p-4 md:p-5 space-y-4">
            <p className="text-sm font-semibold">Demo: sua campanha cabe no limite diário do número?</p>

            <div className="grid gap-3 sm:grid-cols-2">
                <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Tier do número (painel Qualidade Meta)</p>
                    <div className="flex flex-wrap gap-1.5">
                        {TIERS.map((t) => (
                            <button
                                key={t.key}
                                onClick={() => setTier(t)}
                                className={cn(
                                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                                    tier.key === t.key
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:border-primary/40",
                                )}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">{tier.note}</p>
                </div>
                <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Contatos únicos nas últimas 24h</p>
                    <div className="flex flex-wrap gap-1.5">
                        {SIZES.map((s) => (
                            <button
                                key={s}
                                onClick={() => setSize(s)}
                                className={cn(
                                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                                    size === s
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "text-muted-foreground hover:border-primary/40",
                                )}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div ref={panelRef} className="space-y-2">
                <div key={`bar-${tier.key}-${size}`}>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                        <div
                            className={cn("h-full rounded-full transition-all duration-500", exceeds ? "bg-red-500" : "bg-emerald-500")}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {size} de {tier.limit} contatos únicos ({pct}%)
                    </p>
                </div>
                <div
                    key={`verdict-${tier.key}-${size}`}
                    className={cn(
                        "flex items-start gap-2 rounded-xl p-3.5 text-sm animate-in fade-in slide-in-from-bottom-1 duration-300",
                        exceeds
                            ? "border border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                            : "border border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
                    )}
                >
                    {exceeds ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
                    {exceeds
                        ? "Estourou o limite: os envios além do tier FALHAM até a janela de 24h reabrir. Divida a campanha em dias ou aguarde o upgrade de tier (a Meta sobe o limite conforme volume + boa qualidade)."
                        : "Dentro do limite: a campanha pode ser disparada sem bloqueio de tier. O selo de qualidade (verde/amarelo/vermelho) continua sendo o outro fator a vigiar."}
                </div>
            </div>

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Gauge className="h-3.5 w-3.5" />
                O limite conta CONTATOS ÚNICOS iniciados por você em 24h — não mensagens. Conferir antes de campanhas grandes
                evita número penalizado.
            </p>
        </div>
    );
}
