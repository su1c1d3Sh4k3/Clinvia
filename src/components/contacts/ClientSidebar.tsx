import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Phone, Mail, CreditCard, User, Calendar, MessageSquare,
  Star, Ticket, ListFilter, Link2, Unlink, Instagram,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { STAGE_COLORS, CrmStage } from "@/types/crm-client";
import { npsAverage } from "@/lib/nps";
import { toast } from "sonner";
import { LinkInstagramContactDialog } from "./LinkInstagramContactDialog";

interface ClientSidebarProps {
  contact: any;
  /** Contato pelo qual o modal foi aberto (pode ser o IG antes da resolução do vínculo) */
  sourceContact?: any;
  /** Todos os ids de contato do cliente (mestre + IGs vinculados) */
  contactIds?: string[];
}

export const ClientSidebar = ({ contact, sourceContact, contactIds }: ClientSidebarProps) => {
  const queryClient = useQueryClient();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const source = sourceContact ?? contact;
  const ids = contactIds && contactIds.length > 0 ? contactIds : [contact.id];
  const isInstagramSource =
    source?.channel === "instagram" || source?.number?.startsWith("instagram:");
  const isLinked = !!source?.linked_contact_id;

  const handleUnlink = async () => {
    setUnlinking(true);
    try {
      const { error } = await (supabase.from("contacts") as any)
        .update({ linked_contact_id: null })
        .eq("id", source.id);
      if (error) throw error;
      toast.success("Vínculo removido");
      queryClient.invalidateQueries({ queryKey: ["client-link"] });
    } catch (err: any) {
      toast.error("Erro ao desvincular: " + err.message);
    } finally {
      setUnlinking(false);
    }
  };
  // Active CRM deal
  const { data: crmClient } = useQuery({
    queryKey: ["crm-client-active", contact.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_client" as any)
        .select("stage")
        .eq("contact_id", contact.id)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data as { stage: CrmStage } | null;
    },
  });

  // Last open conversation (ticket info + queue + responsible)
  const { data: lastConversation } = useQuery({
    queryKey: ["client-last-conversation", ids],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, status, queue_id, assigned_agent_id, updated_at")
        .in("contact_id", ids)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Ticket count
  const { data: ticketCount } = useQuery({
    queryKey: ["client-ticket-count", ids],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .in("contact_id", ids);
      if (error) throw error;
      return count || 0;
    },
  });

  // Queue name
  const { data: queueName } = useQuery({
    queryKey: ["queue-name", lastConversation?.queue_id],
    enabled: !!lastConversation?.queue_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("queues")
        .select("name")
        .eq("id", lastConversation!.queue_id)
        .single();
      if (error) throw error;
      return data?.name || "—";
    },
  });

  // Responsible agent name
  const { data: responsibleName } = useQuery({
    queryKey: ["agent-name", lastConversation?.assigned_agent_id],
    enabled: !!lastConversation?.assigned_agent_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members" as any)
        .select("name")
        .eq("auth_user_id", lastConversation!.assigned_agent_id)
        .maybeSingle();
      if (error) throw error;
      return (data as any)?.name || "—";
    },
  });

  // Last appointment
  const { data: lastAppointment } = useQuery({
    queryKey: ["client-last-appointment", contact.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("start_time")
        .eq("contact_id", contact.id)
        .order("start_time", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Satisfaction index (average NPS)
  const npsArray = contact.nps as any[] | null;
  const npsAvg = npsArray && npsArray.length > 0 ? npsAverage(npsArray) : null;
  const satisfactionIndex = npsAvg != null ? npsAvg.toFixed(1) : null;

  const hasOpenTicket = ["open", "pending"].includes(lastConversation?.status ?? "");

  const InfoRow = ({ icon: Icon, label, value, className }: { icon: any; label: string; value: string; className?: string }) => (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground leading-none mb-0.5">{label}</p>
        <p className={`text-xs truncate ${className || ""}`}>{value}</p>
      </div>
    </div>
  );

  return (
    <div className="w-[240px] shrink-0 border-l pl-4 space-y-4 overflow-y-auto">
      {/* Avatar + Name */}
      <div className="flex flex-col items-center text-center gap-2 pb-3 border-b">
        <Avatar className="h-16 w-16 border-2">
          <AvatarImage src={contact.profile_pic_url} />
          <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
            {(contact.push_name || "?")[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold text-sm">{contact.push_name || "Sem nome"}</p>
          <p className="text-xs text-muted-foreground">{contact.phone || contact.number || "—"}</p>
        </div>

        {isInstagramSource && !isLinked && (
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-1.5 text-xs h-7"
            onClick={() => setLinkDialogOpen(true)}
          >
            <Link2 className="w-3.5 h-3.5" />
            Atribuir Instagram a Cliente
          </Button>
        )}

        {isInstagramSource && isLinked && (
          <div className="w-full space-y-1">
            <Badge variant="secondary" className="w-full justify-center gap-1 text-[10px] font-normal">
              <Instagram className="w-3 h-3" />
              Instagram vinculado a {contact.push_name || "cliente"}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              disabled={unlinking}
              className="w-full gap-1.5 text-xs h-6 text-muted-foreground"
              onClick={handleUnlink}
            >
              <Unlink className="w-3 h-3" />
              Desvincular
            </Button>
          </div>
        )}
      </div>

      <LinkInstagramContactDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        igContact={source}
      />

      {/* Info rows */}
      <div className="space-y-0.5">
        <InfoRow
          icon={ListFilter}
          label="Etapa CRM"
          value={crmClient?.stage || "Nenhuma negociação atribuída"}
          className={crmClient ? "font-medium" : "text-muted-foreground italic"}
        />

        <InfoRow
          icon={Ticket}
          label="Tickets"
          value={ticketCount ? `${ticketCount} ticket${ticketCount !== 1 ? "s" : ""}` : "Sem tickets no momento"}
          className={!ticketCount ? "text-muted-foreground italic" : ""}
        />

        <InfoRow
          icon={ListFilter}
          label="Fila"
          value={hasOpenTicket && queueName ? queueName : "Sem tickets no momento"}
          className={!hasOpenTicket ? "text-muted-foreground italic" : ""}
        />

        <InfoRow
          icon={Mail}
          label="Email"
          value={contact.email || "—"}
        />

        <InfoRow
          icon={CreditCard}
          label="CPF"
          value={contact.cpf || "—"}
        />

        <InfoRow
          icon={User}
          label="Responsável"
          value={hasOpenTicket && responsibleName ? responsibleName : "—"}
        />

        <InfoRow
          icon={Calendar}
          label="Último agendamento"
          value={
            lastAppointment?.start_time
              ? format(new Date(lastAppointment.start_time), "dd/MM/yyyy", { locale: ptBR })
              : "—"
          }
        />

        <InfoRow
          icon={MessageSquare}
          label="Último contato"
          value={
            lastConversation?.updated_at
              ? format(new Date(lastConversation.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
              : "—"
          }
        />

        <InfoRow
          icon={Star}
          label="Satisfação (NPS)"
          value={satisfactionIndex ? `${satisfactionIndex} / 5` : "Sem avaliações"}
          className={satisfactionIndex ? "font-medium" : "text-muted-foreground italic"}
        />
      </div>
    </div>
  );
};
