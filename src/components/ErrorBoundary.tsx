
import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
    name?: string; // To identify which boundary caught the error
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        // Erros de DOM causados por autocomplete/extensões do browser não devem crashar a UI
        const isDomAutocompleteError =
            error.message?.includes("removeChild") ||
            error.message?.includes("insertBefore") ||
            error.message?.includes("not a child of this node");

        if (isDomAutocompleteError) {
            return { hasError: false, error: null };
        }
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        const isDomAutocompleteError =
            error.message?.includes("removeChild") ||
            error.message?.includes("insertBefore") ||
            error.message?.includes("not a child of this node");

        if (isDomAutocompleteError) {
            console.warn(`[ErrorBoundary] DOM autocomplete conflict ignorado em ${this.props.name || 'Component'}:`, error.message);
            return;
        }

        // Auto-reload para erros de chunk/módulo dinâmico (deploy novo com hashes diferentes)
        const isChunkError =
            error.message?.includes("dynamically imported module") ||
            error.message?.includes("Failed to fetch dynamically imported module") ||
            error.message?.includes("Loading chunk") ||
            error.message?.includes("Loading CSS chunk") ||
            error.name === "ChunkLoadError";

        if (isChunkError) {
            const lastReload = sessionStorage.getItem("chunk_error_reload");
            const now = Date.now();
            // Evita loop infinito — só faz auto-reload 1x a cada 30s
            if (!lastReload || now - Number(lastReload) > 30000) {
                sessionStorage.setItem("chunk_error_reload", String(now));
                window.location.reload();
                return;
            }
        }

        console.error(`Uncaught error in ${this.props.name || 'Component'}:`, error, errorInfo);
    }

    public handleReload = () => {
        const isChunkError =
            this.state.error?.message?.includes("dynamically imported module") ||
            this.state.error?.message?.includes("Failed to fetch dynamically imported module") ||
            this.state.error?.message?.includes("Loading chunk") ||
            this.state.error?.name === "ChunkLoadError";

        if (isChunkError) {
            window.location.reload();
            return;
        }
        this.setState({ hasError: false, error: null });
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex flex-col items-center justify-center p-6 h-full min-h-[200px] w-full bg-background border rounded-md">
                    <div className="flex flex-col items-center text-center space-y-4 max-w-md">
                        <div className="p-3 bg-red-100 dark:bg-red-900/20 rounded-full">
                            <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-lg font-semibold tracking-tight">
                                Algo deu errado
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                Um erro ocorreu {this.props.name ? `em ${this.props.name}` : "nesta seção"}.
                                {this.state.error?.message && (
                                    <span className="block mt-1 font-mono text-xs bg-muted p-1 rounded">
                                        {this.state.error.message.slice(0, 100)}
                                    </span>
                                )}
                            </p>
                        </div>

                        <Button
                            variant="outline"
                            onClick={this.handleReload}
                            className="gap-2"
                        >
                            <RefreshCcw className="w-4 h-4" />
                            Tentar Novamente
                        </Button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
