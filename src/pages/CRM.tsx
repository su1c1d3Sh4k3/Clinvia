import { useState } from "react";
import { NewKanbanBoard } from "@/components/crm/NewKanbanBoard";
import { NewCreateDealModal } from "@/components/crm/NewCreateDealModal";
import { ClientProfileModal } from "@/components/contacts/ClientProfileModal";
import { CrmClient } from "@/types/crm-client";
import { useSuporteTour } from "@/lib/suporteTours";
import { useCrmChannels } from "@/hooks/useCrmChannels";
import { useUrlTab } from "@/hooks/useUrlTab";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Instagram, MessageCircle } from "lucide-react";

const CRM = () => {
  const [selectedClient, setSelectedClient] = useState<CrmClient | null>(null);
  const { data: channels } = useCrmChannels();
  const [tab, setTab] = useUrlTab("todos");
  useSuporteTour();

  const list = channels || [];
  // 1 conexão só = funil único, barra de abas é ruído
  const showTabs = list.length > 1;
  const active = showTabs ? list.find((c) => c.id === tab) || null : null;

  return (
    <div className="px-3 md:px-6 pt-4 md:pt-6 h-screen flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4 md:mb-6 flex-shrink-0">
        <h1 data-tour="crm-title" className="text-xl md:text-2xl font-bold text-[#005AA8] dark:text-white">CRM</h1>
        <div data-tour="crm-new-deal">
          <NewCreateDealModal defaultChannelId={active?.id} />
        </div>
      </div>

      {showTabs && (
        <Tabs value={active ? active.id : "todos"} onValueChange={setTab} className="mb-3 shrink-0">
          <TabsList data-tour="crm-tabs" className="overflow-x-auto flex-nowrap max-w-full justify-start">
            <TabsTrigger value="todos" className="shrink-0">Todos</TabsTrigger>
            {list.map((c) => (
              <TabsTrigger key={c.id} value={c.id} className="shrink-0 gap-1.5">
                {c.kind === "ig" ? (
                  <Instagram className="w-3.5 h-3.5" />
                ) : (
                  <MessageCircle className="w-3.5 h-3.5" />
                )}
                {c.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <div data-tour="crm-board" className="flex-1 min-h-0 flex flex-col">
        <NewKanbanBoard
          channel={active}
          showChannelBadge={showTabs && !active}
          onCardClick={(client) => setSelectedClient(client)}
        />
      </div>

      <ClientProfileModal
        open={!!selectedClient}
        onOpenChange={(o) => !o && setSelectedClient(null)}
        contact={selectedClient?.contact || null}
      />
    </div>
  );
};

export default CRM;
