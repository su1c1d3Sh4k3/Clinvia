import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2, Link2, Search } from "lucide-react";
import { toast } from "sonner";

interface LinkInstagramContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  igContact: any;
}

export const LinkInstagramContactDialog = ({
  open,
  onOpenChange,
  igContact,
}: LinkInstagramContactDialogProps) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [linking, setLinking] = useState(false);

  const { data: contacts, isLoading } = useQuery({
    queryKey: ["link-ig-wpp-contacts", search],
    enabled: open,
    queryFn: async () => {
      let query = supabase
        .from("contacts")
        .select("id, push_name, number, phone, profile_pic_url")
        .eq("is_group", false)
        .not("number", "like", "instagram:%")
        .order("push_name", { ascending: true })
        .limit(20);
      if (search.trim()) {
        query = query.or(`push_name.ilike.%${search.trim()}%,number.ilike.%${search.trim()}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).filter((c: any) => c.id !== igContact?.id);
    },
  });

  const handleLink = async (target: any) => {
    setLinking(true);
    try {
      const { error } = await (supabase.from("contacts") as any)
        .update({ linked_contact_id: target.id })
        .eq("id", igContact.id);
      if (error) throw error;
      toast.success(`Instagram vinculado a ${target.push_name || target.number}`);
      queryClient.invalidateQueries({ queryKey: ["client-link"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao vincular: " + err.message);
    } finally {
      setLinking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="w-4 h-4" />
            Atribuir Instagram a Cliente
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Escolha o contato de WhatsApp que corresponde a{" "}
          <span className="font-medium">{igContact?.push_name || "este contato do Instagram"}</span>.
          Os dados do cliente passam a aparecer unificados no perfil.
        </p>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>

        <div className="max-h-72 overflow-y-auto space-y-1">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : !contacts || contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum contato encontrado.
            </p>
          ) : (
            contacts.map((c: any) => (
              <button
                key={c.id}
                disabled={linking}
                onClick={() => handleLink(c)}
                className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors text-left disabled:opacity-50"
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={c.profile_pic_url} />
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {(c.push_name || "?")[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.push_name || "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.phone || c.number?.split("@")[0] || "—"}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
