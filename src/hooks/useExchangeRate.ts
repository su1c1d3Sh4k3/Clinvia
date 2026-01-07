import { useState, useEffect } from "react";

interface ExchangeRate {
    USD: {
        code: string;
        codein: string;
        name: string;
        high: string;
        low: string;
        varBid: string;
        pctChange: string;
        bid: string;
        ask: string;
        timestamp: string;
        create_date: string;
    };
}

export const useExchangeRate = () => {
    const [rate, setRate] = useState<number>(5.0); // Default fallback rate
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchRate = async () => {
            try {
                const response = await fetch(
                    "https://economia.awesomeapi.com.br/last/USD-BRL"
                );
                if (!response.ok) {
                    throw new Error("Failed to fetch exchange rate");
                }
                const data: ExchangeRate = await response.json();
                const bidRate = parseFloat(data.USDBRL?.bid || "5.0");
                setRate(bidRate);
                setError(null);
            } catch (err) {
                console.error("Error fetching exchange rate:", err);
                setError("Erro ao buscar cotação");
                // Keep default fallback rate
            } finally {
                setLoading(false);
            }
        };

        fetchRate();
        // Refresh every 30 minutes
        const interval = setInterval(fetchRate, 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const convertToReal = (usdAmount: number): string => {
        const value = usdAmount * rate;
        return value.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
        });
    };

    return { rate, loading, error, convertToReal };
};
