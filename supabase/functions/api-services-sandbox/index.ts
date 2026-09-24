import { serveMonitored } from "../_shared/serve-monitored.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";
import {
    ApiError,
    apiError,
    dbErrorResponse,
    describeDbError,
    readJsonBody,
    requireApiKey,
    unexpectedErrorResponse,
} from "../_shared/api-errors.ts";
import { ConvenioSelection, resolveConvenioSelection } from "../_shared/convenio-schedule.ts";
import { buildSandboxBookingLink, loadSandboxContext, logSandboxCall } from "../_shared/sandbox.ts";

/**
 * api-services-sandbox
 *
 * Gêmea de `api-services` no ambiente de teste. O CATÁLOGO é o real da conta
 * (serviços, aplicações, convênios cadastrados) — é justamente isso que o
 * cliente quer testar. O que muda: o contexto vem de `sandbox_*` e o link de
 * agendamento aponta para o ambiente de teste.
 *
 * Header: x-api-key = SCHEDULING_API_KEY
 * Body: { user_id | conversation_id, service_name?, convenio?, convenio_nome? }
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key, x-origin",
};

serveMonitored("api-services-sandbox", async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const authFail = requireApiKey(req, corsHeaders);
        if (authFail) return authFail;

        const { body, response: bodyFail } = await readJsonBody(req, corsHeaders);
        if (bodyFail) return bodyFail;

        const serviceName: string | undefined = body!.service_name;

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const ctx = await loadSandboxContext(supabase, {
            conversationId: body!.conversation_id,
            userId: body!.user_id,
        });
        const userId = ctx.userId;

        const convenioSel: ConvenioSelection = await resolveConvenioSelection(supabase, userId, body!);

        /** Ids das aplicações aptas ao convênio escolhido. null = sem filtro. */
        const aptoIds = await (async (): Promise<Set<string> | null> => {
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
        })();

        const listAccountServiceNames = async (): Promise<string> => {
            const { data: scRows } = await supabase
                .from("services_client")
                .select("service_name_id")
                .eq("user_id", userId)
                .eq("status", true);
            const ids = [...new Set((scRows || []).map((s: any) => s.service_name_id).filter(Boolean))];
            if (ids.length === 0) return "(nenhum serviço ativo cadastrado nesta conta)";
            const { data: names } = await supabase
                .from("service_name").select("name").in("id", ids).order("name");
            return (names || []).map((n: any) => n.name).join(", ") || "(nenhum serviço ativo cadastrado nesta conta)";
        };

        const bookingLink = buildSandboxBookingLink({
            user_id: userId,
            contact_id: ctx.contact.id,
            contact_name: ctx.contact.push_name || "",
        });

        // ── Um serviço específico: devolve as aplicações ──
        if (serviceName) {
            // Mesmo cuidado de `api-services`: o nome é resolvido DENTRO do
            // catálogo da conta. `service_name` aceita linhas repetidas com o
            // mesmo nome e um `.limit(1)` solto pega qualquer uma — quase
            // sempre uma sem aplicação nenhuma, e a IA do teste ouvia
            // "não encontrado" para um serviço que está ativo na tela.
            const { data: scNameRows, error: scNameError } = await supabase
                .from("services_client")
                .select("service_name_id")
                .eq("user_id", userId)
                .eq("status", true);

            if (scNameError) {
                return dbErrorResponse(corsHeaders, "account_services_read_failed",
                    `listar os serviços ativos da conta ${userId} para encontrar "${serviceName}"`, scNameError, req);
            }

            const accountSnIds = [
                ...new Set((scNameRows || []).map((s: any) => s.service_name_id).filter(Boolean)),
            ];

            const { data: snMatches, error: snError } = accountSnIds.length === 0
                ? { data: [], error: null }
                : await supabase
                    .from("service_name")
                    .select("id, name, category_id")
                    .in("id", accountSnIds)
                    .ilike("name", serviceName)
                    .order("name");

            const sn = (snMatches || [])[0];

            if (snError) {
                return dbErrorResponse(corsHeaders, "service_name_lookup_failed",
                    `buscar o serviço "${serviceName}" no cadastro de serviços`, snError, req);
            }

            if (!sn) {
                await logSandboxCall(supabase, ctx, {
                    function_name: "api-services-sandbox",
                    label: `Procurou o serviço "${serviceName}" e não encontrou`,
                    ok: false,
                    status_code: 404,
                    request: body,
                });
                return apiError(corsHeaders, {
                    status: 404,
                    code: "service_not_found",
                    message: `Serviço "${serviceName}" não encontrado no cadastro de serviços. Confira o nome exato — serviços disponíveis nesta conta: ${await listAccountServiceNames()}.`,
                    extra: { applications: [] },
                });
            }

            const { data: cat } = await supabase
                .from("services_category").select("name").eq("id", sn.category_id).maybeSingle();

            const { data: apps, error: appsError } = await supabase
                .from("services_client")
                .select("id, name, price, min_price, convenio_price, duration_minutes, description")
                .eq("user_id", userId)
                .in("service_name_id", (snMatches || []).map((s: any) => s.id))
                .eq("status", true)
                .order("name");

            if (appsError) {
                return dbErrorResponse(corsHeaders, "service_applications_read_failed",
                    `listar as aplicações ativas do serviço "${sn.name}" nesta conta`, appsError, req);
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

            await logSandboxCall(supabase, ctx, {
                function_name: "api-services-sandbox",
                label: `Consultou as opções de "${sn.name}" (${visibleApps.length} aplicação(ões))`,
                request: body,
            });

            return new Response(
                JSON.stringify({
                    service: sn.name,
                    category: cat?.name || null,
                    convenio: convenioSel.requested ? (convenioSel.convenio?.nome || null) : null,
                    applications: visibleApps.map((a: any) => ({
                        id: a.id,
                        name: a.name,
                        price: convenioSel.requested ? (a.convenio_price ?? a.price) : a.price,
                        ...(convenioSel.requested ? { price_particular: a.price } : {}),
                        min_price: a.min_price,
                        duration_minutes: a.duration_minutes,
                        description: a.description,
                    })),
                    booking_link: bookingLink,
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
        }

        // ── Sem service_name: lista os serviços da conta ──
        const { data: allSc, error: scError } = await supabase
            .from("services_client")
            .select("id, service_name_id")
            .eq("user_id", userId)
            .eq("status", true);

        if (scError) {
            return dbErrorResponse(corsHeaders, "account_services_read_failed",
                `listar os serviços ativos da conta ${userId}`, scError, req);
        }

        const scRowsVisible = aptoIds ? (allSc || []).filter((s: any) => aptoIds.has(s.id)) : (allSc || []);
        const snIds = [...new Set(scRowsVisible.map((s: any) => s.service_name_id))];

        if (snIds.length === 0) {
            await logSandboxCall(supabase, ctx, {
                function_name: "api-services-sandbox",
                label: "Consultou os serviços da clínica (nenhum cadastrado)",
                request: body,
            });
            return new Response(JSON.stringify({ services: [] }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const { data: sns, error: snsError } = await supabase
            .from("service_name")
            .select("id, name, category_id")
            .in("id", snIds)
            .order("name");

        if (snsError) {
            return dbErrorResponse(corsHeaders, "service_names_read_failed",
                `carregar os nomes dos ${snIds.length} serviços da conta ${userId}`, snsError, req);
        }

        const catIds = [...new Set((sns || []).map((s: any) => s.category_id))];
        const { data: cats } = await supabase
            .from("services_category").select("id, name").in("id", catIds);
        const catMap = new Map((cats || []).map((c: any) => [c.id, c.name]));

        await logSandboxCall(supabase, ctx, {
            function_name: "api-services-sandbox",
            label: `Consultou os serviços da clínica (${(sns || []).length} encontrados)`,
            request: body,
        });

        return new Response(
            JSON.stringify({
                convenio: convenioSel.requested ? (convenioSel.convenio?.nome || null) : null,
                services: (sns || []).map((s: any) => ({
                    id: s.id,
                    name: s.name,
                    category: catMap.get(s.category_id) || null,
                })),
                booking_link: bookingLink,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    } catch (error) {
        return unexpectedErrorResponse(corsHeaders, "Falha inesperada na API de serviços do ambiente de teste (api-services-sandbox)", error, req);
    }
});
