import {
  Users, Settings, LayoutDashboard, MessageSquare, Briefcase,
  Smartphone, LogOut, BookUser, Calendar, Repeat,
  Package, Bot, ChevronDown, FileText
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
import { usePermissions } from "@/hooks/usePermissions";
import { differenceInDays } from "date-fns";
import { useState, useEffect } from "react";
import { useMobileMenu } from "@/contexts/MobileMenuContext";
import { AnimatedNavIcon } from "@/components/AnimatedNavIcon";
import { FaWhatsapp, FaInstagram } from "react-icons/fa";

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
  { icon: Briefcase, label: "CRM", id: "crm", path: "/crm" },
  { icon: Package, label: "Serviços", id: "products-services", path: "/products-services" },
  { icon: BookUser, label: "Clientes", id: "contacts", path: "/contacts" },
  { icon: Calendar, label: "Agenda", id: "scheduling", path: "/scheduling" },
  { icon: Repeat, label: "Recorrência", id: "recurrence", path: "/recurrence" },
  {
    icon: Settings, label: "Configurações", id: "config",
    children: [
      { icon: Bot, label: "IA", id: "ia-config", path: "/ia-config" },
      { icon: Smartphone, label: "Conexões", id: "whatsapp", path: "/whatsapp-connection" },
      { icon: FileText, label: "Templates", id: "templates", path: "/templates" },
      { icon: Settings, label: "Sistema", id: "settings", path: "/settings" },
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

  const { data: currentTeamMember } = useCurrentTeamMember();

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
    refetchInterval: 120000,
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
    refetchInterval: 60000,
    enabled: !!user?.id,
  });

  // Fetch connected instances for footer status
  const { data: whatsappInstances } = useQuery({
    queryKey: ["instances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instances")
        .select("id, name, status")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: instagramInstances } = useQuery({
    queryKey: ["instagram-instances"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instagram_instances" as any)
        .select("id, name, status")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: userRole } = useUserRole();
  const { hasAnyAccess } = usePermissions();

  const isPathActive = (path?: string) => {
    if (!path) return false;
    return location.pathname === path;
  };

  const hasActiveChild = (item: MenuItem): boolean => {
    if (item.children) {
      return item.children.some(child => isPathActive(child.path));
    }
    return false;
  };

  useEffect(() => {
    if (!isHovered) {
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

  const NotificationBadge = ({ count }: { count: number }) => {
    if (!count || count <= 0) return null;
    return (
      <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 text-[7px] font-bold text-white">
        {count > 9 ? "9+" : count}
      </span>
    );
  };

  const renderSubmenuItem = (child: MenuItem) => {
    const ChildIcon = child.icon;
    const isActive = isPathActive(child.path);

    if (userRole !== "admin") {
      if (child.id === "ia-config" && !hasAnyAccess('ia_config')) return null;
    }

    const crmBadgeCount = child.id === "crm" ? (stagnatedCount || 0) : 0;

    return (
      <button
        key={child.id}
        onClick={() => navigate(child.path!)}
        className={cn(
          "w-full flex items-center gap-2.5 py-2.5 transition-all duration-200 relative group/item",
          "text-sidebar-foreground/70 dark:text-white/70 hover:text-sidebar-foreground dark:hover:text-white hover:bg-sidebar-accent dark:hover:bg-[#1E2229]",
          "pl-6 pr-4"
        )}
      >
        <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-sidebar-border dark:bg-[#272C35]">
          {isActive && (
            <div
              className="absolute inset-0 w-0.5 bg-primary"
              style={{ boxShadow: '0 0 6px 1px hsl(var(--primary) / 0.5)' }}
            />
          )}
          <div
            className="absolute inset-0 w-0.5 bg-primary opacity-0 group-hover/item:opacity-100 transition-opacity"
            style={{ boxShadow: '0 0 6px 1px hsl(var(--primary) / 0.5)' }}
          />
        </div>

        <div className="relative shrink-0">
          <ChildIcon className={cn(
            "w-[14px] h-[14px] transition-colors",
            isActive && "text-primary"
          )} />
          <NotificationBadge count={crmBadgeCount} />
        </div>

        <span className={cn(
          "whitespace-nowrap text-[12px] font-medium flex-1 text-left transition-opacity duration-300",
          isMobile ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"
        )}>
          {child.label}
        </span>
      </button>
    );
  };

  const ANIMATED_IDS = new Set(["dashboard", "inbox", "crm"]);

  const renderMenuItem = (item: MenuItem) => {
    const Icon = item.icon;
    const isActive = isPathActive(item.path);
    const hasChildren = item.children && item.children.length > 0;
    const isOpen = openSubmenus.has(item.id);
    const hasActiveInChildren = hasActiveChild(item);
    const useAnimated = ANIMATED_IDS.has(item.id);

    const dashboardBadge = item.id === "dashboard" ? (dashboardNotificationsCount || 0) : 0;
    const crmBadge = item.id === "crm" ? (stagnatedCount || 0) : 0;
    const badgeCount = dashboardBadge || crmBadge;
    const isItemActive = isActive || hasActiveInChildren;

    const showCollapsedSubmenu = hasChildren && hasActiveInChildren;

    return (
      <div key={item.id} className="relative">
        <button
          onClick={() => handleNavClick(item)}
          className={cn(
            "w-full flex items-center gap-2.5 py-2.5 transition-all duration-200 relative group/item",
            "text-sidebar-foreground/70 dark:text-white/70 hover:text-sidebar-foreground dark:hover:text-white",
            isItemActive
              ? "bg-sidebar-accent dark:bg-[#22262E] hover:bg-sidebar-accent dark:hover:bg-[#22262E]"
              : "hover:bg-sidebar-accent dark:hover:bg-[#1E2229]",
            hasChildren && (isOpen || hasActiveInChildren) && "bg-sidebar-accent dark:bg-[#22262E]",
            "px-4"
          )}
        >
          {isItemActive && (
            <div
              className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-primary"
              style={{ boxShadow: "0 0 8px 2px hsl(var(--primary) / 0.6)" }}
            />
          )}

          <div className="relative shrink-0 ml-1">
            {useAnimated ? (
              <AnimatedNavIcon
                iconId={item.id as any}
                isActive={isItemActive}
                hasUnread={item.id === "inbox" && (badgeCount > 0)}
                className="w-[14px] h-[14px]"
              />
            ) : (
              <Icon className={cn(
                "w-[14px] h-[14px] transition-colors",
                isItemActive && "text-primary",
                isItemActive && "drop-shadow-[0_0_4px_hsl(var(--primary)/0.6)]"
              )} />
            )}
            <NotificationBadge count={badgeCount} />
          </div>

          <span className={cn(
            "whitespace-nowrap text-[12px] font-medium flex-1 text-left transition-opacity duration-300",
            isItemActive && "text-sidebar-foreground dark:text-white",
            isMobile ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"
          )}>
            {item.label}
          </span>

          {hasChildren && (
            <ChevronDown className={cn(
              "w-3 h-3 transition-transform",
              isMobile ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100",
              isOpen && "rotate-180"
            )} />
          )}
        </button>

        {hasChildren && isOpen && (
          <div className={cn(
            "relative",
            isMobile ? "block" : "hidden group-hover/sidebar:block"
          )}>
            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-sidebar-border dark:bg-[#272C35]" />
            {item.children!.map(child => renderSubmenuItem(child))}
          </div>
        )}

        {showCollapsedSubmenu && !isMobile && (
          <div className="group-hover/sidebar:hidden flex flex-col">
            {item.children!.map(child => {
              const ChildIcon = child.icon;
              const childIsActive = isPathActive(child.path);

              if (userRole !== "admin") {
                if (child.id === "ia-config" && !hasAnyAccess('ia_config')) return null;
              }

              const crmCollapsedBadge = child.id === "crm" ? (stagnatedCount || 0) : 0;

              return (
                <button
                  key={child.id}
                  onClick={() => navigate(child.path!)}
                  className="w-full flex items-center justify-center py-2.5 transition-all duration-200 hover:bg-sidebar-accent dark:hover:bg-[#1E2229]"
                >
                  <div className="relative">
                    <ChildIcon className={cn(
                      "w-[14px] h-[14px] transition-colors text-sidebar-foreground/50 dark:text-white/50",
                      childIsActive && "text-primary"
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

  // Combine all instances for status display
  const allInstances = [
    ...(whatsappInstances || []).map((i: any) => ({ ...i, type: 'whatsapp' })),
    ...(instagramInstances || []).map((i: any) => ({ ...i, type: 'instagram' })),
  ];

  return (
    <>
      {/* Mobile Floating Button */}
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

      {/* Mobile Overlay */}
      {isMobile && isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[55] backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={cn(
          "bg-[hsl(var(--sidebar-nav))] flex flex-col transition-all duration-300 ease-in-out group/sidebar shadow-xl",
          !isMobile && "h-full w-[60px] hover:w-[240px] z-50",
          isMobile && "fixed top-0 left-0 h-screen w-[260px] z-[60]",
          isMobile && (isMobileMenuOpen ? "translate-x-0" : "-translate-x-full")
        )}
        onMouseEnter={() => !isMobile && setIsHovered(true)}
        onMouseLeave={() => !isMobile && setIsHovered(false)}
      >
        {/* Logo Header */}
        <div className="flex items-center justify-center gap-2 px-3 py-2 border-b border-sidebar-border dark:border-white/10 overflow-hidden">
          <img
            src="/logo-icon.png"
            alt="Clinvia"
            className="h-8 w-8 object-contain shrink-0"
          />
          <img
            src="/clinvia-text-dark.png"
            alt="Clinvia"
            className={cn(
              "h-6 w-auto object-contain",
              isMobile ? "block" : "hidden group-hover/sidebar:block"
            )}
          />
        </div>

        {/* Scrollable Menu Items */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col py-3 scrollbar-none">
          {menuStructure.map(item => renderMenuItem(item))}
        </div>

        {/* Fixed Bottom Section */}
        <div className="flex flex-col border-t border-sidebar-border dark:border-white/10">
          {/* Instance Status Section */}
          {allInstances.length > 0 && (
            <div className={cn(
              "px-3 py-2 space-y-1",
              isMobile ? "block" : "hidden group-hover/sidebar:block"
            )}>
              <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/40 dark:text-white/40 font-semibold">
                Conexões
              </span>
              {allInstances.map((instance: any) => {
                const isConnected = instance.status === 'connected';
                return (
                  <div key={`${instance.type}-${instance.id}`} className="flex items-center gap-2 py-0.5">
                    {instance.type === 'whatsapp' ? (
                      <FaWhatsapp className={cn(
                        "w-3 h-3 shrink-0",
                        isConnected ? "text-green-500" : "text-red-400"
                      )} />
                    ) : (
                      <FaInstagram className={cn(
                        "w-3 h-3 shrink-0",
                        isConnected ? "text-pink-500" : "text-red-400"
                      )} />
                    )}
                    <span className="text-[10px] text-sidebar-foreground/70 dark:text-white/70 truncate flex-1">
                      {instance.name}
                    </span>
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      isConnected ? "bg-green-500" : "bg-red-400"
                    )} />
                  </div>
                );
              })}
            </div>
          )}

          {/* Collapsed instance indicators (desktop only) */}
          {allInstances.length > 0 && !isMobile && (
            <div className="group-hover/sidebar:hidden flex flex-col items-center py-2 gap-1">
              {allInstances.map((instance: any) => {
                const isConnected = instance.status === 'connected';
                return (
                  <div key={`collapsed-${instance.type}-${instance.id}`} className="relative">
                    {instance.type === 'whatsapp' ? (
                      <FaWhatsapp className={cn(
                        "w-3 h-3",
                        isConnected ? "text-green-500" : "text-red-400"
                      )} />
                    ) : (
                      <FaInstagram className={cn(
                        "w-3 h-3",
                        isConnected ? "text-pink-500" : "text-red-400"
                      )} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 py-2.5 px-4 transition-all duration-200 hover:bg-sidebar-accent dark:hover:bg-[#1E2229] text-red-500"
          >
            <div className="shrink-0">
              <LogOut className="w-[14px] h-[14px]" />
            </div>
            <span className={cn(
              "whitespace-nowrap transition-opacity duration-300 text-[12px] font-medium",
              isMobile ? "opacity-100" : "opacity-0 group-hover/sidebar:opacity-100"
            )}>
              Sair
            </span>
          </button>

          {/* User Profile & Theme Toggle */}
          <div className="p-3 border-t border-sidebar-border dark:border-[#272C35]">
            <div className={cn(
              "flex items-center gap-2.5 transition-all duration-300",
              isMobile ? "" : "justify-center group-hover/sidebar:justify-start"
            )}>
              <div className="relative group/avatar">
                <Avatar className="h-8 w-8 border-2 border-sidebar-border dark:border-[#272C35] transition-all duration-300 group-hover/avatar:border-primary group-hover/avatar:shadow-[0_0_12px_2px_hsl(var(--primary)/0.4)]">
                  <AvatarImage src={currentTeamMember?.profile_pic_url || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
                    {currentTeamMember?.name?.substring(0, 2).toUpperCase() || "US"}
                  </AvatarFallback>
                </Avatar>
                <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 border-2 border-sidebar dark:border-[#005FAA] rounded-full animate-gentle-float" />
              </div>

              <div className={cn(
                "flex flex-col overflow-hidden transition-all duration-300",
                isMobile ? "w-auto opacity-100" : "w-0 opacity-0 group-hover/sidebar:w-auto group-hover/sidebar:opacity-100"
              )}>
                <span className="text-[11px] font-medium text-sidebar-foreground/90 dark:text-white/90 truncate max-w-[100px]">
                  {currentTeamMember?.name || "Usuário"}
                </span>
                <span className="text-[10px] text-sidebar-foreground/50 dark:text-white/50 truncate max-w-[100px]">
                  {userRole === 'admin' ? 'Administrador' : userRole === 'supervisor' ? 'Supervisor' : 'Atendente'}
                </span>
              </div>

              <div className={cn(
                "ml-auto transition-all duration-200",
                isMobile ? "block" : "hidden group-hover/sidebar:block"
              )}>
                <button
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="p-1 rounded-lg text-sidebar-foreground/70 dark:text-white/70 hover:text-sidebar-foreground dark:hover:text-white hover:bg-sidebar-accent dark:hover:bg-[#1E2229]/50 transition-colors"
                >
                  {theme === 'dark' ? (
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      className="text-yellow-400"
                    >
                      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                      <path d="M19 3v4" className="animate-pulse" />
                      <path d="M21 5h-4" className="animate-pulse" style={{ animationDelay: "0.5s" }} />
                      <path d="m16 8 2-2" style={{ animation: "moon-star-twinkle 2s ease-in-out infinite" }} />
                    </svg>
                  ) : (
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
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
