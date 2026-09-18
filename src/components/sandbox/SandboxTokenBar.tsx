import { ArrowDownLeft, ArrowUpRight, Coins, Layers } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { SandboxTokenTotals } from "@/hooks/useSandbox";

/**
 * Contador do topo: quanto o teste já custou.
 *
 * Os números vêm de `sandbox_token_usage` — o consumo do ambiente de teste
 * NUNCA entra em token_usage_log nem no relatório de consumo da conta.
 */

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUM = new Intl.NumberFormat("pt-BR");

interface SandboxTokenBarProps {
    totais: SandboxTokenTotals | undefined;
}

export function SandboxTokenBar({ totais }: SandboxTokenBarProps) {
    const t = totais ?? {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        cost_brl: 0,
        calls: 0,
    };

    const itens = [
        {
            label: "Entrada",
            valor: NUM.format(t.prompt_tokens),
            hint: "tokens que a IA leu",
            Icone: ArrowDownLeft,
            cor: "text-blue-600 dark:text-blue-400",
        },
        {
            label: "Saída",
            valor: NUM.format(t.completion_tokens),
            hint: "tokens que a IA escreveu",
            Icone: ArrowUpRight,
            cor: "text-violet-600 dark:text-violet-400",
        },
        {
            label: "Total",
            valor: NUM.format(t.total_tokens),
            hint: `${NUM.format(t.calls)} resposta(s) da IA`,
            Icone: Layers,
            cor: "text-slate-600 dark:text-slate-300",
        },
        {
            label: "Custo do teste",
            valor: BRL.format(t.cost_brl),
            hint: "não entra na fatura da conta",
            Icone: Coins,
            cor: "text-emerald-600 dark:text-emerald-400",
        },
    ];

    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-tour="sandbox-tokens">
            {itens.map(({ label, valor, hint, Icone, cor }) => (
                <Card key={label}>
                    <CardContent className="flex items-center gap-3 p-4">
                        <div className={`rounded-lg bg-muted p-2 ${cor}`}>
                            <Icone className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-muted-foreground">{label}</p>
                            <p className="text-lg font-semibold leading-tight">{valor}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{hint}</p>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
