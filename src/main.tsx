import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Patch global para prevenir crash causado por extensões de browser ou autocomplete nativo
// injetando nós no DOM que o React não reconhece como filhos (removeChild/insertBefore).
// Erro original: "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node"
(function patchDomForBrowserAutocomplete() {
    const originalRemoveChild = Node.prototype.removeChild;
    // @ts-ignore
    Node.prototype.removeChild = function <T extends Node>(child: T): T {
        if (child.parentNode !== this) {
            // Browser (autocomplete, extensão de senha, etc.) moveu o nó — ignorar silenciosamente
            return child;
        }
        return originalRemoveChild.call(this, child) as T;
    };

    const originalInsertBefore = Node.prototype.insertBefore;
    // @ts-ignore
    Node.prototype.insertBefore = function <T extends Node>(newNode: T, referenceNode: Node | null): T {
        if (referenceNode && referenceNode.parentNode !== this) {
            return originalInsertBefore.call(this, newNode, null) as T;
        }
        return originalInsertBefore.call(this, newNode, referenceNode) as T;
    };
})();

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
            // Extract conversationId from URL and store in localStorage
            const url = new URL(event.data.url, window.location.origin);
            const conversationId = url.searchParams.get('conversationId');
            if (conversationId) {
                localStorage.setItem('pendingConversationId', conversationId);
            }
            // Navigate to / (React Router will handle the rest)
            window.location.href = '/';
        }
    });
}

// Auto-reload quando um chunk/módulo dinâmico falha ao carregar (deploy novo)
window.addEventListener("unhandledrejection", (event) => {
    const msg = event.reason?.message || String(event.reason || "");
    if (
        msg.includes("dynamically imported module") ||
        msg.includes("Failed to fetch dynamically imported module") ||
        msg.includes("Loading chunk") ||
        msg.includes("Loading CSS chunk")
    ) {
        const lastReload = sessionStorage.getItem("chunk_error_reload");
        const now = Date.now();
        if (!lastReload || now - Number(lastReload) > 30000) {
            sessionStorage.setItem("chunk_error_reload", String(now));
            window.location.reload();
        }
    }
});

createRoot(document.getElementById("root")!).render(
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
        <App />
    </ThemeProvider>
);
