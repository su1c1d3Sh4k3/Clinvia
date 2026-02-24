import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trash2, Edit, Image as ImageIcon, Loader2, Download, Upload } from "lucide-react";
import { ProductServiceModal } from "@/components/ProductServiceModal";
import { Badge } from "@/components/ui/badge";
import { useUserRole } from "@/hooks/useUserRole";
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

export default function ProductsServices() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { data: userRole } = useUserRole();
    const isAgent = userRole === 'agent';
    const isSupervisor = userRole === 'supervisor';
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [itemToEdit, setItemToEdit] = useState<any>(null);
    const [activeTab, setActiveTab] = useState("product");
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { data: items, isLoading } = useQuery({
        queryKey: ["products-services"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("products_services")
                .select("*")
                .order("created_at", { ascending: false });
            if (error) throw error;
            return data;
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            const { error } = await supabase
                .from("products_services")
                .delete()
                .in("id", ids);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["products-services"] });
            setSelectedItems([]);
            toast({ title: "Itens excluídos com sucesso" });
        },
        onError: (error: any) => {
            toast({
                title: "Erro ao excluir",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const filteredItems = items?.filter((item) => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = item.type === activeTab;
        return matchesSearch && matchesType;
    });

    const handleSelectAll = (checked: boolean) => {
        if (checked && filteredItems) {
            setSelectedItems(filteredItems.map((i) => i.id));
        } else {
            setSelectedItems([]);
        }
    };

    const handleSelectItem = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedItems((prev) => [...prev, id]);
        } else {
            setSelectedItems((prev) => prev.filter((i) => i !== id));
        }
    };

    const handleEdit = (item: any) => {
        setItemToEdit(item);
        setIsModalOpen(true);
    };

    const handleAdd = () => {
        setItemToEdit(null);
        setIsModalOpen(true);
    };

    const handleDelete = (id: string) => {
        if (confirm("Tem certeza que deseja excluir este item?")) {
            deleteMutation.mutate([id]);
        }
    };

    const handleBulkDelete = () => {
        if (confirm(`Tem certeza que deseja excluir ${selectedItems.length} itens?`)) {
            deleteMutation.mutate(selectedItems);
        }
    };

    const formatCurrency = (value: number) => {
        if (value === 0) return "Sob Consulta";
        return new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
        }).format(value);
    };

    // Generate and download CSV template
    const handleDownloadTemplate = () => {
        // CSV com BOM para UTF-8 no Excel
        const BOM = '\uFEFF';
        const csvTemplate = `type;name;description;price;stock_quantity;duration_minutes;opportunity_alert_days
product;Exemplo de Produto;Descrição do produto aqui;99.90;100;;30
service;Exemplo de Serviço;Descrição do serviço aqui;150.00;;60;7`;

        const blob = new Blob([BOM + csvTemplate], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'modelo_produtos_servicos.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast({
            title: "Modelo baixado com sucesso!",
            description: "Abra o arquivo no Excel, preencha e salve como CSV."
        });
    };

    // Handle import button click
    const handleImportClick = () => {
        setShowImportDialog(true);
    };

    // Confirm and start file selection
    const handleConfirmImport = () => {
        setShowImportDialog(false);
        fileInputRef.current?.click();
    };

    // Parse CSV and import items
    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Reset file input
        event.target.value = '';

        setIsImporting(true);

        try {
            let text = await file.text();

            // Remove BOM if present
            if (text.charCodeAt(0) === 0xFEFF) {
                text = text.slice(1);
            }

            // Split into lines and filter empty
            const lines = text.split(/\r?\n/).filter(line => line.trim());

            if (lines.length < 2) {
                throw new Error('Arquivo CSV deve conter cabeçalho e pelo menos uma linha de dados.');
            }

            // Parse header (first line)
            const headers = lines[0].split(';').map(h => h.trim().toLowerCase());

            // Validate required columns
            const requiredColumns = ['type', 'name'];
            const missingColumns = requiredColumns.filter(col => !headers.includes(col));
            if (missingColumns.length > 0) {
                throw new Error(`Colunas obrigatórias faltando: ${missingColumns.join(', ')}`);
            }

            // Get column indexes
            const colIndex = {
                type: headers.indexOf('type'),
                name: headers.indexOf('name'),
                description: headers.indexOf('description'),
                price: headers.indexOf('price'),
                stock_quantity: headers.indexOf('stock_quantity'),
                duration_minutes: headers.indexOf('duration_minutes'),
                opportunity_alert_days: headers.indexOf('opportunity_alert_days'),
            };

            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('Usuário não autenticado');

            // Parse data rows (skip header)
            const itemsToInsert: any[] = [];
            const errors: string[] = [];

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(';').map(v => v.trim());
                const rowNum = i + 1;

                const type = values[colIndex.type]?.toLowerCase();
                const name = values[colIndex.name];

                // Validate required fields
                if (!type || !['product', 'service'].includes(type)) {
                    errors.push(`Linha ${rowNum}: tipo inválido (deve ser "product" ou "service")`);
                    continue;
                }
                if (!name) {
                    errors.push(`Linha ${rowNum}: nome é obrigatório`);
                    continue;
                }

                const description = colIndex.description >= 0 ? values[colIndex.description] || null : null;
                const priceText = colIndex.price >= 0 ? values[colIndex.price] : '';
                const stockText = colIndex.stock_quantity >= 0 ? values[colIndex.stock_quantity] : '';
                const durationText = colIndex.duration_minutes >= 0 ? values[colIndex.duration_minutes] : '';
                const alertText = colIndex.opportunity_alert_days >= 0 ? values[colIndex.opportunity_alert_days] : '';

                // Parse price - handle comma as decimal separator
                let price = 0;
                if (priceText) {
                    const normalizedPrice = priceText.replace(',', '.');
                    price = parseFloat(normalizedPrice) || 0;
                }

                itemsToInsert.push({
                    user_id: user.id,
                    type: type as 'product' | 'service',
                    name,
                    description,
                    price,
                    stock_quantity: stockText ? parseInt(stockText) : null,
                    duration_minutes: durationText ? parseInt(durationText) : null,
                    opportunity_alert_days: alertText ? parseInt(alertText) : 0,
                });
            }

            if (errors.length > 0 && itemsToInsert.length === 0) {
                throw new Error(`Erros encontrados:\n${errors.join('\n')}`);
            }

            if (itemsToInsert.length === 0) {
                throw new Error('Nenhum item válido para importar.');
            }

            // Insert items into database
            const { error: insertError } = await supabase
                .from('products_services')
                .insert(itemsToInsert);

            if (insertError) throw insertError;

            // Refresh data
            queryClient.invalidateQueries({ queryKey: ['products-services'] });

            let message = `${itemsToInsert.length} item(ns) importado(s) com sucesso.`;
            if (errors.length > 0) {
                message += ` ${errors.length} linha(s) ignorada(s) por erro.`;
            }

            toast({
                title: "Importação concluída!",
                description: message,
            });

        } catch (error: any) {
            console.error('Import error:', error);
            toast({
                title: "Erro na importação",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <div className="container mx-auto py-4 md:py-8 px-3 md:px-6 space-y-4 md:space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold">Produtos e Serviços</h1>
                    <p className="text-muted-foreground text-sm md:text-base">Gerencie seu catálogo</p>
                </div>
                {!isAgent && (
                    <div className="flex gap-2 flex-wrap">
                        <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="h-8 md:h-9 text-xs md:text-sm px-2 md:px-3 bg-white dark:bg-transparent border border-[#D4D5D6] dark:border-border">
                            <Download className="w-4 h-4 md:mr-2" />
                            <span className="hidden md:inline">Baixar Modelo</span>
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleImportClick} disabled={isImporting} className="h-8 md:h-9 text-xs md:text-sm px-2 md:px-3 bg-white dark:bg-transparent border border-[#D4D5D6] dark:border-border">
                            {isImporting ? (
                                <Loader2 className="w-4 h-4 md:mr-2 animate-spin" />
                            ) : (
                                <Upload className="w-4 h-4 md:mr-2" />
                            )}
                            <span className="hidden md:inline">Importar</span>
                        </Button>
                        <Button size="sm" onClick={handleAdd} className="h-8 md:h-9 text-xs md:text-sm px-2 md:px-3">
                            <Plus className="w-4 h-4 md:mr-2" />
                            <span className="hidden md:inline">Novo Item</span>
                        </Button>
                    </div>
                )}
            </div>

            {/* Hidden file input for import */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileSelect}
            />

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 h-9 bg-white dark:bg-background border border-[#D4D5D6] dark:border-border"
                    />
                </div>
                {selectedItems.length > 0 && !isAgent && !isSupervisor && (
                    <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="h-9 text-xs md:text-sm">
                        <Trash2 className="w-4 h-4 mr-1 md:mr-2" />
                        Excluir ({selectedItems.length})
                    </Button>
                )}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList>
                    <TabsTrigger value="product">Produtos</TabsTrigger>
                    <TabsTrigger value="service">Serviços</TabsTrigger>
                </TabsList>

                <TabsContent value="product" className="mt-4">
                    <div className="border rounded-lg overflow-x-auto bg-white dark:bg-transparent border-[#D4D5D6] dark:border-border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {!isAgent && (
                                        <TableHead className="w-[40px] md:w-[50px]">
                                            <Checkbox
                                                checked={filteredItems?.length ? filteredItems.length === selectedItems.length && filteredItems.length > 0 : false}
                                                onCheckedChange={handleSelectAll}
                                            />
                                        </TableHead>
                                    )}
                                    <TableHead className="min-w-[100px]">Nome</TableHead>
                                    <TableHead className="min-w-[80px]">Valor</TableHead>
                                    <TableHead className="hidden md:table-cell min-w-[150px]">Descrição</TableHead>
                                    <TableHead className="hidden sm:table-cell">Alerta</TableHead>
                                    <TableHead className="hidden sm:table-cell">Estoque</TableHead>
                                    {!isAgent && <TableHead className="text-right">Ações</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8">
                                            <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredItems?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                            Nenhum produto encontrado
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredItems?.map((item) => (
                                        <TableRow key={item.id}>
                                            {!isAgent && (
                                                <TableCell className="py-2 md:py-4">
                                                    <Checkbox
                                                        checked={selectedItems.includes(item.id)}
                                                        onCheckedChange={(checked) => handleSelectItem(item.id, checked as boolean)}
                                                    />
                                                </TableCell>
                                            )}
                                            <TableCell className="font-medium text-sm py-2 md:py-4">{item.name}</TableCell>
                                            <TableCell className="text-sm py-2 md:py-4">{formatCurrency(item.price)}</TableCell>
                                            <TableCell className="hidden md:table-cell max-w-[200px] truncate text-sm py-2 md:py-4" title={item.description}>
                                                {item.description || "-"}
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell text-sm py-2 md:py-4">
                                                {item.opportunity_alert_days > 0 ? (
                                                    <Badge variant="outline" className="text-[10px] md:text-xs">{item.opportunity_alert_days}d</Badge>
                                                ) : (
                                                    "-"
                                                )}
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell text-sm py-2 md:py-4">{item.stock_quantity ?? "-"}</TableCell>
                                            {!isAgent && (
                                                <TableCell className="text-right py-2 md:py-4">
                                                    <div className="flex justify-end gap-1">
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8" onClick={() => handleEdit(item)}>
                                                            <Edit className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                                        </Button>
                                                        {!isSupervisor && (
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8" onClick={() => handleDelete(item.id)}>
                                                                <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-destructive" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>

                <TabsContent value="service" className="mt-4">
                    <div className="border rounded-lg overflow-x-auto bg-white dark:bg-transparent border-[#D4D5D6] dark:border-border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    {!isAgent && (
                                        <TableHead className="w-[40px] md:w-[50px]">
                                            <Checkbox
                                                checked={filteredItems?.length ? filteredItems.length === selectedItems.length && filteredItems.length > 0 : false}
                                                onCheckedChange={handleSelectAll}
                                            />
                                        </TableHead>
                                    )}
                                    <TableHead className="min-w-[100px]">Nome</TableHead>
                                    <TableHead className="min-w-[80px]">Valor</TableHead>
                                    <TableHead className="hidden md:table-cell min-w-[150px]">Descrição</TableHead>
                                    <TableHead className="hidden sm:table-cell">Alerta</TableHead>
                                    <TableHead className="hidden sm:table-cell">Duração</TableHead>
                                    {!isAgent && <TableHead className="text-right">Ações</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8">
                                            <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                                        </TableCell>
                                    </TableRow>
                                ) : filteredItems?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                            Nenhum serviço encontrado
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredItems?.map((item) => (
                                        <TableRow key={item.id}>
                                            {!isAgent && (
                                                <TableCell className="py-2 md:py-4">
                                                    <Checkbox
                                                        checked={selectedItems.includes(item.id)}
                                                        onCheckedChange={(checked) => handleSelectItem(item.id, checked as boolean)}
                                                    />
                                                </TableCell>
                                            )}
                                            <TableCell className="font-medium text-sm py-2 md:py-4">{item.name}</TableCell>
                                            <TableCell className="text-sm py-2 md:py-4">{formatCurrency(item.price)}</TableCell>
                                            <TableCell className="hidden md:table-cell max-w-[200px] truncate text-sm py-2 md:py-4" title={item.description}>
                                                {item.description || "-"}
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell text-sm py-2 md:py-4">
                                                {item.opportunity_alert_days > 0 ? (
                                                    <Badge variant="outline" className="text-[10px] md:text-xs">{item.opportunity_alert_days}d</Badge>
                                                ) : (
                                                    "-"
                                                )}
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell text-sm py-2 md:py-4">{item.duration_minutes ? `${item.duration_minutes}min` : "-"}</TableCell>
                                            {!isAgent && (
                                                <TableCell className="text-right py-2 md:py-4">
                                                    <div className="flex justify-end gap-1">
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8" onClick={() => handleEdit(item)}>
                                                            <Edit className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                                        </Button>
                                                        {!isSupervisor && (
                                                            <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8" onClick={() => handleDelete(item.id)}>
                                                                <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-destructive" />
                                                            </Button>
                                                        )}
                                                    </div>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </TabsContent>
            </Tabs>

            <ProductServiceModal
                open={isModalOpen}
                onOpenChange={setIsModalOpen}
                itemToEdit={itemToEdit}
            />

            {/* Import Confirmation Dialog */}
            <AlertDialog open={showImportDialog} onOpenChange={setShowImportDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <Upload className="w-5 h-5 text-yellow-500" />
                            Atenção
                        </AlertDialogTitle>
                        <AlertDialogDescription className="space-y-3">
                            <p>
                                Essa função só vai funcionar se todos os campos da tabela
                                enviada sejam compatíveis com os campos necessários no
                                banco de dados.
                            </p>
                            <p>
                                Sugerimos que clique no botão <strong>'Baixar Modelo'</strong> e
                                preencha o arquivo para evitar erros.
                            </p>
                            <p className="font-medium">Deseja continuar?</p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmImport}>
                            Continuar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
