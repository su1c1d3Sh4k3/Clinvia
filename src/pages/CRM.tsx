import { useState } from "react";
import { NewKanbanBoard } from "@/components/crm/NewKanbanBoard";
import { NewCreateDealModal } from "@/components/crm/NewCreateDealModal";
import { ClientProfileModal } from "@/components/contacts/ClientProfileModal";
import { CrmClient } from "@/types/crm-client";
import { useSuporteTour } from "@/lib/suporteTours";

const CRM = () => {
  const [selectedClient, setSelectedClient] = useState<CrmClient | null>(null);
  useSuporteTour();

  return (
    <div className="px-3 md:px-6 pt-4 md:pt-6 h-screen flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4 md:mb-6 flex-shrink-0">
        <h1 data-tour="crm-title" className="text-xl md:text-2xl font-bold text-[#005AA8] dark:text-white">CRM</h1>
        <div data-tour="crm-new-deal">
          <NewCreateDealModal />
        </div>
      </div>

      <div data-tour="crm-board" className="flex-1 min-h-0 flex flex-col">
        <NewKanbanBoard onCardClick={(client) => setSelectedClient(client)} />
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
