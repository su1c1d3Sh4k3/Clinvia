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
    // Use Test Key only on localhost to avoid "Invalid Domain". On production (even dev build), use Real Key.
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const activeSiteKey = siteKey || (isLocalhost ? "1x00000000000000000000AA" : "0x4AAAAAACOK66PvxkZuZTup");
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
