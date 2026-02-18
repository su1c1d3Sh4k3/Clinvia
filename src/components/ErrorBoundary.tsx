
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
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error(`Uncaught error in ${this.props.name || 'Component'}:`, error, errorInfo);
    }

    public handleReload = () => {
        this.setState({ hasError: false, error: null });
        // Optional: window.location.reload(); if it's a critical global error
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
