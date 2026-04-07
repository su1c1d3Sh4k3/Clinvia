import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";

interface ContactPickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (contact: { id: string; push_name: string | null; number: string; profile_pic_url: string | null }) => void;
}

export function ContactPickerModal({ open, onOpenChange, onSelect }: ContactPickerModalProps) {
  const [search, setSearch] = useState("");
  const { data: ownerId } = useOwnerId();

  const { data: contacts, isLoading } = useQuery({
    queryKey: ["contacts-picker", ownerId],
    queryFn: async () => {
      if (!ownerId) return [];
      const { data, error } = await supabase
        .from("contacts")
        .select("id, push_name, number, profile_pic_url")
        .eq("user_id", ownerId)
        .not("number", "is", null)
        .order("push_name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!ownerId && open,
  });

  const filtered = useMemo(() => {
    if (!contacts) return [];
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(
      (c) =>
        (c.push_name?.toLowerCase().includes(q)) ||
        c.number.includes(q)
    );
  }, [contacts, search]);

  const formatNumber = (number: string) => {
    if (number.includes("@")) return number.split("@")[0];
    return number.replace(/\D/g, "");
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { onOpenChange(val); if (!val) setSearch(""); }}>
      <DialogContent className="sm:max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Enviar Contato
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou numero..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 max-h-[50vh] -mx-6 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              Carregando contatos...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm gap-2">
              <User className="w-8 h-8 opacity-40" />
              {search ? "Nenhum contato encontrado" : "Nenhum contato disponivel"}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {filtered.map((contact) => (
                <button
                  key={contact.id}
                  className="flex items-center gap-3 p-3 hover:bg-accent rounded-lg cursor-pointer transition-colors text-left w-full"
                  onClick={() => {
                    onSelect(contact);
                    onOpenChange(false);
                    setSearch("");
                  }}
                >
                  <Avatar className="w-10 h-10 shrink-0">
                    <AvatarImage src={contact.profile_pic_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                      {(contact.push_name || "?")[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-sm truncate">
                      {contact.push_name || "Sem nome"}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {formatNumber(contact.number)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
