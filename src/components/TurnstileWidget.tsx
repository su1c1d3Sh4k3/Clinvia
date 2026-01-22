import { useEffect, useRef } from 'react';

interface TurnstileWidgetProps {
    onVerify: (token: string) => void;
    siteKey?: string;
}

declare global {
    interface Window {
        turnstile: any;
    }
}

const TurnstileWidget = ({ onVerify, siteKey }: TurnstileWidgetProps) => {
    // Automatically switch to Test Key in Development to avoid "Invalid Domain" error
    const activeSiteKey = siteKey || (import.meta.env.DEV ? "1x00000000000000000000AA" : "0x4AAAAAACOK66PvxkZuZTup");
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);

    useEffect(() => {
        // If the script is already loaded and we have the container
        if (window.turnstile && containerRef.current && !widgetId.current) {
            renderWidget();
        }

        // If script loads later
        const checkInterval = setInterval(() => {
            if (window.turnstile && containerRef.current && !widgetId.current) {
                renderWidget();
                clearInterval(checkInterval);
            }
        }, 100);

        return () => {
            clearInterval(checkInterval);
            if (widgetId.current && window.turnstile) {
                window.turnstile.remove(widgetId.current);
                widgetId.current = null;
            }
        };
    }, []);

    const renderWidget = () => {
        try {
            if (!widgetId.current && window.turnstile) {
                widgetId.current = window.turnstile.render(containerRef.current, {
                    sitekey: activeSiteKey,
                    theme: 'auto',
                    callback: (token: string) => {
                        onVerify(token);
                    },
                });
            }
        } catch (e) {
            console.error("Error rendering Turnstile widget:", e);
        }
    };

    return (
        <div
            ref={containerRef}
            className="my-4 flex justify-center min-h-[65px]"
            style={{ minHeight: '65px' }}
        />
    );
};

export default TurnstileWidget;
