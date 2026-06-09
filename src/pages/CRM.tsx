import { useState } from "react";
import { NewKanbanBoard } from "@/components/crm/NewKanbanBoard";
import { NewCreateDealModal } from "@/components/crm/NewCreateDealModal";
import { ClientProfileModal } from "@/components/contacts/ClientProfileModal";
import { CrmClient } from "@/types/crm-client";

const CRM = () => {
  const [selectedClient, setSelectedClient] = useState<CrmClient | null>(null);

  return (
    <div className="px-3 md:px-6 pt-4 md:pt-6 h-screen flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4 md:mb-6 flex-shrink-0">
        <h1 className="text-xl md:text-2xl font-bold text-[#005AA8] dark:text-white">CRM</h1>
        <NewCreateDealModal />
      </div>

      <NewKanbanBoard onCardClick={(client) => setSelectedClient(client)} />

      <ClientProfileModal
        open={!!selectedClient}
        onOpenChange={(o) => !o && setSelectedClient(null)}
        contact={selectedClient?.contact || null}
      />
    </div>
  );
};

export default CRM;
