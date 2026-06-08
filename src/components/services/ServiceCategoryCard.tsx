import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ServiceClient, ServiceName } from "@/types/services";
import { ServiceApplicationsTable } from "./ServiceApplicationsTable";
import { AddServiceModal } from "./AddServiceModal";

interface ServiceCategoryCardProps {
  categoryId: string;
  categoryName: string;
  serviceNames: ServiceName[];
  applications: ServiceClient[];
}

export const ServiceCategoryCard = ({
  categoryId,
  categoryName,
  serviceNames,
  applications,
}: ServiceCategoryCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const [showAddService, setShowAddService] = useState(false);

  // Get unique services that have applications
  const serviceIds = [...new Set(applications.map((a) => a.service_name_id))];
  const services = serviceNames.filter((s) => serviceIds.includes(s.id));

  const defaultTab = services[0]?.id || "";

  if (services.length === 0) return null;

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      {/* Collapsible Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <h3 className="text-base font-semibold">{categoryName}</h3>
          <span className="text-xs text-muted-foreground">
            {applications.length} aplicação{applications.length !== 1 ? "ões" : ""}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="border-t px-5 py-4">
          <Tabs defaultValue={defaultTab}>
            <div className="flex items-center gap-2 mb-4">
              <TabsList>
                {services.map((svc) => (
                  <TabsTrigger key={svc.id} value={svc.id} className="text-sm">
                    {svc.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
                onClick={() => setShowAddService(true)}
              >
                <Plus className="w-3 h-3" />
                Adicionar Serviço
              </Button>
            </div>

            {services.map((svc) => (
              <TabsContent key={svc.id} value={svc.id}>
                <ServiceApplicationsTable
                  applications={applications.filter(
                    (a) => a.service_name_id === svc.id
                  )}
                  categoryId={categoryId}
                  serviceNameId={svc.id}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}

      <AddServiceModal
        open={showAddService}
        onOpenChange={setShowAddService}
        categoryId={categoryId}
        existingServiceIds={serviceIds}
      />
    </div>
  );
};
