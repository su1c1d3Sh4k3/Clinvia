import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
    value: number;
    onChange: (value: number) => void;
    className?: string;
}

/**
 * CurrencyInput - Input para valores monetários em Reais
 * 
 * - Aceita apenas números (bloqueia caracteres especiais)
 * - Formata automaticamente com 2 casas decimais
 * - Exibe no formato brasileiro (0,00)
 * - Usuário digita 50000 → exibe 500,00 → salva 500.00
 */
const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
    ({ value, onChange, className, ...props }, ref) => {
        // Convert value (in Reais) to display format (with comma)
        const formatForDisplay = (valueInReais: number): string => {
            // Convert to centavos, then format
            const centavos = Math.round(valueInReais * 100);
            const reais = Math.floor(centavos / 100);
            const cents = centavos % 100;
            return `${reais},${cents.toString().padStart(2, '0')}`;
        };

        // Internal state for the display value
        const [displayValue, setDisplayValue] = React.useState(formatForDisplay(value || 0));

        // Update display when external value changes
        React.useEffect(() => {
            setDisplayValue(formatForDisplay(value || 0));
        }, [value]);

        const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            // Remove all non-numeric characters
            const rawValue = e.target.value.replace(/\D/g, '');

            // Convert to number (in centavos)
            const centavos = parseInt(rawValue || '0', 10);

            // Format for display
            const reais = Math.floor(centavos / 100);
            const cents = centavos % 100;
            const formatted = `${reais},${cents.toString().padStart(2, '0')}`;

            setDisplayValue(formatted);

            // Return value in Reais (float)
            onChange(centavos / 100);
        };

        const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
            // Select all on focus for easier editing
            e.target.select();
        };

        return (
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                    R$
                </span>
                <Input
                    ref={ref}
                    type="text"
                    inputMode="numeric"
                    value={displayValue}
                    onChange={handleChange}
                    onFocus={handleFocus}
                    className={cn("pl-9", className)}
                    {...props}
                />
            </div>
        );
    }
);

CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };
