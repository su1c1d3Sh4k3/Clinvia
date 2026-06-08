import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Search, Package } from "lucide-react";
import { useOwnerId } from "@/hooks/useOwnerId";
import { ServiceClient, ServiceName, ServiceCategory } from "@/types/services";
import { ServiceCategoryCard } from "@/components/services/ServiceCategoryCard";
import { AddByCategoryModal } from "@/components/services/AddByCategoryModal";

export default function ProductsServices() {
  const { data: ownerId } = useOwnerId();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  // Fetch all categories (template)
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

  // Fetch all service names (template)
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

  // Fetch client's services
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
      return { categoryId, categoryName: category?.name || "Sem categoria", apps: filtered };
    })
    .filter((group) => group.apps.length > 0);

  const totalApplications = (clientServices || []).length;

  return (
    <div className="container mx-auto py-4 md:py-8 px-3 md:px-6 space-y-4 md:space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Serviços</h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Gerencie suas categorias, serviços e aplicações
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Adicionar Serviço por Categoria
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar aplicações..."
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
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Nenhum serviço cadastrado</h3>
          <p className="text-muted-foreground text-sm max-w-md mb-6">
            Comece adicionando serviços por categoria. Selecione uma categoria,
            escolha os serviços e personalize as aplicações conforme sua necessidade.
          </p>
          <Button onClick={() => setShowAddModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Adicionar Serviço por Categoria
          </Button>
        </div>
      ) : (
        /* Category Cards */
        <div className="space-y-4">
          {filteredCategories.map(({ categoryId, categoryName, apps }) => (
            <ServiceCategoryCard
              key={categoryId}
              categoryId={categoryId}
              categoryName={categoryName}
              serviceNames={(serviceNames || []).filter((s) =>
                apps.some((a) => a.service_name_id === s.id)
              )}
              applications={apps}
            />
          ))}

          {filteredCategories.length === 0 && searchTerm && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nenhuma aplicação encontrada para "{searchTerm}"
            </div>
          )}
        </div>
      )}

      {/* Add By Category Modal */}
      <AddByCategoryModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
      />
    </div>
  );
}
