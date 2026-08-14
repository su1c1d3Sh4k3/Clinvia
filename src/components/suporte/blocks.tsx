import { ReactNode, useEffect, useRef, useState } from "react";
import { LucideIcon, Lightbulb, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Blocos base do manual (página Suporte)
// ---------------------------------------------------------------------------

/** Seção de tópico com âncora para a sub-navegação sticky. */
export function TopicSection({
    id,
    index,
    icon: Icon,
    title,
    subtitle,
    children,
}: {
    id: string;
    index: number;
    icon: LucideIcon;
    title: string;
    subtitle?: string;
    children: ReactNode;
}) {
    return (
        <section id={id} data-topic={id} className="scroll-mt-28 space-y-4">
            <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <h2 className="text-lg font-bold leading-tight">
                        <span className="mr-1.5 text-primary/60">{index}.</span>
                        {title}
                    </h2>
                    {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
                </div>
            </div>
            <div className="space-y-4 md:pl-12">{children}</div>
        </section>
    );
}

/** Callout padronizado: dica / atenção / boa prática / evite. */
const CALLOUT_STYLES = {
    dica: {
        icon: Lightbulb,
        box: "border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40",
        iconCls: "text-sky-600",
        label: "Dica",
    },
    atencao: {
        icon: AlertTriangle,
        box: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
        iconCls: "text-amber-600",
        label: "Atenção",
    },
    pratica: {
        icon: CheckCircle2,
        box: "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40",
        iconCls: "text-emerald-600",
        label: "Boa prática",
    },
    evite: {
        icon: XCircle,
        box: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40",
        iconCls: "text-red-600",
        label: "Evite",
    },
} as const;

export function Callout({
    type,
    title,
    children,
}: {
    type: keyof typeof CALLOUT_STYLES;
    title?: string;
    children: ReactNode;
}) {
    const s = CALLOUT_STYLES[type];
    const Icon = s.icon;
    return (
        <div className={cn("flex gap-3 rounded-xl border p-3.5 text-sm", s.box)}>
            <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", s.iconCls)} />
            <div className="space-y-0.5">
                <p className="font-semibold">{title ?? s.label}</p>
                <div className="text-muted-foreground [&_strong]:text-foreground">{children}</div>
            </div>
        </div>
    );
}

/** Passo a passo vertical numerado com linha conectora. */
export interface Step {
    title: string;
    description: ReactNode;
    icon?: LucideIcon;
}

export function StepByStep({ steps }: { steps: Step[] }) {
    return (
        <ol className="space-y-0">
            {steps.map((step, i) => {
                const Icon = step.icon;
                const last = i === steps.length - 1;
                return (
                    <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
                        {!last && (
                            <span className="absolute left-[15px] top-8 bottom-0 w-px bg-border" aria-hidden />
                        )}
                        <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-primary/30 bg-background text-sm font-bold text-primary">
                            {Icon ? <Icon className="h-4 w-4" /> : i + 1}
                        </span>
                        <div className="min-w-0 pt-1">
                            <p className="font-semibold text-sm">{step.title}</p>
                            <div className="text-sm text-muted-foreground">{step.description}</div>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}

/** Sub-navegação sticky com destaque do tópico visível (IntersectionObserver). */
export function SubNav({ topics }: { topics: { id: string; label: string }[] }) {
    const [active, setActive] = useState(topics[0]?.id);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                if (visible[0]) setActive(visible[0].target.getAttribute("data-topic") || "");
            },
            { rootMargin: "-20% 0px -65% 0px" },
        );
        document.querySelectorAll("[data-topic]").forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, [topics]);

    // Mantém o item ativo visível na barra (mobile: scroll horizontal)
    useEffect(() => {
        containerRef.current
            ?.querySelector(`[data-nav="${active}"]`)
            ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    }, [active]);

    return (
        <nav className="sticky top-0 z-20 -mx-4 border-b bg-background/90 px-4 py-2 backdrop-blur md:mx-0 md:rounded-xl md:border md:px-2">
            <div ref={containerRef} className="flex gap-1 overflow-x-auto">
                {topics.map((t, i) => (
                    <button
                        key={t.id}
                        data-nav={t.id}
                        onClick={() =>
                            document.getElementById(t.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
                        }
                        className={cn(
                            "shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                            active === t.id
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                    >
                        <span className="mr-1 opacity-60">{i + 1}</span>
                        {t.label}
                    </button>
                ))}
            </div>
        </nav>
    );
}

/** Chip do hero: "o que você vai aprender" — rola até o tópico. */
export function LearnChip({ topicId, children }: { topicId: string; children: ReactNode }) {
    return (
        <button
            onClick={() =>
                document.getElementById(topicId)?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
            {children}
        </button>
    );
}
