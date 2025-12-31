import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Pencil, Trash2, Users, Search, Send, Instagram, CheckSquare, Square, Tag, AlertTriangle } from "lucide-react";
import { FaWhatsapp, FaInstagram } from "react-icons/fa";
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
import { Switch } from "@/components/ui/switch";
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
    ia_on?: boolean;
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
    const [selectedChannelFilter, setSelectedChannelFilter] = useState<"all" | "whatsapp" | "instagram">("all");

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

    const toggleIaMutation = useMutation({
        mutationFn: async ({ id, ia_on }: { id: string; ia_on: boolean }) => {
            const { error } = await supabase
                .from("contacts")
                .update({ ia_on } as any)
                .eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["contacts"] });
        },
        onError: (error) => {
            toast({
                title: "Erro ao atualizar IA",
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

        const matchesChannel = selectedChannelFilter === "all" ||
            (contact.channel || 'whatsapp') === selectedChannelFilter;

        return matchesSearch && matchesTag && matchesChannel;
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
            <div className="flex-1 p-4 md:p-8 overflow-auto">
                <div className="max-w-6xl mx-auto space-y-4 md:space-y-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold">Contatos</h1>
                            <p className="text-muted-foreground text-sm md:text-base mt-1 md:mt-2">
                                Gerencie seus contatos
                            </p>
                        </div>
                        <Button onClick={handleAddNew} size="sm" className="h-8 md:h-9 text-xs md:text-sm w-fit">
                            <Plus className="w-4 h-4 mr-1 md:mr-2" />
                            <span className="hidden sm:inline">Novo </span>Contato
                        </Button>
                    </div>

                    {/* Channel Tabs */}
                    <div className="flex gap-2">
                        <Button
                            variant={selectedChannelFilter === 'all' ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedChannelFilter('all')}
                            className={`h-8 ${selectedChannelFilter !== 'all' ? 'bg-white dark:bg-transparent border-0 dark:border' : ''}`}
                        >
                            Todos
                        </Button>
                        <Button
                            variant={selectedChannelFilter === 'whatsapp' ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedChannelFilter('whatsapp')}
                            className={`h-8 gap-1 ${selectedChannelFilter !== 'whatsapp' ? 'bg-white dark:bg-transparent border-0 dark:border' : ''}`}
                        >
                            <FaWhatsapp className="h-4 w-4 text-green-500" />
                            WhatsApp
                        </Button>
                        <Button
                            variant={selectedChannelFilter === 'instagram' ? 'secondary' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedChannelFilter('instagram')}
                            className={`h-8 gap-1 ${selectedChannelFilter !== 'instagram' ? 'bg-white dark:bg-transparent border-0 dark:border' : ''}`}
                        >
                            <FaInstagram className="h-4 w-4 text-pink-500" />
                            Instagram
                        </Button>
                    </div>

                    <div className="flex flex-col gap-3 md:gap-4">
                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 sm:items-center">
                            <div className="relative flex-1">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-secondary" />
                                <Input
                                    placeholder="Buscar..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-8 h-9 bg-white dark:bg-background border-0 dark:border"
                                />
                            </div>
                            <Select value={selectedTagFilter} onValueChange={setSelectedTagFilter}>
                                <SelectTrigger className="w-full sm:w-[180px] h-9 text-sm bg-white dark:bg-background border-0 dark:border">
                                    <SelectValue placeholder="Filtrar Tag" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todas</SelectItem>
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
                            <div className="flex flex-wrap items-center gap-2 md:gap-4 p-2 bg-muted/50 rounded-lg border animate-in fade-in slide-in-from-top-2">
                                <span className="text-xs md:text-sm font-medium ml-1 md:ml-2">
                                    {selectedContactIds.size} sel.
                                </span>

                                <div className="h-6 w-px bg-border hidden sm:block" />

                                <Popover open={isAssignTagsOpen} onOpenChange={setIsAssignTagsOpen}>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className="gap-1 md:gap-2 h-7 md:h-8 text-xs">
                                            <Tag className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                            <span className="hidden sm:inline">Atribuir </span>Tags
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-72 md:w-80 p-0" align="start">
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
                                    className="gap-1 md:gap-2 h-7 md:h-8 text-xs"
                                    onClick={() => setIsBulkDeleteModalOpen(true)}
                                >
                                    <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                    <span className="hidden sm:inline">Excluir</span>
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="rounded-md border overflow-x-auto bg-white dark:bg-transparent border-[#D4D5D6] dark:border-border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[40px] md:w-[50px]">
                                        <Checkbox
                                            checked={filteredContacts && filteredContacts.length > 0 && selectedContactIds.size === filteredContacts.length}
                                            onCheckedChange={toggleSelectAll}
                                            aria-label="Select all"
                                        />
                                    </TableHead>
                                    <TableHead className="text-secondary dark:text-slate-400 font-semibold min-w-[120px]">Nome</TableHead>
                                    <TableHead className="text-secondary dark:text-slate-400 font-semibold hidden sm:table-cell">Telefone</TableHead>
                                    <TableHead className="text-secondary dark:text-slate-400 font-semibold hidden md:table-cell">Etiquetas</TableHead>
                                    <TableHead className="text-secondary dark:text-slate-400 font-semibold text-center w-[60px] hidden sm:table-cell">IA</TableHead>
                                    {!isAgent && <TableHead className="text-secondary dark:text-slate-400 font-semibold text-center hidden lg:table-cell">Satisf.</TableHead>}
                                    {!isAgent && <TableHead className="text-secondary dark:text-slate-400 font-semibold text-center hidden lg:table-cell">Resumos</TableHead>}
                                    <TableHead className="w-[100px] md:w-[180px] text-secondary dark:text-slate-400 font-semibold">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8">
                                            Carregando...
                                        </TableCell>
                                    </TableRow>
                                ) : filteredContacts?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                            Nenhum contato encontrado
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredContacts?.map((contact) => (
                                        <TableRow key={contact.id} data-state={selectedContactIds.has(contact.id) && "selected"}>
                                            <TableCell className="py-2 md:py-4">
                                                <Checkbox
                                                    checked={selectedContactIds.has(contact.id)}
                                                    onCheckedChange={() => toggleSelectContact(contact.id)}
                                                    aria-label={`Select ${contact.push_name}`}
                                                />
                                            </TableCell>
                                            <TableCell className="py-2 md:py-4">
                                                <div className="flex items-center gap-2 md:gap-3">
                                                    <div className="relative">
                                                        <Avatar className="h-8 w-8 md:h-10 md:w-10">
                                                            <AvatarImage src={contact.profile_pic_url} />
                                                            <AvatarFallback className="text-xs md:text-sm">{contact.push_name?.[0] || "?"}</AvatarFallback>
                                                        </Avatar>
                                                        {/* Channel Badge */}
                                                        <div className="absolute -bottom-1 -right-1">
                                                            {(contact.channel || 'whatsapp') === 'instagram' ? (
                                                                <div className="bg-gradient-to-br from-purple-500 via-pink-500 to-orange-500 rounded-full p-0.5">
                                                                    <FaInstagram className="h-3 w-3 text-white" />
                                                                </div>
                                                            ) : (
                                                                <div className="bg-green-500 rounded-full p-0.5">
                                                                    <FaWhatsapp className="h-3 w-3 text-white" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-sm">{contact.push_name}</span>
                                                        <span className="text-xs text-muted-foreground sm:hidden">
                                                            {contact.phone || contact.number?.split('@')[0]}
                                                        </span>
                                                        {contact.company && (
                                                            <span className="text-xs text-muted-foreground hidden md:inline">{contact.company}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell py-2 md:py-4 text-sm">
                                                {contact.phone || contact.number?.split('@')[0]}
                                            </TableCell>
                                            <TableCell className="hidden md:table-cell py-2 md:py-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {contact.contact_tags?.slice(0, 2).map((ct: any) => (
                                                        <Badge
                                                            key={ct.tags.id}
                                                            variant="secondary"
                                                            className="text-[10px]"
                                                            style={{
                                                                backgroundColor: ct.tags.color + '20',
                                                                color: ct.tags.color,
                                                                borderColor: ct.tags.color
                                                            }}
                                                        >
                                                            {ct.tags.name}
                                                        </Badge>
                                                    ))}
                                                    {contact.contact_tags?.length > 2 && (
                                                        <Badge variant="outline" className="text-[10px]">+{contact.contact_tags.length - 2}</Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center hidden sm:table-cell py-2 md:py-4">
                                                <Switch
                                                    checked={contact.ia_on !== false}
                                                    onCheckedChange={(checked) => toggleIaMutation.mutate({ id: contact.id, ia_on: checked })}
                                                    disabled={toggleIaMutation.isPending}
                                                />
                                            </TableCell>
                                            {!isAgent && (
                                                <TableCell className="text-center hidden lg:table-cell py-2 md:py-4">
                                                    {contact.quality && contact.quality.length > 0 ? (
                                                        <Badge variant="outline" className={
                                                            `text-[10px] ${(contact.quality.reduce((a, b) => a + b, 0) / contact.quality.length) >= 7 ? "bg-green-500/10 text-green-500 border-green-500/20" :
                                                                (contact.quality.reduce((a, b) => a + b, 0) / contact.quality.length) >= 4 ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" :
                                                                    "bg-red-500/10 text-red-500 border-red-500/20"}`
                                                        }>
                                                            {(contact.quality.reduce((a, b) => a + b, 0) / contact.quality.length).toFixed(1)}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">-</span>
                                                    )}
                                                </TableCell>
                                            )}
                                            {!isAgent && (
                                                <TableCell className="text-center hidden lg:table-cell py-2 md:py-4">
                                                    {contact.analysis && contact.analysis.length > 0 ? (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-[10px] h-6 px-2"
                                                            onClick={() => {
                                                                setSelectedContactForAnalysis(contact);
                                                                setIsAnalysisHistoryOpen(true);
                                                            }}
                                                        >
                                                            <FileText className="w-3 h-3 mr-1" />
                                                            {contact.analysis.length}
                                                        </Button>
                                                    ) : (
                                                        <span className="text-muted-foreground text-xs">0</span>
                                                    )}
                                                </TableCell>
                                            )}
                                            <TableCell className="py-2 md:py-4">
                                                <div className="flex items-center gap-0.5 md:gap-1">
                                                    {!isAgent && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="text-purple-500 hover:text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/20 h-7 w-7 md:h-8 md:w-8"
                                                            onClick={() => {
                                                                setSelectedContactForReport(contact);
                                                                setIsClientReportOpen(true);
                                                            }}
                                                            title="Relatório IA"
                                                        >
                                                            <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 md:h-8 md:w-8"
                                                        onClick={() => handleSendMessage(contact)}
                                                        title="Enviar Mensagem"
                                                    >
                                                        <Send className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className={`h-7 w-7 md:h-8 md:w-8 hidden sm:inline-flex ${contact.instagram ? "text-pink-600 hover:text-pink-700" : "text-muted-foreground opacity-50 cursor-not-allowed"}`}
                                                        onClick={() => contact.instagram && window.open(`https://www.instagram.com/${contact.instagram}`, '_blank')}
                                                        disabled={!contact.instagram}
                                                        title={contact.instagram ? `@${contact.instagram}` : "Sem Instagram"}
                                                    >
                                                        <Instagram className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                                    </Button>
                                                    {userRole === "admin" && (
                                                        <>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-7 w-7 md:h-8 md:w-8"
                                                                onClick={() => handleEdit(contact)}
                                                                title="Editar"
                                                            >
                                                                <Pencil className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="text-destructive hover:text-destructive h-7 w-7 md:h-8 md:w-8"
                                                                onClick={() => setContactToDelete(contact)}
                                                                title="Excluir"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
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
