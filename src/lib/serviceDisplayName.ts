// Nome de exibição de um procedimento: "Serviço - Aplicação".
// Regra do user: em TODO lugar que mostra o nome do procedimento (vendas,
// orçamentos, agendamentos, CRM, relatórios, link público, mensagens e APIs),
// o serviço vem junto. Fonte única — o gêmeo Deno vive em
// supabase/functions/_shared/service-display-name.ts e deve ser mantido em sync.
//
// O serviço é omitido quando seria redundante:
//  - a aplicação já começa com (ou é igual a) o nome do serviço;
//  - a categoria é 'direct' (Consultas/Avaliação), onde o service_name é só
//    uma linha de apoio e o nome real está na aplicação.
// Como a composição é ignorada quando a aplicação já começa com o serviço, a
// função é idempotente: aplicá-la duas vezes devolve o mesmo texto.

const normalize = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export interface ServiceDisplayNameInput {
  /** service_name.name — o serviço (ex.: "Hifu Hipro") */
  serviceName?: string | null;
  /** services_client.name — a aplicação/procedimento (ex.: "Face - 1 sessão") */
  applicationName?: string | null;
  /** services_category.category_type — 'standard' | 'direct' */
  categoryType?: string | null;
}

export function serviceDisplayName({
  serviceName,
  applicationName,
  categoryType,
}: ServiceDisplayNameInput): string {
  const service = (serviceName || "").trim();
  const application = (applicationName || "").trim();

  if (!application) return service;
  if (!service) return application;
  if (categoryType === "direct") return application;

  const nService = normalize(service);
  const nApplication = normalize(application);
  if (!nService || nApplication === nService || nApplication.startsWith(nService)) {
    return application;
  }

  return `${service} - ${application}`;
}
