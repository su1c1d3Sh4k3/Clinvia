// Resolve "Serviço - Aplicação" a partir do FK (services_client.id).
// Os snapshots de texto (appointments.service_name, sales.product_name, ...)
// guardam SÓ a aplicação — a composição acontece na leitura.
//
// Editar este arquivo obriga redeploy de TODAS as funções que o importam
// (o bundler do Deno inlina o _shared).

import { serviceDisplayName } from "./service-display-name.ts";

/** (serviceClientId, fallback) => nome composto; fallback quando o FK é nulo/órfão */
export type ServiceLabelResolver = (
  serviceClientId?: string | null,
  fallback?: string | null,
) => string;

const CHUNK = 200;

/**
 * Nunca é fatal: se a consulta falhar, o resolver devolve o snapshot original
 * (mensagem automática/API não pode quebrar por causa do nome de exibição).
 */
export async function createServiceLabelResolver(
  supabase: any,
  serviceClientIds: (string | null | undefined)[],
): Promise<ServiceLabelResolver> {
  const map = new Map<string, string>();
  const ids = [...new Set(serviceClientIds.filter(Boolean) as string[])];

  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("services_client")
      .select("id, name, servico:service_name(name), categoria:services_category(category_type)")
      .in("id", ids.slice(i, i + CHUNK));

    if (error) {
      console.warn("[service-label] falha ao carregar nomes, usando snapshot:", error.message);
      break;
    }

    for (const row of (data || []) as any[]) {
      const servico = Array.isArray(row.servico) ? row.servico[0] : row.servico;
      const categoria = Array.isArray(row.categoria) ? row.categoria[0] : row.categoria;
      map.set(
        row.id,
        serviceDisplayName({
          serviceName: servico?.name,
          applicationName: row.name,
          categoryType: categoria?.category_type,
        }),
      );
    }
  }

  return (serviceClientId, fallback) => {
    const composed = serviceClientId ? map.get(serviceClientId) : undefined;
    return composed || (fallback || "").trim();
  };
}

/** Comparação de nome de serviço: sem acento, sem caixa, espaços colapsados */
export function normalizeServiceText(v: string): string {
  return (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Acha a aplicação pelo nome COMPOSTO ("Serviço - Aplicação"), que é como as
 * APIs devolvem os agendamentos — a IA costuma repetir de volta o que leu.
 * Complementa (não substitui) a busca pelo nome puro da aplicação.
 */
export async function findServiceByDisplayName(
  supabase: any,
  userId: string,
  input: string,
  columns: string,
): Promise<any | null> {
  const { data, error } = await supabase
    .from("services_client")
    .select(`${columns}, servico:service_name(name), categoria:services_category(category_type)`)
    .eq("user_id", userId)
    .eq("status", true);

  if (error || !data) return null;

  const wanted = normalizeServiceText(input);
  for (const row of data as any[]) {
    const servico = Array.isArray(row.servico) ? row.servico[0] : row.servico;
    const categoria = Array.isArray(row.categoria) ? row.categoria[0] : row.categoria;
    const composed = serviceDisplayName({
      serviceName: servico?.name,
      applicationName: row.name,
      categoryType: categoria?.category_type,
    });
    if (normalizeServiceText(composed) === wanted) {
      const { servico: _s, categoria: _c, ...clean } = row;
      return clean;
    }
  }
  return null;
}
