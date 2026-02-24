import { cn } from "@/lib/utils";

type NavIconId =
    | "dashboard"
    | "inbox"
    | "crm"
    | "queues-manager"
    | "automacao"
    | "operacoes"
    | "administrativo"
    | "default";

interface AnimatedNavIconProps {
    iconId: NavIconId;
    isActive: boolean;
    hasUnread?: boolean;
    className?: string;
    size?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual SVG icons — animated when active
// ─────────────────────────────────────────────────────────────────────────────

const DashboardIcon = ({ isActive, size }: { isActive: boolean; size: number }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        {/* Top-left quadrant */}
        <rect
            x="3" y="3" width="7" height="7" rx="1"
            className={cn("transition-all duration-300", isActive && "fill-primary/20")}
            style={isActive ? { animation: "scale-in 0.3s cubic-bezier(0.34,1.56,0.64,1) both" } : undefined}
        />
        {/* Top-right quadrant */}
        <rect
            x="14" y="3" width="7" height="7" rx="1"
            className={cn("transition-all duration-300", isActive && "fill-primary/20")}
            style={isActive ? { animation: "scale-in 0.4s cubic-bezier(0.34,1.56,0.64,1) both" } : undefined}
        />
        {/* Bottom-left quadrant */}
        <rect
            x="3" y="14" width="7" height="7" rx="1"
            className={cn("transition-all duration-300", isActive && "fill-primary/20")}
            style={isActive ? { animation: "scale-in 0.5s cubic-bezier(0.34,1.56,0.64,1) both" } : undefined}
        />
        {/* Bottom-right quadrant */}
        <rect
            x="14" y="14" width="7" height="7" rx="1"
            className={cn("transition-all duration-300", isActive && "fill-primary/20")}
            style={isActive ? { animation: "scale-in 0.6s cubic-bezier(0.34,1.56,0.64,1) both" } : undefined}
        />
    </svg>
);

const InboxIcon = ({ isActive, hasUnread, size }: { isActive: boolean; hasUnread?: boolean; size: number }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        {/* Chat bubble body */}
        <path
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
            className={cn("transition-all duration-300", isActive && "fill-primary/20")}
            strokeDasharray={hasUnread ? "60" : undefined}
            strokeDashoffset={hasUnread ? "0" : undefined}
        />
        {/* Typing dots — only visible when hasUnread */}
        {hasUnread && (
            <>
                <circle cx="9" cy="12" r="1" fill="currentColor"
                    style={{ animation: "glow-pulse 1.2s ease-in-out infinite" }} />
                <circle cx="12" cy="12" r="1" fill="currentColor"
                    style={{ animation: "glow-pulse 1.2s ease-in-out 0.2s infinite" }} />
                <circle cx="15" cy="12" r="1" fill="currentColor"
                    style={{ animation: "glow-pulse 1.2s ease-in-out 0.4s infinite" }} />
            </>
        )}
        {/* Static lines when no unread */}
        {!hasUnread && (
            <>
                <line x1="8" y1="10" x2="16" y2="10" strokeWidth="1.5" opacity="0.6" />
                <line x1="8" y1="13" x2="13" y2="13" strokeWidth="1.5" opacity="0.6" />
            </>
        )}
    </svg>
);

const CrmIcon = ({ isActive, size }: { isActive: boolean; size: number }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        {/* Briefcase body */}
        <rect
            x="2" y="7" width="20" height="14" rx="2"
            className={cn("transition-all duration-300", isActive && "fill-primary/15")}
        />
        {/* Briefcase top handle */}
        <path
            d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"
            strokeDasharray={isActive ? "20" : undefined}
            strokeDashoffset={isActive ? "0" : undefined}
            style={isActive ? { animation: "icon-draw 0.4s ease-out both" } : undefined}
        />
        {/* Center divider line */}
        <line x1="12" y1="12" x2="12" y2="17"
            style={isActive ? { animation: "icon-draw 0.5s ease-out 0.1s both" } : undefined}
            strokeDasharray={isActive ? "10" : undefined}
            strokeDashoffset={isActive ? "0" : undefined}
        />
        <line x1="9" y1="15" x2="15" y2="15" strokeWidth="1.5" opacity="0.7"
            style={isActive ? { animation: "icon-draw 0.5s ease-out 0.2s both" } : undefined}
        />
    </svg>
);

const QueuesIcon = ({ isActive, size }: { isActive: boolean; size: number }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <line x1="8" y1="6" x2="21" y2="6"
            style={isActive ? { animation: "icon-draw 0.3s ease-out both" } : undefined}
            strokeDasharray={isActive ? "20" : undefined}
        />
        <line x1="8" y1="12" x2="21" y2="12"
            style={isActive ? { animation: "icon-draw 0.3s ease-out 0.1s both" } : undefined}
            strokeDasharray={isActive ? "20" : undefined}
        />
        <line x1="8" y1="18" x2="21" y2="18"
            style={isActive ? { animation: "icon-draw 0.3s ease-out 0.2s both" } : undefined}
            strokeDasharray={isActive ? "20" : undefined}
        />
        <circle cx="4" cy="6" r="1.5" className={cn("transition-colors duration-300", isActive ? "fill-primary" : "fill-current")} />
        <circle cx="4" cy="12" r="1.5" fill="currentColor" />
        <circle cx="4" cy="18" r="1.5" fill="currentColor" />
    </svg>
);

const AutomacaoIcon = ({ isActive, size }: { isActive: boolean; size: number }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        {/* Wrench */}
        <path
            d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
            className={cn("transition-all duration-300", isActive && "fill-primary/15")}
            style={isActive ? { animation: "icon-draw 0.4s ease-out both", strokeDasharray: "80", strokeDashoffset: "0" } : undefined}
        />
    </svg>
);

const OperacoesIcon = ({ isActive, size }: { isActive: boolean; size: number }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <rect x="3" y="3" width="5" height="5" rx="1" className={cn(isActive && "fill-primary/20 stroke-primary")} />
        <rect x="10" y="3" width="5" height="5" rx="1" className={cn(isActive && "fill-primary/10")} style={{ opacity: isActive ? 0.7 : 1 }} />
        <rect x="17" y="3" width="4" height="5" rx="1" style={{ opacity: isActive ? 0.4 : 1 }} />
        <rect x="3" y="10" width="5" height="5" rx="1" style={{ opacity: isActive ? 0.6 : 1 }} />
        <rect x="10" y="10" width="11" height="5" rx="1" className={cn(isActive && "fill-primary/10")} style={{ opacity: isActive ? 0.8 : 1 }} />
        <rect x="3" y="17" width="18" height="4" rx="1" style={{ opacity: isActive ? 0.5 : 1 }} />
    </svg>
);

const AdminIcon = ({ isActive, size }: { isActive: boolean; size: number }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path
            d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"
            className={cn("transition-all duration-300", isActive && "fill-primary/15")}
        />
        <path d="M12 8v4l3 3" strokeLinecap="round" strokeDasharray={isActive ? "30" : undefined}
            style={isActive ? { animation: "icon-draw 0.5s ease-out both" } : undefined}
        />
    </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export const AnimatedNavIcon = ({
    iconId,
    isActive,
    hasUnread = false,
    className,
    size = 18,
}: AnimatedNavIconProps) => {
    const iconProps = { isActive, size };

    const renderIcon = () => {
        switch (iconId) {
            case "dashboard": return <DashboardIcon {...iconProps} />;
            case "inbox": return <InboxIcon {...iconProps} hasUnread={hasUnread} />;
            case "crm": return <CrmIcon {...iconProps} />;
            case "queues-manager": return <QueuesIcon {...iconProps} />;
            case "automacao": return <AutomacaoIcon {...iconProps} />;
            case "operacoes": return <OperacoesIcon {...iconProps} />;
            case "administrativo": return <AdminIcon {...iconProps} />;
            default: return null;
        }
    };

    return (
        <div
            className={cn(
                "relative flex items-center justify-center transition-all duration-300",
                isActive && "nav-icon-glow",
                className
            )}
            aria-hidden="true"
        >
            <div
                className={cn(
                    "transition-all duration-300",
                    isActive ? "text-primary" : "text-sidebar-foreground/70 dark:text-white/70"
                )}
                style={
                    isActive
                        ? { filter: "drop-shadow(0 0 4px hsl(var(--primary) / 0.6))" }
                        : undefined
                }
            >
                {renderIcon()}
            </div>
        </div>
    );
};
