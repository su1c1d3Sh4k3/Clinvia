import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * meta-template-manage
 *
 * CRUD for WhatsApp message templates via Meta Cloud API.
 *
 * Actions:
 *   - list:   List templates from Meta + sync to DB
 *   - create: Create a new template on Meta
 *   - delete: Delete a template on Meta
 *   - sync:   Force sync templates from Meta to DB
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API = "https://graph.facebook.com/v22.0";

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        const body = await req.json();
        const { action, user_id, instance_id } = body;

        if (!user_id) throw new Error("Missing field: user_id");
        if (!instance_id) throw new Error("Missing field: instance_id");

        // Get instance (service_role bypasses RLS, no need to filter by user_id)
        const { data: instance, error: instanceError } = await supabase
            .from("instances")
            .select("id, user_id, provider, meta_waba_id, meta_access_token, meta_phone_number_id")
            .eq("id", instance_id)
            .eq("provider", "meta")
            .single();

        if (instanceError || !instance) {
            console.error("[meta-template-manage] Instance lookup failed:", instanceError?.message, "instance_id:", instance_id);
            throw new Error("Meta instance not found");
        }

        const { meta_waba_id: wabaId, meta_access_token: accessToken } = instance;
        if (!wabaId || !accessToken) {
            throw new Error("Meta credentials missing");
        }

        // Use instance owner's user_id for DB operations
        const ownerId = instance.user_id || user_id;

        // ── ACTION: list ──
        if (action === "list" || action === "sync") {
            const metaResp = await fetch(
                `${GRAPH_API}/${wabaId}/message_templates?limit=250`,
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );

            if (!metaResp.ok) {
                const err = await metaResp.text();
                throw new Error(`Failed to list templates: ${err}`);
            }

            const metaData = await metaResp.json();
            const templates = metaData.data || [];

            // Sync to local DB
            for (const tpl of templates) {
                const { error: upsertError } = await supabase
                    .from("message_templates")
                    .upsert(
                        {
                            user_id: ownerId,
                            instance_id,
                            waba_id: wabaId,
                            name: tpl.name,
                            category: tpl.category,
                            language: tpl.language,
                            status: tpl.status,
                            components: tpl.components || [],
                            meta_template_id: tpl.id,
                            rejection_reason: tpl.rejected_reason || null,
                            updated_at: new Date().toISOString(),
                        },
                        { onConflict: "waba_id,name,language" }
                    );

                if (upsertError) {
                    console.warn("[meta-template-manage] Upsert error for", tpl.name, upsertError);
                }
            }

            // Fetch from local DB (includes synced data)
            const { data: localTemplates } = await supabase
                .from("message_templates")
                .select("*")
                .eq("instance_id", instance_id)
                .order("created_at", { ascending: false });

            return new Response(
                JSON.stringify({
                    success: true,
                    count: localTemplates?.length || 0,
                    templates: localTemplates || [],
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ── ACTION: create ──
        if (action === "create") {
            const { name, category, language, components } = body;

            if (!name) throw new Error("Missing field: name");
            if (!category) throw new Error("Missing field: category");
            if (!components) throw new Error("Missing field: components");

            // Validate name format
            if (!/^[a-z0-9_]+$/.test(name)) {
                throw new Error("Template name must be lowercase alphanumeric with underscores only");
            }

            const metaResp = await fetch(
                `${GRAPH_API}/${wabaId}/message_templates`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        name,
                        language: language || "pt_BR",
                        category: category.toUpperCase(),
                        components,
                    }),
                }
            );

            const metaResult = await metaResp.json();

            if (!metaResp.ok) {
                const errorMsg =
                    metaResult?.error?.error_user_msg ||
                    metaResult?.error?.message ||
                    "Failed to create template";
                throw new Error(errorMsg);
            }

            // Save to local DB
            const { data: saved, error: saveError } = await supabase
                .from("message_templates")
                .insert({
                    ownerId,
                    instance_id,
                    waba_id: wabaId,
                    name,
                    category: category.toUpperCase(),
                    language: language || "pt_BR",
                    status: metaResult.status || "PENDING",
                    components,
                    meta_template_id: metaResult.id,
                })
                .select()
                .single();

            if (saveError) {
                console.warn("[meta-template-manage] DB save error:", saveError);
            }

            return new Response(
                JSON.stringify({
                    success: true,
                    template: saved || { id: metaResult.id, name, status: metaResult.status },
                }),
                { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ── ACTION: delete ──
        if (action === "delete") {
            const { name: templateName, template_id } = body;

            if (!templateName) throw new Error("Missing field: name");

            const metaResp = await fetch(
                `${GRAPH_API}/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}`,
                {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${accessToken}` },
                }
            );

            if (!metaResp.ok) {
                const err = await metaResp.text();
                throw new Error(`Failed to delete template: ${err}`);
            }

            // Remove from local DB
            await supabase
                .from("message_templates")
                .delete()
                .eq("waba_id", wabaId)
                .eq("name", templateName);

            return new Response(
                JSON.stringify({ success: true, deleted: templateName }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ── ACTION: send ──
        if (action === "send") {
            const { to, template_name, template_language, template_components } = body;

            if (!to) throw new Error("Missing field: to (phone number)");
            if (!template_name) throw new Error("Missing field: template_name");

            const phoneNumberId = instance.meta_phone_number_id;
            const number = to.replace(/\D/g, "");

            const templatePayload: any = {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: number,
                type: "template",
                template: {
                    name: template_name,
                    language: { code: template_language || "pt_BR" },
                },
            };

            // Add components (body parameters, etc) if provided
            if (template_components && template_components.length > 0) {
                templatePayload.template.components = template_components;
            }

            console.log("[meta-template-manage] Sending template:", template_name, "to:", number);

            const sendResp = await fetch(
                `${GRAPH_API}/${phoneNumberId}/messages`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(templatePayload),
                }
            );

            const sendResult = await sendResp.json();

            if (!sendResp.ok) {
                const errorMsg =
                    sendResult?.error?.error_user_msg ||
                    sendResult?.error?.message ||
                    "Failed to send template";
                console.error("[meta-template-manage] Send failed:", JSON.stringify(sendResult));
                throw new Error(errorMsg);
            }

            const messageId = sendResult.messages?.[0]?.id || null;
            console.log("[meta-template-manage] Template sent, wamid:", messageId);

            return new Response(
                JSON.stringify({
                    success: true,
                    message_id: messageId,
                }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        throw new Error(`Invalid action: "${action}". Valid: list, create, delete, sync, send`);
    } catch (error: any) {
        console.error("[meta-template-manage] Error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
