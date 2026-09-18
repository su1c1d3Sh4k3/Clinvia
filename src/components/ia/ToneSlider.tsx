import { AlertTriangle, Info } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LIB_AXIS, LIB_COMERCIAL, TONE_AXIS_META } from "@/lib/tone";
import type { ToneAxis, ToneLevel } from "@/lib/tone";

/** Vale para qualquer nível: o tom não mexe nas travas. */
const LIMITE_COMERCIAL =
    "Em qualquer nível, a IA nunca inventa urgência, vaga ou prazo, e para na recusa direta.";

interface ToneSliderProps {
    axis: ToneAxis;
    value: ToneLevel;
    onChange: (value: ToneLevel) => void;
    /** Texto da regra de combinação que moveu este slider sozinho. */
    aviso?: string;
}

export function ToneSlider({ axis, value, onChange, aviso }: ToneSliderProps) {
    const meta = TONE_AXIS_META[axis];
    const entry = LIB_AXIS[axis][value];
    const isComercial = axis === "comercial";

    return (
        <div className="space-y-2" data-tour={`tom-${axis}`}>
            <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{meta.label}</span>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            aria-label={`O que é ${meta.label}`}
                            className="text-muted-foreground hover:text-foreground"
                        >
                            <Info className="h-3.5 w-3.5" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">{meta.tooltip}</TooltipContent>
                </Tooltip>
            </div>

            <Slider
                min={1}
                max={5}
                step={1}
                value={[value]}
                onValueChange={([v]) => onChange(v as ToneLevel)}
                aria-label={meta.label}
            />

            <div className="flex justify-between text-xs text-muted-foreground">
                <span>{meta.min}</span>
                <span>{meta.max}</span>
            </div>

            {isComercial ? (
                <div className="border-l-2 border-primary/40 pl-3 space-y-1">
                    <p className="text-sm">{LIB_COMERCIAL[value].comportamento}</p>
                    <p className="text-xs text-muted-foreground italic">"{entry.exemplo}"</p>
                    <p className="text-xs text-muted-foreground">{LIMITE_COMERCIAL}</p>
                </div>
            ) : (
                <p className="text-xs text-muted-foreground italic">"{entry.exemplo}"</p>
            )}

            {aviso && (
                <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{aviso}</span>
                </p>
            )}
        </div>
    );
}
