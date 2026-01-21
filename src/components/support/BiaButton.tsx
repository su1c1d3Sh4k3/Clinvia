import { cn } from "@/lib/utils";
import { Headphones } from "lucide-react";

interface BiaButtonProps {
    onClick: () => void;
    isOpen: boolean;
    hasNewMessage?: boolean;
}

export const BiaButton = ({ onClick, isOpen, hasNewMessage }: BiaButtonProps) => {
    return (
        <button
            onClick={onClick}
            className={cn(
                "fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full flex items-center justify-center",
                "transition-all duration-300 ease-in-out",
                "hover:scale-105 active:scale-95",
                "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0175EC]"
            )}
            style={{
                backgroundColor: '#0175EC',
                boxShadow: '0 0 20px 4px rgba(1, 117, 236, 0.5), 0 4px 15px rgba(0, 0, 0, 0.2)'
            }}
            title="Falar com a Bia"
        >
            {/* Ícone de suporte */}
            <Headphones className="h-7 w-7 text-white" />

            {/* Indicador de nova mensagem */}
            {hasNewMessage && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 z-20">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
                </span>
            )}
        </button>
    );
};
