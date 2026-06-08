import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X } from "lucide-react";
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
  if (!contact) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Perfil do Cliente</DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
          <h2 className="text-base font-semibold truncate">
            {contact.push_name || "Cliente"}
          </h2>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-full p-1 hover:bg-accent transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: 2 columns */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Main content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <Tabs defaultValue="cadastro" className="flex flex-col flex-1 overflow-hidden">
              <div className="px-5 pt-3 border-b">
                <TabsList className="h-auto flex flex-wrap gap-1 bg-transparent p-0">
                  <TabsTrigger value="cadastro" className="text-xs px-3 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md">Cadastro</TabsTrigger>
                  <TabsTrigger value="vendas" className="text-xs px-3 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md">Vendas</TabsTrigger>
                  <TabsTrigger value="procedimentos" className="text-xs px-3 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md">Procedimentos</TabsTrigger>
                  <TabsTrigger value="agendamentos" className="text-xs px-3 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md">Agendamentos</TabsTrigger>
                  <TabsTrigger value="atendimentos" className="text-xs px-3 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md">Atendimentos</TabsTrigger>
                  <TabsTrigger value="historico" className="text-xs px-3 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md">Histórico</TabsTrigger>
                  <TabsTrigger value="avaliacao" className="text-xs px-3 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md">Avaliação</TabsTrigger>
                  <TabsTrigger value="resumos" className="text-xs px-3 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md">Resumos</TabsTrigger>
                  <TabsTrigger value="negociacoes" className="text-xs px-3 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-md">Negociações</TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="flex-1 px-5 py-4">
                <TabsContent value="cadastro" className="mt-0"><CadastroTab contact={contact} /></TabsContent>
                <TabsContent value="vendas" className="mt-0"><VendasTab contactId={contact.id} /></TabsContent>
                <TabsContent value="procedimentos" className="mt-0"><ProcedimentosTab contactId={contact.id} /></TabsContent>
                <TabsContent value="agendamentos" className="mt-0"><AgendamentosTab contactId={contact.id} /></TabsContent>
                <TabsContent value="atendimentos" className="mt-0"><AtendimentosTab contactId={contact.id} /></TabsContent>
                <TabsContent value="historico" className="mt-0"><HistoricoTab contactId={contact.id} /></TabsContent>
                <TabsContent value="avaliacao" className="mt-0"><AvaliacaoTab contact={contact} /></TabsContent>
                <TabsContent value="resumos" className="mt-0"><ResumosTab contact={contact} /></TabsContent>
                <TabsContent value="negociacoes" className="mt-0"><NegociacoesTab /></TabsContent>
              </ScrollArea>
            </Tabs>
          </div>

          {/* Right: Sidebar */}
          <div className="hidden md:block border-l">
            <ScrollArea className="h-full">
              <div className="p-4">
                <ClientSidebar contact={contact} />
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
