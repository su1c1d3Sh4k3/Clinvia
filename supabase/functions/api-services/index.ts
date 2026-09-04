import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import {
    ApiError,
    apiError,
    dbErrorResponse,
    describeDbError,
    missingFields,
    readJsonBody,
    requireApiKey,
    unexpectedErrorResponse,
} from "../_shared/api-errors.ts";
import { buildBookingLink } from "../_shared/booking-link.ts";
import { ConvenioSelection, resolveConvenioSelection } from "../_shared/convenio-schedule.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const { user_id, service_name, conversation_id } = body!;

        const missingUser = missingFields(corsHeaders, body!, ["user_id"],
            "Envie o id da conta (bd_data.user_id no prompt da IA).");
        if (missingUser) return missingUser;

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // convenio="sim" muda a listagem em dois pontos: só sobram as aplicações
        // marcadas para o convênio e o `price` passa a ser o valor de convênio
        // (o particular vai junto em `price_particular` para a IA comparar).
        const convenioSel: ConvenioSelection = await resolveConvenioSelection(supabase, user_id, body!);

        /** Ids das aplicações aptas ao convênio escolhido. null = sem filtro. */
        const loadAptoIds = async (): Promise<Set<string> | null> => {
            if (!convenioSel.requested || !convenioSel.convenio) return null;
            const { data, error } = await supabase
                .from("convenio_servicos")
                .select("service_client_id")
                .eq("convenio_id", convenioSel.convenio.id);
            if (error) {
                throw new ApiError({
                    status: 500,
                    code: "convenio_services_read_failed",
                    message: describeDbError(
                        `listar as aplicações liberadas para o convênio ${convenioSel.convenio.nome}`, error),
                    details: String((error as any)?.message ?? error),
                });
            }
            return new Set((data || []).map((r: any) => String(r.service_client_id)));
        };
        const aptoIds = await loadAptoIds();

        // Só é usado nas mensagens de "não encontrado", para o chamador saber
        // quais valores de service_name esta conta aceita.
        const listAccountServiceNames = async (): Promise<string> => {
            const { data: scRows, error: scErr } = await supabase
                .from("services_client")
                .select("service_name_id")
                .eq("user_id", user_id)
                .eq("status", true);
            if (scErr) {
                console.warn("[api-services]", describeDbError("listar os serviços ativos da conta para sugerir opções", scErr));
                return "(não foi possível listar os serviços desta conta)";
            }
            const ids = [...new Set((scRows || []).map((s: any) => s.service_name_id).filter(Boolean))];
            if (ids.length === 0) return "(nenhum serviço ativo cadastrado nesta conta)";

            const { data: names, error: namesErr } = await supabase
                .from("service_name")
                .select("name")
                .in("id", ids)
                .order("name");
            if (namesErr) {
                console.warn("[api-services]", describeDbError("carregar os nomes dos serviços da conta para sugerir opções", namesErr));
                return "(não foi possível listar os serviços desta conta)";
            }
            return (names || []).map((n: any) => n.name).join(", ") || "(nenhum serviço ativo cadastrado nesta conta)";
        };

        // Link público de agendamento — o token carrega a conexão da conversa
        // (a agenda e o CRM precisam saber em qual funil/instância gravar).
        // O link é acessório: quando não dá para montá-lo, a listagem de serviços
        // continua valendo e o motivo exato vai em `booking_link_error`.
        const generateBookingLink = async (): Promise<{ link: string | null; error?: string }> => {
            if (!conversation_id) return { link: null }; // link não foi pedido

            const { data: conv, error: convError } = await supabase
                .from("conversations")
                .select("contact_id, instance_id, contacts(push_name)")
                .eq("id", conversation_id)
                .eq("user_id", user_id)
                .maybeSingle();

            if (convError) {
                return {
                    link: null,
                    error: describeDbError(`buscar a conversa ${conversation_id} para montar o link de agendamento`, convError),
                };
            }
            if (!conv) {
                return {
                    link: null,
                    error: `Link de agendamento não gerado: nenhuma conversa com id ${conversation_id} pertence ao user_id ${user_id}. Envie o conversation_id da conversa atual (bd_data.conversation_id).`,
                };
            }

            const faltando = [
                !conv.contact_id ? "contact_id (a conversa não está vinculada a um contato)" : null,
                !conv.instance_id ? "instance_id (a conversa não está vinculada a uma conexão de WhatsApp — conversas de Instagram não geram link)" : null,
            ].filter(Boolean) as string[];
            if (faltando.length > 0) {
                return {
                    link: null,
                    error: `Link de agendamento não gerado: a conversa ${conversation_id} está sem ${faltando.join(" e sem ")}. O link precisa desses dados para saber em qual contato e em qual conexão gravar o agendamento.`,
                };
            }

            return {
                link: buildBookingLink({
                    user_id,
                    contact_id: conv.contact_id,
                    contact_name: (conv as any).contacts?.push_name || "",
                    instance_id: conv.instance_id,
                }),
            };
        };

        // If service_name provided: return applications for that service
        if (service_name) {
            // Find the service_name record (level 2) by name (case-insensitive)
            const { data: sn, error: snError } = await supabase
                .from("service_name")
                .select("id, name, category_id")
                .ilike("name", service_name)
                .limit(1)
                .maybeSingle();

            if (snError) {
                return dbErrorResponse(corsHeaders, "service_name_lookup_failed",
                    `buscar o serviço "${service_name}" no cadastro de serviços`, snError);
            }

            if (!sn) {
                return apiError(corsHeaders, {
                    status: 404,
                    code: "service_not_found",
                    message: `Serviço "${service_name}" não encontrado no cadastro de serviços. Confira o nome exato — serviços disponíveis nesta conta: ${await listAccountServiceNames()}.`,
                    extra: { applications: [] },
                });
            }

            // Get category name — acessório (a resposta usa `cat?.name || null`),
            // então falha aqui não pode derrubar a listagem de aplicações.
            const { data: cat, error: catError } = await supabase
                .from("services_category")
                .select("name")
                .eq("id", sn.category_id)
                .single();

            if (catError) {
                console.warn("[api-services]", describeDbError(
                    `buscar a categoria ${sn.category_id} do serviço "${sn.name}"`, catError));
            }

            // Get all active applications for this service
            const { data: apps, error: appsError } = await supabase
                .from("services_client")
                .select("id, name, price, min_price, convenio_price, duration_minutes, description")
                .eq("user_id", user_id)
                .eq("service_name_id", sn.id)
                .eq("status", true)
                .order("name");

            if (appsError) {
                return dbErrorResponse(corsHeaders, "service_applications_read_failed",
                    `listar as aplicações ativas do serviço "${sn.name}" nesta conta`, appsError);
            }

            const visibleApps = aptoIds ? (apps || []).filter((a: any) => aptoIds.has(a.id)) : (apps || []);

            if (aptoIds && visibleApps.length === 0) {
                return apiError(corsHeaders, {
                    status: 409,
                    code: "service_not_convenio",
                    message: `Nenhuma aplicação do serviço "${sn.name}" está liberada para ${convenioSel.catchAll ? "convênio" : `o convênio ${convenioSel.convenio!.nome}`}. Ofereça este serviço como particular (convenio="nao") ou marque as aplicações em Equipe > Convênios.`,
                    extra: { applications: [] },
                });
            }

            const booking = await generateBookingLink();
            if (booking.error) console.warn("[api-services]", booking.error);

            return new Response(
                JSON.stringify({
                    service: sn.name,
                    category: cat?.name || null,
                    convenio: convenioSel.requested ? (convenioSel.convenio?.nome || null) : null,
                    applications: visibleApps.map((a: any) => ({
                        id: a.id,
                        name: a.name,
                        // No modo convênio o preço cobrado é o de convênio; NULL
                        // significa que a clínica não digitou um valor próprio e
                        // o serviço acompanha o particular.
                        price: convenioSel.requested ? (a.convenio_price ?? a.price) : a.price,
                        ...(convenioSel.requested ? { price_particular: a.price } : {}),
                        min_price: a.min_price,
                        duration_minutes: a.duration_minutes,
                        description: a.description,
                    })),
                    ...(booking.link ? { booking_link: booking.link } : {}),
                    ...(booking.error ? { booking_link_error: booking.error } : {}),
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // No service_name: return all services (level 2 names only)
        const { data: allSc, error: scError } = await supabase
            .from("services_client")
            .select("id, service_name_id")
            .eq("user_id", user_id)
            .eq("status", true);

        if (scError) {
            return dbErrorResponse(corsHeaders, "account_services_read_failed",
                `listar os serviços ativos da conta ${user_id}`, scError);
        }

        // No modo convênio o serviço só aparece se pelo menos uma aplicação dele
        // está liberada — senão a IA oferece um serviço que depois vem vazio.
        const scRowsVisible = aptoIds ? (allSc || []).filter((s: any) => aptoIds.has(s.id)) : (allSc || []);
        const snIds = [...new Set(scRowsVisible.map((s: any) => s.service_name_id))];

        if (snIds.length === 0) {
            return new Response(
                JSON.stringify({ services: [] }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const { data: sns, error: snsError } = await supabase
            .from("service_name")
            .select("id, name, category_id")
            .in("id", snIds)
            .order("name");

        // Fatal: é daqui que sai a lista devolvida — engolir o erro devolveria
        // "nenhum serviço" para uma conta que tem serviços cadastrados.
        if (snsError) {
            return dbErrorResponse(corsHeaders, "service_names_read_failed",
                `carregar os nomes dos ${snIds.length} serviços da conta ${user_id}`, snsError);
        }

        const catIds = [...new Set((sns || []).map((s: any) => s.category_id))];
        const { data: cats, error: catsError } = await supabase
            .from("services_category")
            .select("id, name")
            .in("id", catIds);

        // Acessório: sem as categorias a lista sai com `category: null`.
        if (catsError) {
            console.warn("[api-services]", describeDbError(
                "carregar as categorias dos serviços da conta", catsError));
        }

        const catMap = new Map((cats || []).map((c: any) => [c.id, c.name]));

        const booking = await generateBookingLink();
        if (booking.error) console.warn("[api-services]", booking.error);

        return new Response(
            JSON.stringify({
                convenio: convenioSel.requested ? (convenioSel.convenio?.nome || null) : null,
                services: (sns || []).map((s: any) => ({
                    id: s.id,
                    name: s.name,
                    category: catMap.get(s.category_id) || null,
                })),
                ...(booking.link ? { booking_link: booking.link } : {}),
                ...(booking.error ? { booking_link_error: booking.error } : {}),
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de serviços (api-services)", error);
    }
});
