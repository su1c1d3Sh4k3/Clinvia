import { useState } from "react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { ServiceClient, ServiceName } from "@/types/services";
import { ServiceApplicationsTable } from "./ServiceApplicationsTable";
import { useConvenios } from "@/hooks/useConvenios";

interface ConvenioServicesCardProps {
  /** Aplicações já filtradas pela busca da página. */
  applications: ServiceClient[];
  serviceNames: ServiceName[];
}

/**
 * "Contemplados pelo Convênio" — mesma tabela de aplicações da categoria, só que
 * reagrupada por convênio → serviço → aplicações. Não cria nem apaga nada aqui
 * (`readOnlyStructure`): quem manda na estrutura é a categoria de origem, e o
 * vínculo com o convênio é editado em /equipe?tab=convenios.
 */
export const ConvenioServicesCard = ({
  applications,
  serviceNames,
}: ConvenioServicesCardProps) => {
  const { data: convenios } = useConvenios();
  const [expanded, setExpanded] = useState(false);
  const [openConvenio, setOpenConvenio] = useState<string | null>(null);
  const [openService, setOpenService] = useState<string | null>(null);

  const byConvenio = (convenios || [])
    .map((c) => {
      const apps = applications.filter((a) => c.service_ids.includes(a.id));
      // Um serviço só entra no submenu se alguma aplicação dele está no convênio
      const services = serviceNames
        .filter((s) => apps.some((a) => a.service_name_id === s.id))
        .map((s) => ({ service: s, apps: apps.filter((a) => a.service_name_id === s.id) }));
      return { convenio: c, apps, services };
    })
    .filter((g) => g.apps.length > 0);

  if (byConvenio.length === 0) return null;

  const total = new Set(byConvenio.flatMap((g) => g.apps.map((a) => a.id))).size;

  return (
    <div data-tour="servicos-convenio" className="border rounded-lg overflow-hidden bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h3 className="text-base font-semibold">Contemplados pelo Convênio</h3>
          <span className="text-xs text-muted-foreground">
            {total} aplicaç{total !== 1 ? "ões" : "ão"}
          </span>
        </div>
        <ChevronDown
          className={cn(
            "w-5 h-5 text-muted-foreground transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {expanded && (
        <div className="border-t px-3 py-3 space-y-2 md:px-5 md:py-4">
          {byConvenio.map(({ convenio, apps, services }) => (
            <div key={convenio.id} className="border rounded-md overflow-hidden">
              <button
                onClick={() =>
                  setOpenConvenio(openConvenio === convenio.id ? null : convenio.id)
                }
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  <span className="text-sm font-medium truncate">{convenio.nome}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {apps.length} aplicaç{apps.length !== 1 ? "ões" : "ão"}
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform shrink-0",
                    openConvenio === convenio.id && "rotate-180"
                  )}
                />
              </button>

              {openConvenio === convenio.id && (
                <div className="border-t px-3 py-3 space-y-2">
                  {services.map(({ service, apps: svcApps }) => {
                    const key = `${convenio.id}:${service.id}`;
                    return (
                      <div key={key} className="border rounded-md overflow-hidden bg-background">
                        <button
                          onClick={() => setOpenService(openService === key ? null : key)}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm truncate">{service.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {svcApps.length}
                            </span>
                          </div>
                          <ChevronDown
                            className={cn(
                              "w-4 h-4 text-muted-foreground transition-transform shrink-0",
                              openService === key && "rotate-180"
                            )}
                          />
                        </button>

                        {openService === key && (
                          <div className="border-t px-3 py-3">
                            <ServiceApplicationsTable
                              applications={svcApps}
                              categoryId={svcApps[0].category_id}
                              serviceNameId={service.id}
                              readOnlyStructure
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
