import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Plus, Search, Package, Upload, FolderPlus, LayoutTemplate, ShieldCheck } from "lucide-react";
import { ImportWizard } from "@/components/import/ImportWizard";
import { useOwnerId } from "@/hooks/useOwnerId";
import { ServiceClient, ServiceName, ServiceCategory } from "@/types/services";
import { ServiceCategoryCard } from "@/components/services/ServiceCategoryCard";
import { DirectCategoryCard } from "@/components/services/DirectCategoryCard";
import { AddByCategoryModal } from "@/components/services/AddByCategoryModal";
import { AddCategoryModal } from "@/components/services/AddCategoryModal";
import { ServiceTemplatesModal } from "@/components/services/ServiceTemplatesModal";
import { useConvenios, useConvenioServiceIds } from "@/hooks/useConvenios";
import { useUrlTab } from "@/hooks/useUrlTab";
import { cn } from "@/lib/utils";
import { useSuporteTour } from "@/lib/suporteTours";

export default function ProductsServices() {
  const { data: ownerId } = useOwnerId();
  const navigate = useNavigate();
  useSuporteTour();
  const [tab, setTab] = useUrlTab("regulares");
  const [searchTerm, setSearchTerm] = useState("");
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["services-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services_category" as any)
        .select("*")
        .order("name");
      if (error) throw error;
      return data as ServiceCategory[];
    },
  });

  const { data: serviceNames } = useQuery({
    queryKey: ["service-names-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_name" as any)
        .select("*")
        .order("name");
      if (error) throw error;
      return data as ServiceName[];
    },
  });

  const { data: clientServices, isLoading } = useQuery({
    queryKey: ["services-client"],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services_client" as any)
        .select("*")
        .order("name");
      if (error) throw error;
      return data as ServiceClient[];
    },
  });

  // Group client services by category
  const groupedByCategory = (clientServices || []).reduce<
    Record<string, ServiceClient[]>
  >((acc, svc) => {
    if (!acc[svc.category_id]) acc[svc.category_id] = [];
    acc[svc.category_id].push(svc);
    return acc;
  }, {});

  // Filter by search
  const filteredCategories = Object.entries(groupedByCategory)
    .map(([categoryId, apps]) => {
      const category = (categories || []).find((c) => c.id === categoryId);
      const filtered = searchTerm
        ? apps.filter(
            (a) =>
              a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              (a.description || "").toLowerCase().includes(searchTerm.toLowerCase())
          )
        : apps;
      return {
        categoryId,
        categoryName: category?.name || "Sem categoria",
        categoryType: category?.category_type || "standard",
        apps: filtered,
      };
    })
    .filter((group) => group.apps.length > 0);

  // Aba Convênio: MESMA estrutura (categoria > serviços > tabela de aplicações),
  // só que enxergando apenas as aplicações marcadas em /equipe?tab=convenios.
  const { data: convenios } = useConvenios();
  const convenioIds = useConvenioServiceIds();
  const hasConvenios = (convenios || []).length > 0;
  const convenioCategories = filteredCategories
    .map((group) => ({ ...group, apps: group.apps.filter((a) => convenioIds.has(a.id)) }))
    .filter((group) => group.apps.length > 0);
  const onConvenioTab = hasConvenios && tab === "convenio";

  // Find default service_name_id for a direct category (template first, fallback to user-created)
  const getDirectServiceNameId = (categoryId: string) => {
    const inCategory = (serviceNames || []).filter((s) => s.category_id === categoryId);
    const svc = inCategory.find((s) => !s.user_id) || inCategory[0];
    return svc?.id || "";
  };

  const renderCategories = (groups: typeof filteredCategories, readOnly: boolean) =>
    groups.map(({ categoryId, categoryName, categoryType, apps }) =>
      categoryType === "direct" ? (
        <DirectCategoryCard
          key={categoryId}
          categoryId={categoryId}
          categoryName={categoryName}
          serviceNameId={getDirectServiceNameId(categoryId)}
          entries={apps}
          readOnlyStructure={readOnly}
        />
      ) : (
        <ServiceCategoryCard
          key={categoryId}
          categoryId={categoryId}
          categoryName={categoryName}
          serviceNames={(serviceNames || []).filter((s) =>
            apps.some((a) => a.service_name_id === s.id)
          )}
          applications={apps}
          readOnlyStructure={readOnly}
        />
      )
    );

  const totalApplications = (clientServices || []).length;

  return (
    <div className="container mx-auto py-4 md:py-8 px-3 md:px-6 space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4">
        <div>
          <h1 data-tour="servicos-title" className="text-2xl md:text-3xl font-bold">Serviços</h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Gerencie suas categorias, serviços e aplicações
          </p>
        </div>
        {/* A aba Convênio é espelho: cadastrar por ali não vincularia ao plano */}
        <div
          data-tour="servicos-acoes"
          className={cn("flex flex-wrap gap-2", onConvenioTab && "hidden")}
        >
          <Button
            data-tour="servicos-templates"
            onClick={() => setShowTemplatesModal(true)}
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
          >
            <LayoutTemplate className="w-4 h-4" />
            Utilizar templates
          </Button>
          <Button variant="outline" onClick={() => setImportWizardOpen(true)} className="gap-2">
            <Upload className="w-4 h-4" />
            Importar
          </Button>
          <Button variant="outline" onClick={() => setShowAddCategoryModal(true)} className="gap-2">
            <FolderPlus className="w-4 h-4" />
            Adicionar Categoria
          </Button>
          <Button onClick={() => setShowAddModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Adicionar Serviço por Categoria
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative w-full sm:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 h-9 bg-white dark:bg-background border border-[#D4D5D6] dark:border-border"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : totalApplications === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Nenhum serviço cadastrado</h3>
          <p className="text-muted-foreground text-sm max-w-md mb-6">
            Comece adicionando serviços por categoria. Selecione uma categoria,
            escolha os serviços e personalize as aplicações conforme sua necessidade.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              onClick={() => setShowTemplatesModal(true)}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <LayoutTemplate className="w-4 h-4" />
              Utilizar templates
            </Button>
            <Button variant="outline" onClick={() => setShowAddModal(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Adicionar Serviço por Categoria
            </Button>
          </div>
        </div>
      ) : !hasConvenios ? (
        <div className="space-y-4">
          {renderCategories(filteredCategories, false)}

          {filteredCategories.length === 0 && searchTerm && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nenhuma aplicação encontrada para "{searchTerm}"
            </div>
          )}
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="overflow-x-auto flex-nowrap max-w-full justify-start">
            <TabsTrigger value="regulares" className="shrink-0">
              Serviços regulares
            </TabsTrigger>
            <TabsTrigger value="convenio" data-tour="servicos-convenio" className="shrink-0 gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Convênio
            </TabsTrigger>
          </TabsList>

          <TabsContent value="regulares" className="space-y-4 mt-4">
            {renderCategories(filteredCategories, false)}

            {filteredCategories.length === 0 && searchTerm && (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Nenhuma aplicação encontrada para "{searchTerm}"
              </div>
            )}
          </TabsContent>

          <TabsContent value="convenio" className="space-y-4 mt-4">
            {convenioCategories.length > 0 ? (
              renderCategories(convenioCategories, true)
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
                  <ShieldCheck className="w-7 h-7 text-muted-foreground" />
                </div>
                <h3 className="text-base font-semibold mb-1">
                  {searchTerm
                    ? `Nenhuma aplicação de convênio encontrada para "${searchTerm}"`
                    : "Nenhum serviço marcado para convênio"}
                </h3>
                {!searchTerm && (
                  <>
                    <p className="text-muted-foreground text-sm max-w-md mb-4">
                      Marque quais serviços cada convênio atende em Equipe &gt; Convênios.
                      Eles aparecem aqui com a mesma estrutura de categorias, serviços e
                      aplicações.
                    </p>
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => navigate("/equipe?tab=convenios")}
                    >
                      <ShieldCheck className="w-4 h-4" />
                      Abrir Convênios
                    </Button>
                  </>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <AddByCategoryModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
      />

      <AddCategoryModal
        open={showAddCategoryModal}
        onOpenChange={setShowAddCategoryModal}
      />

      <ServiceTemplatesModal
        open={showTemplatesModal}
        onOpenChange={setShowTemplatesModal}
      />

      <ImportWizard
        open={importWizardOpen}
        onOpenChange={setImportWizardOpen}
        type="services"
      />
    </div>
  );
}
