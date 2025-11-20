import { LayoutDashboard, MessageSquare, Briefcase, ListOrdered, Users, Settings, Smartphone, LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", id: "dashboard", path: "/" },
  { icon: MessageSquare, label: "Inbox", id: "inbox", path: "/" },
  { icon: Smartphone, label: "WhatsApp", id: "whatsapp", path: "/whatsapp-connection" },
  { icon: Briefcase, label: "CRM", id: "crm", path: "/" },
  { icon: ListOrdered, label: "Filas", id: "queues", path: "/" },
  { icon: Users, label: "Equipe", id: "team", path: "/" },
  { icon: Settings, label: "Configurações", id: "settings", path: "/" },
];

export const NavigationSidebar = () => {
  const [activeItem, setActiveItem] = useState("inbox");
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const handleNavClick = (item: typeof navItems[0]) => {
    setActiveItem(item.id);
    if (item.path) {
      navigate(item.path);
    }
  };

  return (
    <div className="w-[60px] bg-[hsl(var(--sidebar-nav))] h-screen flex flex-col items-center py-4 gap-6">
      <div className="flex flex-col gap-4 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;
          
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => handleNavClick(item)}
                  className={cn(
                    "p-3 rounded-lg transition-all duration-200 hover:bg-white/10",
                    isActive && "bg-primary text-primary-foreground"
                  )}
                >
                  <Icon className="w-5 h-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{item.label}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      
      <div className="flex flex-col gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={signOut}
              className="p-3 rounded-lg transition-all duration-200 hover:bg-white/10 text-red-500"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Sair</p>
          </TooltipContent>
        </Tooltip>
        
        <Avatar className="w-10 h-10">
          <AvatarImage src="https://avatar.vercel.sh/agent" />
          <AvatarFallback>{user?.email?.[0].toUpperCase() || "U"}</AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
};
