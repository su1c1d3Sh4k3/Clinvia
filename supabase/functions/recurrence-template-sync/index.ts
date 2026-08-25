import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
    buildDefaultRecurrenceTemplateName,
    buildRecurrenceTemplateName,
    convertRecurrenceMessageToMeta,
    parseRecurrenceTemplateVersion,
} from "../_shared/recurrence-meta-template.ts";
import { resolveAccountDefaultMessage } from "../_shared/recurrence-default-messages.ts";

/**
 * recurrence-template-sync (JWT team-aware OU x-api-key interno)
 *
 * Recorrência a nível de SERVIÇO (user rules 2026-08-25):
 * - Template PADRÃO da conta: 3 mensagens (profiles.recurrence_default_msg_N ou
 *   texto embutido) → templates Meta rec_default_msg<N>_v<K>, 1 por instância
 *   Meta conectada. Submetidos no connect da 1ª instância Meta + backfill.
 * - Template PERSONALIZADO por serviço: service_name.msg_recurrence_N
 *   preenchido → rec_<8hex do service_name_id>_msg<N>_v<K>.
 *
 * Body:
 *   { default: true }                  → sincroniza os 3 templates padrão
 *   { service_name_ids: string[] }     → sincroniza customs dos serviços
 *   (podem vir juntos; chamada interna adiciona user_id + x-api-key)
 *
 * - Sem instância Meta ⇒ no-op (tenant UAZAPI usa texto livre, R10).
 * - Corpo inalterado com template já submetido (não REJECTED) ⇒ skip.
 * - Alteração ⇒ nova versão v<K+1> (novo nome), remove a anterior na Meta
 *   best-effort e atualiza a MESMA linha em message_templates (índices únicos
 *   uq_recurrence_template_service / uq_recurrence_template_default).
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
    "Content-Type": "application/json; charset=utf-8",
};

const GRAPH_API = "https://graph.facebook.com/v22.0";

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

interface MetaInstance {
    id: string;
    meta_waba_id: string;
    meta_access_token: string;
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        );

        const body = await req.json();

        // ── Autenticação: interna (x-api-key + user_id) ou JWT team-aware ──
        let ownerId: string | null = null;
        const apiKey = req.headers.get("x-api-key");
        const internalKey = Deno.env.get("SCHEDULING_API_KEY");
        if (apiKey && internalKey && apiKey === internalKey) {
            ownerId = typeof body?.user_id === "string" ? body.user_id : null;
            if (!ownerId) return json({ success: false, error: "Missing field: user_id" }, 400);
        } else {
            const authHeader = req.headers.get("Authorization") || "";
            const { data: { user }, error: userError } = await supabase.auth.getUser(
                authHeader.replace("Bearer ", ""),
            );
            if (userError || !user) return json({ success: false, error: "Não autorizado" }, 401);
            ownerId = user.id;
            const { data: teamMember } = await supabase
                .from("team_members")
                .select("user_id")
                .eq("auth_user_id", user.id)
                .maybeSingle();
            if (teamMember?.user_id) ownerId = teamMember.user_id;
        }

        const serviceIds: string[] = Array.isArray(body?.service_name_ids)
            ? body.service_name_ids.filter((id: unknown) => typeof id === "string")
            : [];
        const syncDefault = body?.default === true;
        if (!syncDefault && serviceIds.length === 0) {
            return json({ success: false, error: "Missing field: service_name_ids or default" }, 400);
        }

        // ── Instâncias Meta conectadas do owner ──
        const { data: metaInstances } = await supabase
            .from("instances")
            .select("id, meta_waba_id, meta_access_token")
            .eq("user_id", ownerId)
            .eq("provider", "meta")
            .eq("status", "connected");

        const usable = (metaInstances || []).filter(
            (i) => i.meta_waba_id && i.meta_access_token,
        ) as MetaInstance[];
        if (usable.length === 0) {
            return json({ success: true, submitted: 0, skipped: 0, errors: [] });
        }

        let submitted = 0;
        let skipped = 0;
        const errors: string[] = [];

        /** Submete/atualiza 1 template (padrão ou de serviço) numa instância. */
        async function syncOne(
            inst: MetaInstance,
            msgNumber: 1 | 2 | 3,
            text: string,
            serviceNameId: string | null,
            label: string,
        ) {
            try {
                const { body: metaBody, variableMap, exampleValues } =
                    convertRecurrenceMessageToMeta(text.trim());

                let lookup = supabase
                    .from("message_templates")
                    .select("id, name, status, components")
                    .eq("user_id", ownerId)
                    .eq("recurrence_msg_number", msgNumber)
                    .eq("instance_id", inst.id);
                lookup = serviceNameId
                    ? lookup.eq("service_name_id", serviceNameId)
                    : lookup.is("service_name_id", null);
                const { data: existing } = await lookup.maybeSingle();

                // Corpo inalterado e não-rejeitado ⇒ nada a fazer
                if (existing) {
                    const existingBody = (existing.components || []).find(
                        (c: { type?: string }) => c?.type === "BODY",
                    )?.text;
                    const st = (existing.status || "").toUpperCase();
                    if (existingBody === metaBody && st !== "REJECTED") {
                        skipped++;
                        return;
                    }
                }

                const version = existing
                    ? (parseRecurrenceTemplateVersion(existing.name) ?? 0) + 1
                    : 1;
                const name = serviceNameId
                    ? buildRecurrenceTemplateName(serviceNameId, msgNumber, version)
                    : buildDefaultRecurrenceTemplateName(msgNumber, version);

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
                    errors.push(`${label} (msg ${msgNumber}): ${msg}`);
                    console.error("[recurrence-template-sync] Graph create failed:", label, msgNumber, msg);
                    return;
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
                    service_name_id: serviceNameId,
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
                errors.push(`${label} (msg ${msgNumber}): ${msg}`);
                console.error("[recurrence-template-sync] Error:", label, msgNumber, msg);
            }
        }

        // ── Template padrão da conta (3 mensagens, sempre existem via fallback) ──
        if (syncDefault) {
            const { data: profile } = await supabase
                .from("profiles")
                .select("recurrence_default_msg_1, recurrence_default_msg_2, recurrence_default_msg_3")
                .eq("id", ownerId)
                .maybeSingle();

            for (const msgNumber of [1, 2, 3] as const) {
                const text = resolveAccountDefaultMessage(
                    msgNumber,
                    (profile as Record<string, string | null> | null)
                        ?.[`recurrence_default_msg_${msgNumber}`],
                );
                for (const inst of usable) {
                    await syncOne(inst, msgNumber, text, null, "Template padrão");
                }
            }
        }

        // ── Templates personalizados por serviço ──
        if (serviceIds.length > 0) {
            const { data: services, error: svcError } = await supabase
                .from("service_name")
                .select("id, name, msg_recurrence_1, msg_recurrence_2, msg_recurrence_3")
                .eq("user_id", ownerId)
                .in("id", serviceIds.slice(0, 50));
            if (svcError) throw svcError;

            for (const svc of services || []) {
                for (const msgNumber of [1, 2, 3] as const) {
                    const text = (svc as Record<string, unknown>)[`msg_recurrence_${msgNumber}`] as
                        | string
                        | null;
                    if (!text || !text.trim()) continue;
                    for (const inst of usable) {
                        await syncOne(inst, msgNumber, text, svc.id, svc.name || "Serviço");
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
