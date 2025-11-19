import { LayoutDashboard, MessageSquare, Briefcase, ListOrdered, Users, Settings } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
  { icon: MessageSquare, label: "Inbox", id: "inbox" },
  { icon: Briefcase, label: "CRM", id: "crm" },
  { icon: ListOrdered, label: "Filas", id: "queues" },
  { icon: Users, label: "Equipe", id: "team" },
  { icon: Settings, label: "Configurações", id: "settings" },
];

export const NavigationSidebar = () => {
  const [activeItem, setActiveItem] = useState("inbox");

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
                  onClick={() => setActiveItem(item.id)}
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
      
      <Avatar className="w-10 h-10">
        <AvatarImage src="https://avatar.vercel.sh/agent" />
        <AvatarFallback>AG</AvatarFallback>
      </Avatar>
    </div>
  );
};
