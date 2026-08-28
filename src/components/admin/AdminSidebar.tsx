import { ShieldAlert, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { ADMIN_PAGES, type AdminPage } from "@/lib/adminPermissions";
import { Badge } from "@/components/ui/badge";

interface AdminSidebarProps {
    active: AdminPage;
    onSelect: (page: AdminPage) => void;
    /** páginas que o usuário pode ao menos visualizar */
    visiblePages: AdminPage[];
    userName: string;
    userEmail: string;
    isSuperAdmin: boolean;
    /** chamados aguardando resposta — badge no item Suporte */
    supportBadge?: number;
    onLogout: () => void;
}

/**
 * Rail de 60px que expande no hover para 240px, no fluxo (empurra o conteúdo)
 * — mesmo comportamento do NavigationSidebar do app do cliente.
 */
export function AdminSidebar({
    active,
    onSelect,
    visiblePages,
    userName,
    userEmail,
    isSuperAdmin,
    supportBadge = 0,
    onLogout,
}: AdminSidebarProps) {
    const items = ADMIN_PAGES.filter((p) => visiblePages.includes(p.value));

    return (
        <aside className="group/adminbar h-full w-[60px] hover:w-[240px] shrink-0 transition-all duration-300 ease-in-out bg-gray-950 border-r border-gray-800 flex flex-col overflow-hidden z-50">
            <div className="h-16 flex items-center gap-3 px-[18px] border-b border-gray-800 shrink-0">
                <ShieldAlert className="w-6 h-6 text-red-500 shrink-0" />
                <span className="text-white font-bold whitespace-nowrap opacity-0 group-hover/adminbar:opacity-100 transition-opacity duration-200">
                    Painel Admin
                </span>
            </div>

            <nav className="flex-1 py-3 space-y-1 overflow-y-auto overflow-x-hidden">
                {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = active === item.value;
                    const showBadge = item.value === "suporte" && supportBadge > 0;
                    return (
                        <button
                            key={item.value}
                            onClick={() => onSelect(item.value)}
                            title={item.label}
                            className={cn(
                                "w-full flex items-center gap-3 px-[18px] py-3 transition-colors relative",
                                isActive
                                    ? "bg-gray-800 text-white border-l-2 border-red-500"
                                    : "text-gray-400 hover:bg-gray-800/60 hover:text-white border-l-2 border-transparent"
                            )}
                        >
                            <span className="relative shrink-0">
                                <Icon className="w-5 h-5" />
                                {showBadge && (
                                    <span className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 group-hover/adminbar:hidden" />
                                )}
                            </span>
                            <span className="text-sm whitespace-nowrap opacity-0 group-hover/adminbar:opacity-100 transition-opacity duration-200">
                                {item.label}
                            </span>
                            {showBadge && (
                                <Badge className="ml-auto bg-red-500 text-white opacity-0 group-hover/adminbar:opacity-100 transition-opacity duration-200 shrink-0">
                                    {supportBadge}
                                </Badge>
                            )}
                        </button>
                    );
                })}
            </nav>

            <div className="border-t border-gray-800 p-3 shrink-0">
                <div className="flex items-center gap-3 mb-2">
                    <div className="w-9 h-9 rounded-full bg-gray-700 text-white flex items-center justify-center text-sm font-semibold shrink-0">
                        {userName?.[0]?.toUpperCase() || "?"}
                    </div>
                    <div className="min-w-0 opacity-0 group-hover/adminbar:opacity-100 transition-opacity duration-200">
                        <p className="text-sm text-white truncate">{userName}</p>
                        <p className="text-[11px] text-gray-500 truncate">
                            {isSuperAdmin ? "Super Admin" : userEmail}
                        </p>
                    </div>
                </div>
                <button
                    onClick={onLogout}
                    title="Sair"
                    className="w-full flex items-center gap-3 px-1.5 py-2 rounded text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                    <LogOut className="w-5 h-5 shrink-0" />
                    <span className="text-sm whitespace-nowrap opacity-0 group-hover/adminbar:opacity-100 transition-opacity duration-200">
                        Sair
                    </span>
                </button>
            </div>
        </aside>
    );
}
