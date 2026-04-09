import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Search, Users, CheckSquare, Square } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface UazapiContact {
    contact_name: string;
    contact_FirstName: string;
    jid: string;
}

interface WhatsAppImportModalProps {
    open: boolean;
    onClose: () => void;
}

export function WhatsAppImportModal({ open, onClose }: WhatsAppImportModalProps) {
    const { data: ownerId } = useOwnerId();
    const queryClient = useQueryClient();

    const [step, setStep] = useState<"idle" | "loading" | "list" | "importing">("idle");
    const [wppContacts, setWppContacts] = useState<UazapiContact[]>([]);
    const [selectedJids, setSelectedJids] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState("");
    const [importCount, setImportCount] = useState(0);

    // Fetch active instance for apikey
    const { data: instance } = useQuery({
        queryKey: ["active-instance", ownerId],
        queryFn: async () => {
            if (!ownerId) return null;
            const { data, error } = await supabase
                .from("instances" as any)
                .select("id, apikey, instance_name, status")
                .eq("user_id", ownerId)
                .eq("status", "connected")
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            return data as { id: string; apikey: string; instance_name: string } | null;
        },
        enabled: !!ownerId && open,
    });

    // Fetch existing contacts numbers for deduplication
    const { data: existingNumbers } = useQuery({
        queryKey: ["existing-contact-numbers", ownerId],
        queryFn: async () => {
            if (!ownerId) return new Set<string>();
            const { data, error } = await supabase
                .from("contacts" as any)
                .select("number")
                .eq("user_id", ownerId);
            if (error) throw error;
            return new Set((data || []).map((c: any) => c.number));
        },
        enabled: !!ownerId && open,
    });

    const handleFetchContacts = async () => {
        if (!instance?.apikey) {
            toast.error("Nenhuma instância WhatsApp conectada");
            return;
        }

        setStep("loading");
        try {
            const response = await fetch("https://clinvia.uazapi.com/contacts", {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "token": instance.apikey,
                },
            });

            if (!response.ok) throw new Error(`Erro na API: ${response.status}`);

            const data: UazapiContact[] = await response.json();

            // Filter out groups and already existing contacts
            const newContacts = data.filter((c) => {
                if (!c.jid || c.jid.includes("@g.us")) return false; // Skip groups
                if (!c.contact_name) return false; // Skip unnamed
                return !existingNumbers?.has(c.jid);
            });

            setWppContacts(newContacts);
            setSelectedJids(new Set(newContacts.map((c) => c.jid))); // All selected by default
            setStep("list");

            if (newContacts.length === 0) {
                toast.info("Todos os contatos do WhatsApp já estão importados");
            }
        } catch (err: any) {
            console.error("Fetch contacts error:", err);
            toast.error("Erro ao buscar contatos do WhatsApp");
            setStep("idle");
        }
    };

    const handleImport = async () => {
        if (!ownerId || !instance?.id || selectedJids.size === 0) return;

        setStep("importing");
        setImportCount(0);

        const toImport = wppContacts.filter((c) => selectedJids.has(c.jid));
        const BATCH_SIZE = 50;
        let imported = 0;

        try {
            for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
                const batch = toImport.slice(i, i + BATCH_SIZE).map((c) => ({
                    number: c.jid,
                    push_name: c.contact_name,
                    user_id: ownerId,
                    instance_id: instance.id,
                    is_group: false,
                }));

                const { error } = await supabase
                    .from("contacts" as any)
                    .upsert(batch, { onConflict: "user_id,number", ignoreDuplicates: true });

                if (error) {
                    console.error("Batch insert error:", error);
                    // Continue with next batch even if one fails
                }

                imported += batch.length;
                setImportCount(imported);
            }

            toast.success(`${imported} contatos importados com sucesso`);
            queryClient.invalidateQueries({ queryKey: ["contacts"] });
            queryClient.invalidateQueries({ queryKey: ["existing-contact-numbers"] });
            handleClose();
        } catch (err: any) {
            console.error("Import error:", err);
            toast.error("Erro ao importar contatos");
            setStep("list");
        }
    };

    const handleClose = () => {
        setStep("idle");
        setWppContacts([]);
        setSelectedJids(new Set());
        setSearchTerm("");
        setImportCount(0);
        onClose();
    };

    const toggleSelect = (jid: string) => {
        setSelectedJids((prev) => {
            const next = new Set(prev);
            if (next.has(jid)) next.delete(jid);
            else next.add(jid);
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedJids.size === filteredContacts.length) {
            setSelectedJids(new Set());
        } else {
            setSelectedJids(new Set(filteredContacts.map((c) => c.jid)));
        }
    };

    const filteredContacts = useMemo(() => {
        if (!searchTerm) return wppContacts;
        const term = searchTerm.toLowerCase();
        return wppContacts.filter(
            (c) =>
                c.contact_name.toLowerCase().includes(term) ||
                c.jid.includes(term)
        );
    }, [wppContacts, searchTerm]);

    const formatPhone = (jid: string) => {
        const num = jid.replace("@s.whatsapp.net", "");
        if (num.length >= 12) {
            return `+${num.slice(0, 2)} (${num.slice(2, 4)}) ${num.slice(4, 9)}-${num.slice(9)}`;
        }
        return num;
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
            <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FaWhatsapp className="w-5 h-5 text-green-500" />
                        Importar Contatos do WhatsApp
                    </DialogTitle>
                </DialogHeader>

                {/* Idle / Initial State */}
                {step === "idle" && (
                    <div className="flex flex-col items-center gap-4 py-8">
                        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                            <FaWhatsapp className="w-8 h-8 text-green-500" />
                        </div>
                        <div className="text-center space-y-1">
                            <p className="font-medium">Importar contatos da agenda do WhatsApp</p>
                            <p className="text-sm text-muted-foreground">
                                {instance
                                    ? `Instância: ${instance.instance_name}`
                                    : "Nenhuma instância conectada"}
                            </p>
                        </div>
                        <Button
                            onClick={handleFetchContacts}
                            disabled={!instance}
                            className="gap-2"
                        >
                            <Users className="w-4 h-4" />
                            Buscar Contatos
                        </Button>
                    </div>
                )}

                {/* Loading */}
                {step === "loading" && (
                    <div className="flex flex-col items-center gap-3 py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
                        <p className="text-sm text-muted-foreground">Buscando contatos do WhatsApp...</p>
                    </div>
                )}

                {/* Contact List */}
                {step === "list" && (
                    <>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-muted-foreground">
                                    <span className="font-medium text-foreground">{wppContacts.length}</span> contatos novos encontrados
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    <span className="font-medium text-foreground">{selectedJids.size}</span> selecionados
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Buscar por nome ou número..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-9 h-9"
                                    />
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={toggleAll}
                                    className="gap-1.5 text-xs h-9 whitespace-nowrap"
                                >
                                    {selectedJids.size === filteredContacts.length ? (
                                        <><Square className="w-3.5 h-3.5" /> Desmarcar</>
                                    ) : (
                                        <><CheckSquare className="w-3.5 h-3.5" /> Marcar Todos</>
                                    )}
                                </Button>
                            </div>
                        </div>

                        <ScrollArea className="flex-1 min-h-0 max-h-[400px] -mx-6 px-6">
                            <div className="space-y-1">
                                {filteredContacts.map((contact) => (
                                    <label
                                        key={contact.jid}
                                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                                    >
                                        <Checkbox
                                            checked={selectedJids.has(contact.jid)}
                                            onCheckedChange={() => toggleSelect(contact.jid)}
                                        />
                                        <Avatar className="h-8 w-8">
                                            <AvatarFallback className="text-xs bg-green-500/10 text-green-600">
                                                {contact.contact_name.substring(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{contact.contact_name}</p>
                                            <p className="text-xs text-muted-foreground">{formatPhone(contact.jid)}</p>
                                        </div>
                                    </label>
                                ))}

                                {filteredContacts.length === 0 && searchTerm && (
                                    <p className="text-center text-sm text-muted-foreground py-8">
                                        Nenhum contato encontrado para "{searchTerm}"
                                    </p>
                                )}
                            </div>
                        </ScrollArea>

                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="outline" onClick={handleClose}>
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleImport}
                                disabled={selectedJids.size === 0}
                                className="gap-2"
                            >
                                <FaWhatsapp className="w-4 h-4" />
                                Importar {selectedJids.size} Contatos
                            </Button>
                        </DialogFooter>
                    </>
                )}

                {/* Importing */}
                {step === "importing" && (
                    <div className="flex flex-col items-center gap-3 py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
                        <p className="text-sm text-muted-foreground">
                            Importando contatos... {importCount}/{selectedJids.size}
                        </p>
                        <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                                className="h-full bg-green-500 rounded-full transition-all"
                                style={{ width: `${selectedJids.size > 0 ? (importCount / selectedJids.size) * 100 : 0}%` }}
                            />
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
