import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

interface TurnstileWidgetProps {
    onVerify: (token: string) => void;
    /** Chamado quando o token expira (5 min) — limpar o token salvo */
    onExpire?: () => void;
    siteKey?: string;
}

export interface TurnstileWidgetHandle {
    /** Gera um novo desafio/token (tokens são de uso único) */
    reset: () => void;
}

declare global {
    interface Window {
        turnstile: any;
    }
}

const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(({ onVerify, onExpire, siteKey }, ref) => {
    // Use Test Key only on localhost to avoid "Invalid Domain". On production (even dev build), use Real Key.
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const activeSiteKey = siteKey || (isLocalhost ? "1x00000000000000000000AA" : "0x4AAAAAACOK66PvxkZuZTup");
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);

    useImperativeHandle(ref, () => ({
        reset: () => {
            if (widgetId.current && window.turnstile) {
                window.turnstile.reset(widgetId.current);
            }
        },
    }));

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
                    // Renova o token automaticamente quando expira (evita
                    // "timeout-or-duplicate" quando o usuário demora a enviar o form)
                    'refresh-expired': 'auto',
                    callback: (token: string) => {
                        onVerify(token);
                    },
                    'expired-callback': () => {
                        onExpire?.();
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
});

TurnstileWidget.displayName = "TurnstileWidget";

export default TurnstileWidget;
