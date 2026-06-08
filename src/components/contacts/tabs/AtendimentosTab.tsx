import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, MessageSquare, Eye } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AtendimentosTabProps {
  contactId: string;
}

export const AtendimentosTab = ({ contactId }: AtendimentosTabProps) => {
  const [viewConvId, setViewConvId] = useState<string | null>(null);

  const { data: conversations, isLoading } = useQuery({
    queryKey: ["client-conversations", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, status, summary, created_at, updated_at, queue_id")
        .eq("contact_id", contactId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  // Messages for selected conversation
  const { data: messages, isLoading: loadingMessages } = useQuery({
    queryKey: ["conversation-messages", viewConvId],
    enabled: !!viewConvId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, content, from_me, created_at, message_type")
        .eq("conversation_id", viewConvId!)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as any[];
    },
  });

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (!conversations || conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <MessageSquare className="w-10 h-10 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Nenhum atendimento registrado.</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Último contato</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {conversations.map((conv: any, i: number) => (
              <TableRow key={conv.id}>
                <TableCell className="text-sm font-medium">#{conversations.length - i}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {format(new Date(conv.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  {format(new Date(conv.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={conv.status === "open" ? "default" : "secondary"} className="text-[10px]">
                    {conv.status === "open" ? "Aberto" : "Encerrado"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewConvId(conv.id)}>
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Message History Dialog */}
      <Dialog open={!!viewConvId} onOpenChange={(o) => !o && setViewConvId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Histórico do Ticket</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            {loadingMessages ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : (
              <div className="space-y-2">
                {(messages || []).map((msg: any) => (
                  <div key={msg.id} className={`flex ${msg.from_me ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      msg.from_me
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}>
                      <p className="whitespace-pre-wrap break-words">{msg.content || `[${msg.message_type}]`}</p>
                      <p className="text-[10px] opacity-70 mt-1">
                        {format(new Date(msg.created_at), "dd/MM HH:mm")}
                      </p>
                    </div>
                  </div>
                ))}
                {(!messages || messages.length === 0) && (
                  <p className="text-center text-sm text-muted-foreground py-8">Sem mensagens.</p>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};
