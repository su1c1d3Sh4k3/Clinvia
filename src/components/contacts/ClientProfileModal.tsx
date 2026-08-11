import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ClientSidebar } from "./ClientSidebar";
import { CadastroTab } from "./tabs/CadastroTab";
import { VendasTab } from "./tabs/VendasTab";
import { ProcedimentosTab } from "./tabs/ProcedimentosTab";
import { AgendamentosTab } from "./tabs/AgendamentosTab";
import { AtendimentosTab } from "./tabs/AtendimentosTab";
import { HistoricoTab } from "./tabs/HistoricoTab";
import { AvaliacaoTab } from "./tabs/AvaliacaoTab";
import { ResumosTab } from "./tabs/ResumosTab";
import { NegociacoesTab } from "./tabs/NegociacoesTab";

interface ClientProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: any | null;
}

export const ClientProfileModal = ({
  open,
  onOpenChange,
  contact,
}: ClientProfileModalProps) => {
  // Resolve vínculo Instagram ↔ WhatsApp: se o contato (IG) tem linked_contact_id,
  // o contato WhatsApp "mestre" fornece os dados do perfil; conversas dos contatos
  // IG vinculados entram junto (contactIds).
  const { data: linkData } = useQuery({
    queryKey: ["client-link", contact?.id],
    enabled: !!contact?.id,
    queryFn: async () => {
      const { data: fresh } = await supabase
        .from("contacts")
        .select("*")
        .eq("id", contact.id)
        .single();
      if (!fresh) return null;
      let master: any = fresh;
      if ((fresh as any).linked_contact_id) {
        const { data: m } = await supabase
          .from("contacts")
          .select("*")
          .eq("id", (fresh as any).linked_contact_id)
          .single();
        if (m) master = m;
      }
      const { data: satellites } = await (supabase.from("contacts") as any)
        .select("id")
        .eq("linked_contact_id", master.id);
      return {
        source: fresh as any,
        master,
        satelliteIds: ((satellites || []) as any[]).map((s) => s.id),
      };
    },
  });

  if (!contact) return null;

  const effectiveContact = linkData?.master ?? contact;
  const contactIds = linkData
    ? Array.from(new Set([linkData.master.id, ...linkData.satelliteIds]))
    : [contact.id];
  const sourceContact = linkData?.source ?? contact;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-full max-w-6xl h-[90vh] p-0 gap-0 overflow-hidden flex flex-col rounded-lg">
        <DialogTitle className="px-5 py-3 border-b bg-muted/30 text-base font-semibold truncate shrink-0">
          {effectiveContact.push_name || "Cliente"}
        </DialogTitle>

        {/* Body: 2 columns */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Main content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <Tabs defaultValue="cadastro" className="flex flex-col flex-1 overflow-hidden">
              <div className="px-3 sm:px-5 pt-3 border-b">
                <TabsList className="flex md:justify-between w-full h-auto overflow-x-auto flex-nowrap justify-start [scrollbar-width:thin]">
                  <TabsTrigger value="cadastro" className="md:flex-1 shrink-0 px-3 text-xs py-2">Cadastro</TabsTrigger>
                  <TabsTrigger value="vendas" className="md:flex-1 shrink-0 px-3 text-xs py-2">Vendas</TabsTrigger>
                  <TabsTrigger value="procedimentos" className="md:flex-1 shrink-0 px-3 text-xs py-2">Procedimentos</TabsTrigger>
                  <TabsTrigger value="agendamentos" className="md:flex-1 shrink-0 px-3 text-xs py-2">Agendamentos</TabsTrigger>
                  <TabsTrigger value="atendimentos" className="md:flex-1 shrink-0 px-3 text-xs py-2">Atendimentos</TabsTrigger>
                  <TabsTrigger value="historico" className="md:flex-1 shrink-0 px-3 text-xs py-2">Histórico</TabsTrigger>
                  <TabsTrigger value="avaliacao" className="md:flex-1 shrink-0 px-3 text-xs py-2">Avaliação</TabsTrigger>
                  <TabsTrigger value="resumos" className="md:flex-1 shrink-0 px-3 text-xs py-2">Resumos</TabsTrigger>
                  <TabsTrigger value="negociacoes" className="md:flex-1 shrink-0 px-3 text-xs py-2">Negociações</TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="flex-1 px-3 sm:px-5 py-4 [&_[data-radix-scroll-area-viewport]>div]:!block">
                <TabsContent value="cadastro" className="mt-0"><CadastroTab contact={effectiveContact} /></TabsContent>
                <TabsContent value="vendas" className="mt-0"><VendasTab contactId={effectiveContact.id} /></TabsContent>
                <TabsContent value="procedimentos" className="mt-0"><ProcedimentosTab contactId={effectiveContact.id} /></TabsContent>
                <TabsContent value="agendamentos" className="mt-0"><AgendamentosTab contactId={effectiveContact.id} /></TabsContent>
                <TabsContent value="atendimentos" className="mt-0"><AtendimentosTab contactId={effectiveContact.id} contactIds={contactIds} /></TabsContent>
                <TabsContent value="historico" className="mt-0"><HistoricoTab contactId={effectiveContact.id} /></TabsContent>
                <TabsContent value="avaliacao" className="mt-0"><AvaliacaoTab contact={effectiveContact} /></TabsContent>
                <TabsContent value="resumos" className="mt-0"><ResumosTab contact={effectiveContact} contactIds={contactIds} /></TabsContent>
                <TabsContent value="negociacoes" className="mt-0"><NegociacoesTab contactId={effectiveContact.id} /></TabsContent>
              </ScrollArea>
            </Tabs>
          </div>

          {/* Right: Sidebar */}
          <div className="hidden md:block border-l">
            <ScrollArea className="h-full">
              <div className="p-4">
                <ClientSidebar contact={effectiveContact} sourceContact={sourceContact} contactIds={contactIds} />
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
