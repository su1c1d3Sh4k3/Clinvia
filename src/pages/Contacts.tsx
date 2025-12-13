import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Users, Search, Send, Instagram, CheckSquare, Square, Tag, AlertTriangle } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ContactModal } from "@/components/ContactModal";
import { NewMessageModal } from "@/components/NewMessageModal";
import { useToast } from "@/hooks/use-toast";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { AnalysisHistoryModal } from "@/components/AnalysisHistoryModal";
import { ClientReportModal } from "@/components/ClientReportModal";
import { Sparkles, FileText } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";

interface Contact {
    id: string;
    push_name: string;
    number: string;
    profile_pic_url?: string;
    phone?: string;
    company?: string;
    cpf?: string;
    email?: string;
    instagram?: string;
    contact_tags?: {
        tags: {
            id: string;
            name: string;
            color: string;
        }
    }[];
    quality?: number[];
    analysis?: { data: string; resumo: string }[];
    report?: string;
}


const Contacts = () => {
    const { data: userRole } = useUserRole();
    const isAgent = userRole === 'agent';
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);
    const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
    const [selectedContactForMessage, setSelectedContactForMessage] = useState<Contact | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedTagFilter, setSelectedTagFilter] = useState<string>("all");

    // Bulk Actions State
    const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
    const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState(false);
    const [tagsToAssign, setTagsToAssign] = useState<Set<string>>(new Set());
    const [isAssignTagsOpen, setIsAssignTagsOpen] = useState(false);

    // New state for analysis features
    const [isAnalysisHistoryOpen, setIsAnalysisHistoryOpen] = useState(false);
    const [isClientReportOpen, setIsClientReportOpen] = useState(false);
    const [selectedContactForAnalysis, setSelectedContactForAnalysis] = useState<Contact | null>(null);
    const [selectedContactForReport, setSelectedContactForReport] = useState<Contact | null>(null);

    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Fetch Contacts
    const { data: contacts, isLoading } = useQuery({
        queryKey: ["contacts"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("contacts" as any)
                .select("*, contact_tags(tags(*))")
                .order("push_name");

            if (error) throw error;
            return data as any[]; // Type assertion needed due to complex join
        },
    });

    // Fetch Tags for Filter
    const { data: tags } = useQuery({
        queryKey: ["tags-filter"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("tags" as any)
                .select("*")
                .eq("is_active", true)
                .order("name");
            if (error) throw error;
            return data as any[];
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("contacts").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["contacts"] });
            toast({ title: "Contato excluído com sucesso" });
            setContactToDelete(null);
        },
        onError: (error) => {
            toast({
                title: "Erro ao excluir",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const bulkDeleteMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            const { error } = await supabase.from("contacts").delete().in("id", ids);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["contacts"] });
            toast({ title: "Contatos excluídos com sucesso" });
            setSelectedContactIds(new Set());
            setIsBulkDeleteModalOpen(false);
        },
        onError: (error) => {
            toast({
                title: "Erro ao excluir em massa",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const bulkAssignTagsMutation = useMutation({
        mutationFn: async ({ contactIds, tagIds }: { contactIds: string[], tagIds: string[] }) => {
            const payload = [];
            for (const contactId of contactIds) {
                for (const tagId of tagIds) {
                    payload.push({ contact_id: contactId, tag_id: tagId });
                }
            }

            if (payload.length === 0) return;

            const { error } = await supabase
                .from("contact_tags")
                .upsert(payload, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["contacts"] });
            toast({ title: "Tags atribuídas com sucesso" });
            setTagsToAssign(new Set());
            setIsAssignTagsOpen(false);
            // Optional: Clear selection or keep it? Keeping it allows further actions.
            // setSelectedContactIds(new Set()); 
        },
        onError: (error) => {
            toast({
                title: "Erro ao atribuir tags",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const handleEdit = (contact: Contact) => {
        setEditingContact(contact);
        setIsModalOpen(true);
    };

    const handleAddNew = () => {
        setEditingContact(null);
        setIsModalOpen(true);
    };

    const handleSendMessage = (contact: Contact) => {
        setSelectedContactForMessage(contact);
        setIsMessageModalOpen(true);
    };

    const filteredContacts = contacts?.filter((contact) => {
        const matchesSearch =
            (contact.push_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                contact.phone?.includes(searchTerm) ||
                contact.number?.includes(searchTerm));

        const matchesTag = selectedTagFilter === "all" || contact.contact_tags?.some((ct: any) => ct.tags.id === selectedTagFilter);

        return matchesSearch && matchesTag;
    });

    // Selection Logic
    const toggleSelectAll = () => {
        if (!filteredContacts) return;
        if (selectedContactIds.size === filteredContacts.length) {
            setSelectedContactIds(new Set());
        } else {
            setSelectedContactIds(new Set(filteredContacts.map(c => c.id)));
        }
    };

    const toggleSelectContact = (id: string) => {
        const newSet = new Set(selectedContactIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedContactIds(newSet);
    };

    const toggleTagSelection = (tagId: string) => {
        const newSet = new Set(tagsToAssign);
        if (newSet.has(tagId)) {
            newSet.delete(tagId);
        } else {
            newSet.add(tagId);
        }
        setTagsToAssign(newSet);
    };

    return (
        <div className="flex h-screen w-full bg-background">
            <div className="flex-1 p-8 overflow-auto">
                <div className="max-w-6xl mx-auto space-y-8">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold">Contatos</h1>
                            <p className="text-muted-foreground mt-2">
                                Gerencie seus contatos
                            </p>
                        </div>
                        <Button onClick={handleAddNew}>
                            <Plus className="w-4 h-4 mr-2" />
                            Novo Contato
                        </Button>
                    </div>

                    <div className="flex flex-col gap-4">
                        <div className="flex gap-4 items-center">
                            <div className="relative flex-1 max-w-sm">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-secondary" />
                                <Input
                                    placeholder="Buscar por nome ou telefone..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-8 border-secondary"
                                />
                            </div>
                            <Select value={selectedTagFilter} onValueChange={setSelectedTagFilter}>
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue placeholder="Filtrar por Tag" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas as Tags</SelectItem>
                                    {tags?.map((tag) => (
                                        <SelectItem key={tag.id} value={tag.id}>
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                                                {tag.name}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Bulk Actions Toolbar */}
                        {selectedContactIds.size > 0 && (
                            <div className="flex items-center gap-4 p-2 bg-muted/50 rounded-lg border animate-in fade-in slide-in-from-top-2">
                                <span className="text-sm font-medium ml-2">
                                    {selectedContactIds.size} selecionado(s)
                                </span>

                                <div className="h-6 w-px bg-border mx-2" />

                                <Popover open={isAssignTagsOpen} onOpenChange={setIsAssignTagsOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className="gap-2">
                                            <Tag className="w-4 h-4" />
                                            Atribuir Tags
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 p-0" align="start">
                                        <div className="p-4 space-y-4">
                                            <div className="space-y-2">
                                                <h4 className="font-medium leading-none">Selecione as Tags</h4>
                                                <p className="text-sm text-muted-foreground">
                                                    As tags selecionadas serão adicionadas aos contatos.
                                                </p>
                                            </div>
                                            <div className="grid gap-2 max-h-[200px] overflow-y-auto">
                                                {tags?.map((tag) => (
                                                    <div key={tag.id} className="flex items-center space-x-2">
                                                        <Checkbox
                                                            id={`tag-${tag.id}`}
                                                            checked={tagsToAssign.has(tag.id)}
                                                            onCheckedChange={() => toggleTagSelection(tag.id)}
                                                        />
                                                        <label
                                                            htmlFor={`tag-${tag.id}`}
                                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2"
                                                        >
                                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                                                            {tag.name}
                                                        </label>
                                                    </div>
                                                ))}
                                            </div>
                                            <Button
                                                className="w-full"
                                                disabled={tagsToAssign.size === 0 || bulkAssignTagsMutation.isPending}
                                                onClick={() => bulkAssignTagsMutation.mutate({
                                                    contactIds: Array.from(selectedContactIds),
                                                    tagIds: Array.from(tagsToAssign)
                                                })}
                                            >
                                                {bulkAssignTagsMutation.isPending ? "Atribuindo..." : "Atribuir a todos"}
                                            </Button>
                                        </div>
                                    </PopoverContent>
                                </Popover>

                                <div className="flex-1" />

                                <Button
                                    variant="destructive"
                                    size="sm"
                                    className="gap-2"
                                    onClick={() => setIsBulkDeleteModalOpen(true)}
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Excluir em massa
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">
                                        <Checkbox
                                            checked={filteredContacts && filteredContacts.length > 0 && selectedContactIds.size === filteredContacts.length}
                                            onCheckedChange={toggleSelectAll}
                                            aria-label="Select all"
                                        />
                                    </TableHead>
                                    <TableHead className="text-secondary dark:text-slate-400 font-semibold">Nome</TableHead>
                                    <TableHead className="text-secondary dark:text-slate-400 font-semibold">Telefone</TableHead>
                                    <TableHead className="text-secondary dark:text-slate-400 font-semibold">Etiquetas</TableHead>
                                    {!isAgent && <TableHead className="text-secondary dark:text-slate-400 font-semibold text-center">Satisfação</TableHead>}
                                    {!isAgent && <TableHead className="text-secondary dark:text-slate-400 font-semibold text-center">Resumos</TableHead>}
                                    <TableHead className="w-[180px] text-secondary dark:text-slate-400 font-semibold">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8">
                                            Carregando...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredContacts?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                            Nenhum contato encontrado
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredContacts?.map((contact) => (
                                        <TableRow key={contact.id} data-state={selectedContactIds.has(contact.id) && "selected"}>
                                            <TableCell>
                                                <Checkbox
                                                    checked={selectedContactIds.has(contact.id)}
                                                    onCheckedChange={() => toggleSelectContact(contact.id)}
                                                    aria-label={`Select ${contact.push_name}`}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Avatar>
                                                        <AvatarImage src={contact.profile_pic_url} />
                                                        <AvatarFallback>{contact.push_name?.[0] || "?"}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium">{contact.push_name}</span>
                                                        {contact.company && (
                                                            <span className="text-xs text-muted-foreground">{contact.company}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {contact.phone || contact.number?.split('@')[0]}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {contact.contact_tags?.map((ct: any) => (
                                                        <Badge
                                                            key={ct.tags.id}
                                                            variant="secondary"
                                                            className="text-xs"
                                                            style={{
                                                                backgroundColor: ct.tags.color + '20',
                                                                color: ct.tags.color,
                                                                borderColor: ct.tags.color
                                                            }}
                                                        >
                                                            {ct.tags.name}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </TableCell>
                                            {!isAgent && (
                                                <TableCell className="text-center">
                                                    {contact.quality && contact.quality.length > 0 ? (
                                                        <Badge variant="outline" className={
                                                            (contact.quality.reduce((a, b) => a + b, 0) / contact.quality.length) >= 7 ? "bg-green-500/10 text-green-500 border-green-500/20" :
                                                                (contact.quality.reduce((a, b) => a + b, 0) / contact.quality.length) >= 4 ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" :
                                                                    "bg-red-500/10 text-red-500 border-red-500/20"
                                                        }>
                                                            {(contact.quality.reduce((a, b) => a + b, 0) / contact.quality.length).toFixed(1)}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">-</span>
                                                    )}
                                                </TableCell>
                                            )}
                                            {!isAgent && (
                                                <TableCell className="text-center">
                                                    {contact.analysis && contact.analysis.length > 0 ? (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-xs h-7"
                                                            onClick={() => {
                                                                setSelectedContactForAnalysis(contact);
                                                                setIsAnalysisHistoryOpen(true);
                                                            }}
                                                        >
                                                            <FileText className="w-3 h-3 mr-1" />
                                                            Visualizar {contact.analysis.length}
                                                        </Button>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">0</span>
                                                    )}
                                                </TableCell>
                                            )}
                                            <TableCell>
                                                <div className="flex items-center gap-1">
                                                    {!isAgent && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-purple-500 hover:text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/20"
                                                            onClick={() => {
                                                                setSelectedContactForReport(contact);
                                                                setIsClientReportOpen(true);
                                                            }}
                                                            title="Relatório IA"
                                                        >
                                                            <Sparkles className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleSendMessage(contact)}
                                                        title="Enviar Mensagem"
                                                    >
                                                        <Send className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className={contact.instagram ? "text-pink-600 hover:text-pink-700" : "text-muted-foreground opacity-50 cursor-not-allowed"}
                                                        onClick={() => contact.instagram && window.open(`https://www.instagram.com/${contact.instagram}`, '_blank')}
                                                        disabled={!contact.instagram}
                                                        title={contact.instagram ? `Instagram: @${contact.instagram}` : "Instagram não cadastrado"}
                                                    >
                                                        <Instagram className="w-4 h-4" />
                                                    </Button>
                                                    {userRole === "admin" && (
                                                        <>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                onClick={() => handleEdit(contact)}
                                                                title="Editar"
                                                            >
                                                                <Pencil className="w-4 h-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="text-destructive hover:text-destructive"
                                                                onClick={() => setContactToDelete(contact)}
                                                                title="Excluir"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </div>

            <ContactModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                contactToEdit={editingContact}
            />

            <NewMessageModal
                open={isMessageModalOpen}
                onOpenChange={setIsMessageModalOpen}
                prefilledPhone={selectedContactForMessage?.phone || selectedContactForMessage?.number?.split('@')[0]}
            />

            {/* Single Delete Confirmation */}
            <AlertDialog open={!!contactToDelete} onOpenChange={(open) => !open && setContactToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir Contato</AlertDialogTitle>
                        <AlertDialogDescription>
                            Tem certeza que deseja excluir o contato "{contactToDelete?.push_name}"? Esta ação não pode ser desfeita.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => contactToDelete && deleteMutation.mutate(contactToDelete.id)}
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Bulk Delete Confirmation */}
            <AlertDialog open={isBulkDeleteModalOpen} onOpenChange={setIsBulkDeleteModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <div className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-6 w-6" />
                            <AlertDialogTitle>Excluir {selectedContactIds.size} contatos?</AlertDialogTitle>
                        </div>
                        <AlertDialogDescription className="space-y-2">
                            <p>Tem certeza que deseja realizar essa ação? Ela é <strong>irreversível!</strong></p>
                            <p className="font-medium text-destructive">
                                O apagamento de um lead acarreta no apagamento de todos os cards de CRM, todas as tarefas, conversas e tickets vinculados a ele.
                            </p>
                            <p>Deseja mesmo assim excluir?</p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => bulkDeleteMutation.mutate(Array.from(selectedContactIds))}
                        >
                            Sim, excluir tudo
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>


            {
                selectedContactForAnalysis && (
                    <AnalysisHistoryModal
                        open={isAnalysisHistoryOpen}
                        onOpenChange={setIsAnalysisHistoryOpen}
                        analysisHistory={selectedContactForAnalysis.analysis || []}
                        contactName={selectedContactForAnalysis.push_name}
                    />
                )
            }

            {
                selectedContactForReport && (
                    <ClientReportModal
                        open={isClientReportOpen}
                        onOpenChange={setIsClientReportOpen}
                        contact={selectedContactForReport}
                    />
                )
            }
        </div >

    );
};

export default Contacts;
