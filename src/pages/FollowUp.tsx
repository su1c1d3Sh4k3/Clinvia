import { useState } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { useCurrentTeamMember } from "@/hooks/useStaff";
import { useFollowUpTemplates, useFollowUpCategories, useDeleteFollowUpTemplate, useDeleteFollowUpCategory, FollowUpTemplate } from "@/hooks/useFollowUp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus, Pencil, Trash2, Clock, MoreVertical, FolderOpen } from "lucide-react";
import { FollowUpModal } from "@/components/followup/FollowUpModal";
import { CategoryModal } from "@/components/followup/CategoryModal";

export default function FollowUp() {
    const { data: userRole } = useUserRole();
    const { data: currentTeamMember } = useCurrentTeamMember();
    const { data: templates, isLoading: loadingTemplates } = useFollowUpTemplates();
    const { data: categories, isLoading: loadingCategories } = useFollowUpCategories();
    const deleteTemplateMutation = useDeleteFollowUpTemplate();
    const deleteCategoryMutation = useDeleteFollowUpCategory();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [templateToEdit, setTemplateToEdit] = useState<FollowUpTemplate | null>(null);
    const [activeTab, setActiveTab] = useState("templates");

    // Filter templates based on role
    const filteredTemplates = templates?.filter((t) => {
        if (userRole === "admin" || userRole === "supervisor") return true;
        return t.team_member_id === currentTeamMember?.id;
    });

    // Filter categories based on role
    const filteredCategories = categories?.filter((c) => {
        if (userRole === "admin" || userRole === "supervisor") return true;
        return c.team_member_id === currentTeamMember?.id;
    });

    const handleEdit = (template: FollowUpTemplate) => {
        setTemplateToEdit(template);
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm("Deseja excluir este Follow Up?")) {
            await deleteTemplateMutation.mutateAsync(id);
        }
    };

    const handleDeleteCategory = async (id: string) => {
        if (confirm("Deseja excluir esta categoria? Todos os Follow Ups dela serão excluídos também.")) {
            await deleteCategoryMutation.mutateAsync(id);
        }
    };

    const formatTime = (minutes: number) => {
        if (minutes < 60) return `${minutes} min`;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
    };

    return (
        <div className="container mx-auto py-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Clock className="w-6 h-6 text-[#005AA8]" />
                        Follow Up
                    </h1>
                    <p className="text-muted-foreground">
                        Gerencie mensagens de acompanhamento para seus contatos
                    </p>
                </div>
                <Button onClick={() => { setTemplateToEdit(null); setIsModalOpen(true); }}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Follow Up
                </Button>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="templates">Follow Ups</TabsTrigger>
                    <TabsTrigger value="categories">Categorias</TabsTrigger>
                </TabsList>

                {/* Templates Tab */}
                <TabsContent value="templates" className="space-y-4">
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-[#005AA8] dark:text-muted-foreground">Nome</TableHead>
                                    <TableHead className="text-[#005AA8] dark:text-muted-foreground">Tempo</TableHead>
                                    <TableHead className="text-[#005AA8] dark:text-muted-foreground">Mensagem</TableHead>
                                    <TableHead className="text-[#005AA8] dark:text-muted-foreground">Atendente</TableHead>
                                    <TableHead className="text-[#005AA8] dark:text-muted-foreground">Categoria</TableHead>
                                    <TableHead className="text-[#005AA8] dark:text-muted-foreground text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingTemplates ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredTemplates?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                            Nenhum Follow Up cadastrado
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredTemplates?.map((template) => (
                                        <TableRow key={template.id}>
                                            <TableCell className="font-medium">{template.name}</TableCell>
                                            <TableCell>
                                                <Badge variant="secondary">{formatTime(template.time_minutes)}</Badge>
                                            </TableCell>
                                            <TableCell className="max-w-xs truncate">{template.message}</TableCell>
                                            <TableCell>{template.team_member?.name || "-"}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{(template.category as any)?.name || "-"}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon">
                                                            <MoreVertical className="w-4 h-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem onClick={() => handleEdit(template)}>
                                                            <Pencil className="w-4 h-4 mr-2" />
                                                            Editar
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() => handleDelete(template.id)}
                                                            className="text-destructive"
                                                        >
                                                            <Trash2 className="w-4 h-4 mr-2" />
                                                            Excluir
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                {/* Categories Tab */}
                <TabsContent value="categories" className="space-y-4">
                    <div className="flex justify-end">
                        <Button variant="outline" onClick={() => setIsCategoryModalOpen(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Nova Categoria
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {loadingCategories ? (
                            <div className="col-span-full flex justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin" />
                            </div>
                        ) : filteredCategories?.length === 0 ? (
                            <div className="col-span-full text-center py-8 text-muted-foreground">
                                Nenhuma categoria cadastrada
                            </div>
                        ) : (
                            filteredCategories?.map((category) => (
                                <Card key={category.id}>
                                    <CardHeader className="pb-2">
                                        <div className="flex items-center justify-between">
                                            <CardTitle className="text-base flex items-center gap-2">
                                                <FolderOpen className="w-4 h-4" />
                                                {category.name}
                                            </CardTitle>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive"
                                                onClick={() => handleDeleteCategory(category.id)}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <CardDescription>
                                            {templates?.filter(t => t.category_id === category.id).length || 0} follow ups
                                        </CardDescription>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Modals */}
            <FollowUpModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                templateToEdit={templateToEdit}
            />
            <CategoryModal
                open={isCategoryModalOpen}
                onOpenChange={setIsCategoryModalOpen}
            />
        </div>
    );
}
