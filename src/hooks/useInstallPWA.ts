import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{
        outcome: 'accepted' | 'dismissed';
        platform: string;
    }>;
    prompt(): Promise<void>;
}

export function useInstallPWA() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstallable, setIsInstallable] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);
    const [isIOS, setIsIOS] = useState(false);

    useEffect(() => {
        // Check if already installed
        const checkInstalled = () => {
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
            const isIOSStandalone = (window.navigator as any).standalone === true;
            setIsInstalled(isStandalone || isIOSStandalone);
        };

        // Detect iOS
        const checkIOS = () => {
            const ua = window.navigator.userAgent.toLowerCase();
            const isIOSDevice = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;
            setIsIOS(isIOSDevice);
        };

        checkInstalled();
        checkIOS();

        // Listen for install prompt
        const handleBeforeInstallPrompt = (e: Event) => {
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setIsInstallable(true);
        };

        // Listen for app installed
        const handleAppInstalled = () => {
            setIsInstalled(true);
            setIsInstallable(false);
            setDeferredPrompt(null);
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

    const installApp = useCallback(async () => {
        if (!deferredPrompt) {
            return { success: false, reason: 'no-prompt' };
        }

        try {
            await deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;

            if (outcome === 'accepted') {
                setIsInstallable(false);
                setDeferredPrompt(null);
                return { success: true, outcome };
            }

            return { success: false, outcome };
        } catch (error) {
            console.error('Error installing PWA:', error);
            return { success: false, reason: 'error', error };
        }
    }, [deferredPrompt]);

    return {
        isInstallable,
        isInstalled,
        isIOS,
        installApp,
        // For iOS, we show instructions since there's no programmatic install
        showIOSInstructions: isIOS && !isInstalled
    };
}
