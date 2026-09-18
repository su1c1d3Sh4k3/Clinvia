import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerId } from "@/hooks/useOwnerId";
import { serviceDisplayName } from "@/lib/serviceDisplayName";

/**
 * Catálogo REAL da conta usado pelos simuladores do sandbox.
 *
 * O ambiente de teste é isolado nos dados (tudo em `sandbox_*`), mas o catálogo
 * — salas, procedimentos e convênios — é o de verdade: é justamente o que o
 * cliente quer ver a IA usando.
 */

export interface CatalogoSala {
    id: string;
    name: string;
}

export interface CatalogoServico {
    id: string;
    label: string;
    price: number | null;
    duration_minutes: number | null;
}

export interface CatalogoConvenio {
    id: string;
    nome: string;
}

export function useSandboxCatalog() {
    const { data: ownerId } = useOwnerId();

    return useQuery({
        queryKey: ["sandbox", "catalogo", ownerId],
        enabled: !!ownerId,
        staleTime: 5 * 60 * 1000,
        queryFn: async () => {
            const [salasRes, servicosRes, conveniosRes] = await Promise.all([
                supabase
                    .from("professionals" as any)
                    .select("id, name")
                    .eq("user_id", ownerId!)
                    .eq("active", true)
                    .order("name"),
                supabase
                    .from("services_client" as any)
                    .select(
                        "id, name, price, duration_minutes, servico:service_name(name), categoria:services_category(category_type)",
                    )
                    .eq("user_id", ownerId!)
                    .eq("status", true)
                    .order("name"),
                supabase
                    .from("convenios" as any)
                    .select("id, nome, is_catch_all")
                    .eq("user_id", ownerId!)
                    .eq("active", true)
                    .order("nome"),
            ]);

            if (salasRes.error) throw salasRes.error;
            if (servicosRes.error) throw servicosRes.error;
            if (conveniosRes.error) throw conveniosRes.error;

            const servicos: CatalogoServico[] = ((servicosRes.data || []) as any[]).map((row) => {
                const servico = Array.isArray(row.servico) ? row.servico[0] : row.servico;
                const categoria = Array.isArray(row.categoria) ? row.categoria[0] : row.categoria;
                return {
                    id: row.id,
                    label: serviceDisplayName({
                        serviceName: servico?.name,
                        applicationName: row.name,
                        categoryType: categoria?.category_type,
                    }),
                    price: row.price != null ? Number(row.price) : null,
                    duration_minutes: row.duration_minutes ?? null,
                };
            });

            return {
                salas: ((salasRes.data || []) as any[]).map((s) => ({
                    id: s.id,
                    name: s.name,
                })) as CatalogoSala[],
                servicos,
                // A linha "Habilitar todos" não é um convênio que o paciente possui
                convenios: ((conveniosRes.data || []) as any[])
                    .filter((c) => !c.is_catch_all)
                    .map((c) => ({ id: c.id, nome: c.nome })) as CatalogoConvenio[],
            };
        },
    });
}
