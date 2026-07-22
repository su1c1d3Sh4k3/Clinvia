import { useQuery } from "@tanstack/react-query";

const FALLBACK_RATE = 5.5;

/** Cotação USD→BRL (AwesomeAPI). Fallback 5.50 se indisponível. */
export function useUsdBrlRate() {
    return useQuery({
        queryKey: ["usd-brl-rate"],
        queryFn: async (): Promise<{ rate: number; isFallback: boolean }> => {
            try {
                const resp = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL");
                if (!resp.ok) throw new Error("rate fetch failed");
                const data = await resp.json();
                const rate = parseFloat(data?.USDBRL?.bid);
                if (!rate || isNaN(rate)) throw new Error("invalid rate");
                return { rate, isFallback: false };
            } catch {
                return { rate: FALLBACK_RATE, isFallback: true };
            }
        },
        staleTime: 60 * 60 * 1000,
        retry: 1,
    });
}
