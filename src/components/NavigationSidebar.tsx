import {
  ListOrdered, Users, Settings, LayoutDashboard, MessageSquare, Briefcase, Wrench, Grid3X3,
  Smartphone, LogOut, Tag as TagIcon, BookUser, Calendar, ClipboardList,
  Package, Bot, ChevronDown, PieChart, Clock, MessageCircle,
  ShoppingCart, Headphones, UserRound, Sun, Moon
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "@/components/ThemeProvider";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentTeamMember } from "@/hooks/useStaff";
import { useFinancialAccess } from "@/hooks/useFinancialAccess";
import { differenceInDays } from "date-fns";
import { useState, useEffect } from "react";
import { useMobileMenu } from "@/contexts/MobileMenuContext";
import { AnimatedNavIcon } from "@/components/AnimatedNavIcon";

// Menu structure with submenus
interface MenuItem {
  icon: any;
  label: string;
  id: string;
  path?: string;
  children?: MenuItem[];
}

const menuStructure: MenuItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", id: "dashboard", path: "/dashboard" },
  { icon: MessageSquare, label: "Inbox", id: "inbox", path: "/" },
  { icon: MessageCircle, label: "Chat Interno", id: "internal_inbox", path: "/internal_inbox" },
  { icon: ListOrdered, label: "Gestão de Filas", id: "queues-manager", path: "/queues_manager" },
  { icon: Briefcase, label: "CRM", id: "crm", path: "/crm" },
  {
    icon: Wrench, label: "Automação", id: "automacao",
    children: [
      { icon: Bot, label: "Definições da IA", id: "ia-config", path: "/ia-config" },
      { icon: Smartphone, label: "Conexões", id: "whatsapp", path: "/whatsapp-connection" },
      { icon: Settings, label: "Configurações", id: "settings", path: "/settings" },
    ]
  },
  {
    icon: Grid3X3, label: "Operações", id: "operacoes",
    children: [
      { icon: Package, label: "Produtos e Serviços", id: "products-services", path: "/products-services" },
      { icon: BookUser, label: "Contatos", id: "contacts", path: "/contacts" },
      { icon: UserRound, label: "Pacientes", id: "patients", path: "/patients" },
      { icon: ListOrdered, label: "Filas", id: "queues", path: "/queues" },
      { icon: TagIcon, label: "Tags", id: "tags", path: "/tags" },
      { icon: Clock, label: "Follow Up", id: "follow-up", path: "/follow-up" },
    ]
  },
  {
    icon: PieChart, label: "Administrativo", id: "administrativo",
    children: [
      { icon: Calendar, label: "Agendamentos", id: "scheduling", path: "/scheduling" },
      { icon: ClipboardList, label: "Tarefas", id: "tasks", path: "/tasks" },
      { icon: ShoppingCart, label: "Vendas", id: "sales", path: "/sales" },
      { icon: Headphones, label: "Suporte", id: "support", path: "/support" },
      { icon: Users, label: "Equipe", id: "team", path: "/team" },
    ]
  },
];

export const NavigationSidebar = () => {
  const location = useLocation();
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [openSubmenus, setOpenSubmenus] = useState<Set<string>>(new Set());
  const [isHovered, setIsHovered] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { hideFloatingButton } = useMobileMenu();

  // Detect mobile screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close mobile menu when navigating
  useEffect(() => {
    if (isMobile) {
      setIsMobileMenuOpen(false);
    }
  }, [location.pathname, isMobile]);

  // Buscar dados do usuário de team_members (não mais de profiles)
  const { data: currentTeamMember } = useCurrentTeamMember();
  const profile = currentTeamMember as any;

  const { data: stagnatedCount } = useQuery({
    queryKey: ["stagnated-deals-count"],
    queryFn: async () => {
      const { data: deals, error: dealsError } = await supabase
        .from("crm_deals" as any)
        .select("stage_changed_at, updated_at, stage_id");

      if (dealsError) throw dealsError;

      const { data: stages, error: stagesError } = await supabase
        .from("crm_stages" as any)
        .select("id, stagnation_limit_days");

      if (stagesError) throw stagesError;

      const stagesMap = new Map(stages.map((s: any) => [s.id, s.stagnation_limit_days]));

      let count = 0;
      deals.forEach((deal: any) => {
        const limit = stagesMap.get(deal.stage_id);
        if (limit && limit > 0) {
          const lastUpdate = new Date(deal.stage_changed_at || deal.updated_at);
          const daysInStage = differenceInDays(new Date(), lastUpdate);
          const remaining = limit - daysInStage;
          if (remaining <= 3) count++;
        }
      });

      return count;
    },
    refetchInterval: 120000, // Check every 2 minutes (optimized from 1 min)
  });

  const { data: dashboardNotificationsCount } = useQuery({
    queryKey: ["dashboard-notifications-count"],
    queryFn: async () => {
      const { data: notifs, error: notifError } = await supabase
        .from('notifications' as any)
        .select('id');

      if (notifError) throw notifError;

      const { data: dismissals, error: dismissError } = await supabase
        .from('notification_dismissals' as any)
        .select('notification_id')
        .eq('user_id', user?.id);

      if (dismissError) throw dismissError;

      const dismissedIds = new Set(dismissals?.map((d: any) => d.notification_id));
      return notifs?.filter((n: any) => !dismissedIds.has(n.id)).length || 0;
    },
    refetchInterval: 60000, // Check every 1 minute (optimized from 30s)
    enabled: !!user?.id,
  });

  const { data: userRole } = useUserRole();
  const { data: financialAccess } = useFinancialAccess();

  // Check if a path is active
  const isPathActive = (path?: string) => {
    if (!path) return false;
    return location.pathname === path;
  };

  // Check if any child is active
  const hasActiveChild = (item: MenuItem): boolean => {
    if (item.children) {
      return item.children.some(child => isPathActive(child.path));
    }
    return false;
  };

  // Auto-open submenu that has active item when collapsed, close others
  useEffect(() => {
    if (!isHovered) {
      // When collapsed, only keep submenu with active item open
      const newOpen = new Set<string>();
      menuStructure.forEach(item => {
        if (item.children && hasActiveChild(item)) {
          newOpen.add(item.id);
        }
      });
      setOpenSubmenus(newOpen);
    }
  }, [isHovered, location.pathname]);

  const toggleSubmenu = (id: string) => {
    setOpenSubmenus(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleNavClick = (item: MenuItem) => {
    if (item.path) {
      navigate(item.path);
    } else if (item.children) {
      toggleSubmenu(item.id);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  // Badge component - reusable for consistent styling (same as Dashboard)
  const NotificationBadge = ({ count }: { count: number }) => {
    if (!count || count <= 0) return null;
    return (
      <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
        {count > 9 ? "9+" : count}
      </span>
    );
  };

  const renderSubmenuItem = (child: MenuItem) => {
    const ChildIcon = child.icon;
    const isActive = isPathActive(child.path);

    // Hide restricted items
    if (userRole === "agent") {
      if (child.id === "team" || child.id === "ia-config" || child.id === "sales") {
        return null;
      }
    }

    // New: Hide sales for supervisors if access is revoked
    if (userRole === "supervisor" && child.id === "sales" && financialAccess === false) {
      return null;
    }

    // CRM badge - same style as Dashboard
    const crmBadgeCount = child.id === "crm" ? (stagnatedCount || 0) : 0;

    return (
      <button
        key={child.id}
        onClick={() => navigate(child.path!)}
        className={cn(
          "w-full flex items-center gap-3 py-3 transition-all duration-200 relative group/item",
          "text-white/70 hover:text-white hover:bg-[#024a84] dark:hover:bg-[#1E2229]",
          "pl-6 pr-4"
        )}
      >
        {/* Submenu vertical line with light beam effect - flush left */}
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#272C35]">
          {/* Light beam when active */}
          {isActive && (
            <div
              className="absolute inset-0 w-0.5 bg-[#00B0F0]"
              style={{ boxShadow: '0 0 6px 1px rgba(0, 176, 240, 0.5)' }}
            />
          )}
          {/* Light beam on hover */}
          <div
            className="absolute inset-0 w-0.5 bg-[#00B0F0] opacity-0 group-hover/item:opacity-100 transition-opacity"
            style={{ boxShadow: '0 0 6px 1px rgba(0, 176, 240, 0.5)' }}
          />
        </div>

        <div className="relative shrink-0">
          <ChildIcon className={cn(
            "w-[18px] h-[18px] transition-colors",
            isActive && "text-[#00B0F0]"
          )} />
          <NotificationBadge count={crmBadgeCount} />
        </div>

        <span className={cn(
          "whitespace-nowrap text-[15px] font-medium flex-1 text-left transition-opacity duration-300",
          isMobile ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"
        )}>
          {child.label}
        </span>
      </button>
    );
  };

  // IDs that have dedicated AnimatedNavIcon versions
  const ANIMATED_IDS = new Set(["dashboard", "inbox", "crm", "queues-manager", "automacao", "operacoes", "administrativo"]);

  const renderMenuItem = (item: MenuItem) => {
    const Icon = item.icon;
    const isActive = isPathActive(item.path);
    const hasChildren = item.children && item.children.length > 0;
    const isOpen = openSubmenus.has(item.id);
    const hasActiveInChildren = hasActiveChild(item);
    const useAnimated = ANIMATED_IDS.has(item.id);

    // Badge counts - Dashboard gets notifications, CRM gets stagnated count
    const dashboardBadge = item.id === "dashboard" ? (dashboardNotificationsCount || 0) : 0;
    const crmBadge = item.id === "crm" ? (stagnatedCount || 0) : 0;
    const badgeCount = dashboardBadge || crmBadge;
    const isItemActive = isActive || hasActiveInChildren;

    // Only show collapsed submenu icons for submenu with active item
    const showCollapsedSubmenu = hasChildren && hasActiveInChildren;

    return (
      <div key={item.id} className="relative">
        <button
          onClick={() => handleNavClick(item)}
          className={cn(
            "w-full flex items-center gap-3 py-3 transition-all duration-200 relative group/item",
            "text-white/70 hover:text-white",
            isItemActive
              ? "bg-[#024a84]/80 dark:bg-[#22262E] hover:bg-[#024a84] dark:hover:bg-[#22262E]"
              : "hover:bg-[#024a84] dark:hover:bg-[#1E2229]",
            hasChildren && (isOpen || hasActiveInChildren) && "bg-[#024a84] dark:bg-[#22262E]",
            "px-4"
          )}
        >
          {/* Active left accent bar */}
          {isItemActive && (
            <div
              className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[#00B1F2]"
              style={{ boxShadow: "0 0 8px 2px rgba(0,177,242,0.6)" }}
            />
          )}

          <div className="relative shrink-0 ml-1">
            {useAnimated ? (
              <AnimatedNavIcon
                iconId={item.id as any}
                isActive={isItemActive}
                hasUnread={item.id === "inbox" && (badgeCount > 0)}
              />
            ) : (
              <Icon className={cn(
                "w-[18px] h-[18px] transition-colors",
                isItemActive && "text-[#00B0F0]",
                isItemActive && "drop-shadow-[0_0_4px_rgba(0,177,242,0.6)]"
              )} />
            )}
            <NotificationBadge count={badgeCount} />
          </div>

          <span className={cn(
            "whitespace-nowrap text-[15px] font-medium flex-1 text-left transition-opacity duration-300",
            isItemActive && "text-white",
            isMobile ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"
          )}>
            {item.label}
          </span>

          {hasChildren && (
            <ChevronDown className={cn(
              "w-4 h-4 transition-transform",
              isMobile ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100",
              isOpen && "rotate-180"
            )} />
          )}
        </button>

        {/* Expanded Submenu - visible when sidebar expanded and submenu open */}
        {hasChildren && isOpen && (
          <div className={cn(
            "relative",
            isMobile ? "block" : "hidden group-hover/sidebar:block"
          )}>
            {/* Continuous vertical line for all submenu items - flush left */}
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#272C35]" />
            {item.children!.map(child => renderSubmenuItem(child))}
          </div>
        )}

        {/* Collapsed Submenu - only show icons for submenu with active item (desktop only) */}
        {showCollapsedSubmenu && !isMobile && (
          <div className="group-hover/sidebar:hidden flex flex-col">
            {item.children!.map(child => {
              const ChildIcon = child.icon;
              const childIsActive = isPathActive(child.path);

              if (child.id === "team" && userRole === "agent") return null;

              // CRM badge in collapsed mode
              const crmCollapsedBadge = child.id === "crm" ? (stagnatedCount || 0) : 0;

              return (
                <button
                  key={child.id}
                  onClick={() => navigate(child.path!)}
                  className="w-full flex items-center justify-center py-3 transition-all duration-200 hover:bg-[#024a84] dark:hover:bg-[#1E2229]"
                >
                  <div className="relative">
                    <ChildIcon className={cn(
                      "w-[18px] h-[18px] transition-colors text-white/50",
                      childIsActive && "text-[#00B0F0]"
                    )} />
                    <NotificationBadge count={crmCollapsedBadge} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile Floating Button - Only visible on mobile when menu is closed and NOT in chat view */}
      {isMobile && !isMobileMenuOpen && !hideFloatingButton && (
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="fixed bottom-4 left-4 z-[60] w-14 h-14 rounded-full bg-[hsl(var(--sidebar-nav))] shadow-lg flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          style={{ boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)' }}
        >
          <img
            src="/logo-icon.png"
            alt="Menu"
            className="h-8 w-8 object-contain"
          />
        </button>
      )}

      {/* Mobile Overlay - Only visible on mobile when menu is open */}
      {isMobile && isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[55] backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Desktop: normal behavior, Mobile: slide in/out */}
      <div
        className={cn(
          "bg-[hsl(var(--sidebar-nav))] h-screen flex flex-col transition-all duration-300 ease-in-out group/sidebar shadow-xl",
          // Desktop styles
          !isMobile && "w-[60px] hover:w-[260px] z-50",
          // Mobile styles
          isMobile && "fixed top-0 left-0 w-[280px] z-[60]",
          isMobile && (isMobileMenuOpen ? "translate-x-0" : "-translate-x-full")
        )}
        onMouseEnter={() => !isMobile && setIsHovered(true)}
        onMouseLeave={() => !isMobile && setIsHovered(false)}
      >
        {/* Logo Header */}
        <div className="flex items-center justify-center gap-2 px-3 py-2 border-b border-white/10 overflow-hidden">
          {/* Logo icon - always visible */}
          <img
            src="/logo-icon.png"
            alt="Clinvia"
            className="h-10 w-10 object-contain shrink-0"
          />
          {/* Brand name - visible when expanded (desktop hover) or mobile */}
          <img
            src="/clinvia-text-dark.png"
            alt="Clinvia"
            className={cn(
              "h-7 w-auto object-contain",
              isMobile ? "block" : "hidden group-hover/sidebar:block"
            )}
          />
        </div>

        {/* Scrollable Menu Items */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col py-4 scrollbar-none">
          {menuStructure.map(item => renderMenuItem(item))}
        </div>

        {/* Fixed Bottom Section */}
        <div className="flex flex-col py-4 border-t border-white/10">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex items-center gap-3 py-3 px-4 transition-all duration-200 hover:bg-[#024a84] dark:hover:bg-[#1E2229] text-white/70 hover:text-white"
          >
            <div className="shrink-0">
              {theme === "dark" ? (
                <Moon className="w-[18px] h-[18px]" />
              ) : (
                <Sun className="w-[18px] h-[18px]" />
              )}
            </div>
            <span className={cn(
              "whitespace-nowrap transition-opacity duration-300 text-[15px] font-medium",
              isMobile ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"
            )}>
              Alternar Tema
            </span>
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 py-3 px-4 transition-all duration-200 hover:bg-[#024a84] dark:hover:bg-[#1E2229] text-red-500"
          >
            <div className="shrink-0">
              <LogOut className="w-[18px] h-[18px]" />
            </div>
            <span className={cn(
              "whitespace-nowrap transition-opacity duration-300 text-[15px] font-medium",
              isMobile ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"
            )}>
              Sair
            </span>
          </button>

          {/* User Profile & Theme Toggle */}
          <div className="p-4 border-t border-[#1E2229] dark:border-[#272C35]">
            <div className={cn(
              "flex items-center gap-3 transition-all duration-300",
              isMobile ? "" : "justify-center group-hover/sidebar:justify-start"
            )}>
              <div className="relative group/avatar">
                <Avatar className="h-9 w-9 border-2 border-[#1E2229] dark:border-[#272C35] transition-all duration-300 group-hover/avatar:border-[#00B1F2] group-hover/avatar:shadow-[0_0_12px_2px_rgba(0,177,242,0.4)]">
                  <AvatarImage src={currentTeamMember?.profile_pic_url || undefined} />
                  <AvatarFallback className="bg-[#024a84] text-white text-xs">
                    {currentTeamMember?.name?.substring(0, 2).toUpperCase() || "US"}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-[#005FAA] rounded-full animate-gentle-float" />
              </div>

              <div className={cn(
                "flex flex-col overflow-hidden transition-all duration-300",
                isMobile ? "w-auto opacity-100" : "w-0 opacity-0 group-hover/sidebar:w-auto group-hover/sidebar:opacity-100"
              )}>
                <span className="text-sm font-medium text-white/90 truncate max-w-[120px]">
                  {currentTeamMember?.name || "Usuário"}
                </span>
                <span className="text-xs text-white/50 truncate max-w-[120px]">
                  {userRole === 'admin' ? 'Administrador' : 'Atendente'}
                </span>
              </div>

              <div className={cn(
                "ml-auto transition-all duration-200",
                isMobile ? "block" : "hidden group-hover/sidebar:block"
              )}>
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-[#1E2229]/50 transition-colors"
                >
                  {theme === 'dark' ? (
                    <svg
                      width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className="text-yellow-400"
                    >
                      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                      <path d="M19 3v4" className="animate-pulse" />
                      <path d="M21 5h-4" className="animate-pulse" style={{ animationDelay: "0.5s" }} />
                      <path d="m16 8 2-2" style={{ animation: "moon-star-twinkle 2s ease-in-out infinite" }} />
                    </svg>
                  ) : (
                    <svg
                      width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className="text-yellow-400"
                      style={{ animation: "sun-spin 8s linear infinite" }}
                    >
                      <circle cx="12" cy="12" r="4" />
                      <path d="M12 2v2" />
                      <path d="M12 20v2" />
                      <path d="m4.93 4.93 1.41 1.41" />
                      <path d="m17.66 17.66 1.41 1.41" />
                      <path d="M2 12h2" />
                      <path d="M20 12h2" />
                      <path d="m6.34 17.66-1.41 1.41" />
                      <path d="m19.07 4.93-1.41 1.41" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
