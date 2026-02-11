import { useState, useEffect } from 'react';
import { differenceInMinutes } from 'date-fns';

export type TimeColor = 'green' | 'blue' | 'yellow' | 'orange' | 'red';

interface ConversationTimerResult {
    minutes: number;
    color: TimeColor;
    label: string;
}

/**
 * Hook to calculate time since last message and determine color/label
 * Updates every 60 seconds
 */
export function useConversationTimer(
    lastMessageAt: Date | string,
    lastMessageDirection: 'inbound' | 'outbound' | 'system'
): ConversationTimerResult {
    const [minutes, setMinutes] = useState(0);

    useEffect(() => {
        const updateTimer = () => {
            const messageDate = typeof lastMessageAt === 'string'
                ? new Date(lastMessageAt)
                : lastMessageAt;
            const diff = differenceInMinutes(new Date(), messageDate);
            setMinutes(diff);
        };

        updateTimer(); // Initial calculation
        const interval = setInterval(updateTimer, 60000); // Update every minute

        return () => clearInterval(interval);
    }, [lastMessageAt]);

    // Determine color based on time and direction
    const getColor = (): TimeColor => {
        if (lastMessageDirection === 'outbound') return 'green';

        if (minutes <= 5) return 'blue';
        if (minutes <= 20) return 'yellow';
        if (minutes <= 60) return 'orange';
        return 'red';
    };

    // Determine label
    const getLabel = (): string => {
        if (lastMessageDirection === 'outbound') return 'Respondido';
        return `Recebida há ${minutes}min`;
    };

    return {
        minutes,
        color: getColor(),
        label: getLabel()
    };
}
