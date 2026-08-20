import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
    buildRecurrenceTemplateName,
    convertRecurrenceMessageToMeta,
    parseRecurrenceTemplateVersion,
} from "../_shared/recurrence-meta-template.ts";

/**
 * recurrence-template-sync (JWT, team-aware)
 *
 * Ao salvar um serviço com mensagens de recorrência, cria/atualiza os templates
 * Meta (MARKETING pt_BR) correspondentes — 1 por mensagem preenchida por
 * instância Meta conectada do owner (plano 2026-08-20, R1/R2).
 *
 * Body: { service_client_ids: string[] }
 * - Sem instância Meta ⇒ no-op (tenant UAZAPI usa texto livre, R10).
 * - Mensagem inalterada com template já submetido (não REJECTED) ⇒ skip.
 * - Alteração ⇒ nova versão v<K+1> (novo nome), remove a anterior na Meta
 *   best-effort e atualiza a MESMA linha em message_templates (índice único
 *   uq_recurrence_template garante 1 linha por serviço+msg+instância).
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json; charset=utf-8",
};

const GRAPH_API = "https://graph.facebook.com/v22.0";

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        // ── Autenticação + owner (team-aware) ──
        const authHeader = req.headers.get("Authorization") || "";
        const { data: { user }, error: userError } = await supabase.auth.getUser(
            authHeader.replace("Bearer ", ""),
        );
        if (userError || !user) return json({ success: false, error: "Não autorizado" }, 401);

        let ownerId = user.id;
        const { data: teamMember } = await supabase
            .from("team_members")
            .select("user_id")
            .eq("auth_user_id", user.id)
            .maybeSingle();
        if (teamMember?.user_id) ownerId = teamMember.user_id;

        const body = await req.json();
        const serviceIds: string[] = Array.isArray(body?.service_client_ids)
            ? body.service_client_ids.filter((id: unknown) => typeof id === "string")
            : [];
        if (serviceIds.length === 0) {
            return json({ success: false, error: "Missing field: service_client_ids" }, 400);
        }

        // ── Instâncias Meta conectadas do owner ──
        const { data: metaInstances } = await supabase
            .from("instances")
            .select("id, meta_waba_id, meta_access_token")
            .eq("user_id", ownerId)
            .eq("provider", "meta")
            .eq("status", "connected");

        const usable = (metaInstances || []).filter((i) => i.meta_waba_id && i.meta_access_token);
        if (usable.length === 0) {
            return json({ success: true, submitted: 0, skipped: 0, errors: [] });
        }

        // ── Serviços do owner ──
        const { data: services, error: svcError } = await supabase
            .from("services_client")
            .select("id, name, msg_recurrence_1, msg_recurrence_2, msg_recurrence_3")
            .eq("user_id", ownerId)
            .in("id", serviceIds.slice(0, 50));
        if (svcError) throw svcError;

        let submitted = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const svc of services || []) {
            for (const msgNumber of [1, 2, 3] as const) {
                const text = (svc as Record<string, unknown>)[`msg_recurrence_${msgNumber}`] as string | null;
                if (!text || !text.trim()) continue;

                const { body: metaBody, variableMap, exampleValues } =
                    convertRecurrenceMessageToMeta(text.trim());

                for (const inst of usable) {
                    try {
                        const { data: existing } = await supabase
                            .from("message_templates")
                            .select("id, name, status, components")
                            .eq("service_client_id", svc.id)
                            .eq("recurrence_msg_number", msgNumber)
                            .eq("instance_id", inst.id)
                            .maybeSingle();

                        // Corpo inalterado e não-rejeitado ⇒ nada a fazer
                        if (existing) {
                            const existingBody = (existing.components || []).find(
                                (c: { type?: string }) => c?.type === "BODY",
                            )?.text;
                            const st = (existing.status || "").toUpperCase();
                            if (existingBody === metaBody && st !== "REJECTED") {
                                skipped++;
                                continue;
                            }
                        }

                        const version = existing
                            ? (parseRecurrenceTemplateVersion(existing.name) ?? 0) + 1
                            : 1;
                        const name = buildRecurrenceTemplateName(svc.id, msgNumber, version);

                        const components = [
                            {
                                type: "BODY",
                                text: metaBody,
                                ...(variableMap.length > 0
                                    ? { example: { body_text: [exampleValues] } }
                                    : {}),
                            },
                        ];

                        const metaResp = await fetch(
                            `${GRAPH_API}/${inst.meta_waba_id}/message_templates`,
                            {
                                method: "POST",
                                headers: {
                                    Authorization: `Bearer ${inst.meta_access_token}`,
                                    "Content-Type": "application/json; charset=utf-8",
                                },
                                body: JSON.stringify({
                                    name,
                                    language: "pt_BR",
                                    category: "MARKETING",
                                    components,
                                }),
                            },
                        );
                        const metaResult = await metaResp.json();

                        if (!metaResp.ok) {
                            const msg = metaResult?.error?.error_user_msg ||
                                metaResult?.error?.message || "Falha ao criar template";
                            errors.push(`${svc.name} (msg ${msgNumber}): ${msg}`);
                            console.error("[recurrence-template-sync] Graph create failed:", svc.id, msgNumber, msg);
                            continue;
                        }

                        // Remove versão anterior na Meta (best-effort)
                        if (existing && existing.name !== name) {
                            fetch(
                                `${GRAPH_API}/${inst.meta_waba_id}/message_templates?name=${encodeURIComponent(existing.name)}`,
                                {
                                    method: "DELETE",
                                    headers: { Authorization: `Bearer ${inst.meta_access_token}` },
                                },
                            ).catch(() => {});
                        }

                        const row = {
                            user_id: ownerId,
                            instance_id: inst.id,
                            waba_id: inst.meta_waba_id,
                            name,
                            category: "MARKETING",
                            language: "pt_BR",
                            status: metaResult.status || "PENDING",
                            components,
                            meta_template_id: metaResult.id,
                            variable_map: variableMap,
                            service_client_id: svc.id,
                            recurrence_msg_number: msgNumber,
                            rejection_reason: null,
                            updated_at: new Date().toISOString(),
                        };

                        const { error: saveError } = existing
                            ? await supabase.from("message_templates").update(row).eq("id", existing.id)
                            : await supabase.from("message_templates").insert(row);
                        if (saveError) {
                            console.warn("[recurrence-template-sync] DB save error:", saveError.message);
                        }
                        submitted++;
                    } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        errors.push(`${svc.name} (msg ${msgNumber}): ${msg}`);
                        console.error("[recurrence-template-sync] Error:", svc.id, msgNumber, msg);
                    }
                }
            }
        }

        return json({ success: true, submitted, skipped, errors });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("[recurrence-template-sync] Fatal:", msg);
        return json({ success: false, error: msg }, 400);
    }
});
