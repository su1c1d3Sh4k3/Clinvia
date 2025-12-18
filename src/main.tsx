import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import { ThemeProvider } from "@/components/ThemeProvider";
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker for PWA and Push Notifications
const updateSW = registerSW({
    onNeedRefresh() {
        console.log('[PWA] New content available, refresh to update');
    },
    onOfflineReady() {
        console.log('[PWA] App ready to work offline');
    },
    onRegistered(registration) {
        console.log('[PWA] Service Worker registered:', registration);
    },
    onRegisterError(error) {
        console.error('[PWA] Service Worker registration error:', error);
    }
});

// Listen for messages from Service Worker (e.g., notification clicks)
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        console.log('[App] Message from Service Worker:', event.data);
        if (event.data?.type === 'NOTIFICATION_CLICK' && event.data?.url) {
            console.log('[App] Navigating to:', event.data.url);
            window.location.href = event.data.url;
        }
    });
}

createRoot(document.getElementById("root")!).render(
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <App />
    </ThemeProvider>
);
