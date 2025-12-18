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

createRoot(document.getElementById("root")!).render(
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <App />
    </ThemeProvider>
);
