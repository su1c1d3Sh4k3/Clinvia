import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

/**
 * api-sale-scheduling-due (n8n tool)
 *
 * Vendas com "Agendamento IA" cujo prazo de contato venceu.
 * Estados de ia_scheduling_status: pendente → vencido → contato_realizado → agendado.
 *
 * Auth: header x-api-key = SCHEDULING_API_KEY
 *
 * Body (JSON):
 *   - user_id (obrigatório)
 *   - action (opcional):
 *       "list" (default) → atualiza pendente→vencido e retorna vendas vencidas
 *       "mark_contacted"  → body.sale_id obrigatório; marca contato_realizado
 */
serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    try {
        const apiKey = req.headers.get("x-api-key");
        const envApiKey = Deno.env.get("SCHEDULING_API_KEY");
        if (!envApiKey || apiKey !== envApiKey) {
            return json({ error: "Unauthorized" }, 401);
        }

        const body = await req.json();
        const userId = body.user_id;
        const action = body.action || "list";

        if (!userId) {
            return json({ success: false, error: "user_id is required" }, 400);
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        if (action === "mark_contacted") {
            const saleId = body.sale_id;
            if (!saleId) {
                return json({ success: false, error: "sale_id is required" }, 400);
            }
            const { data, error } = await supabase
                .from("sales")
                .update({ ia_scheduling_status: "contato_realizado" })
                .eq("id", saleId)
                .eq("user_id", userId)
                .eq("ia_scheduling", true)
                .select("id, ia_scheduling_status")
                .maybeSingle();
            if (error) return json({ success: false, error: error.message }, 500);
            if (!data) return json({ success: false, error: "sale not found" }, 404);
            return json({ success: true, sale: data });
        }

        if (action !== "list") {
            return json({ success: false, error: "invalid action" }, 400);
        }

        // Atualiza pendente → vencido (sale_date + ia_contact_days <= hoje)
        const { error: overdueErr } = await supabase.rpc("update_overdue_ia_scheduling");
        if (overdueErr) {
            console.error("[api-sale-scheduling-due] update_overdue error:", overdueErr);
        }

        const { data: sales, error } = await supabase
            .from("sales")
            .select(
                "id, product_name, service_client_id, sale_date, ia_contact_days, ia_scheduling_status, total_amount, professional_id, contact:contacts!sales_contact_id_fkey(id, push_name, number)"
            )
            .eq("user_id", userId)
            .eq("ia_scheduling", true)
            .eq("ia_scheduling_status", "vencido")
            .is("appointment_id", null)
            .order("sale_date", { ascending: true });

        if (error) {
            console.error("[api-sale-scheduling-due] query error:", error);
            return json({ success: false, error: error.message }, 500);
        }

        const rows = (sales || []).map((s: any) => ({
            sale_id: s.id,
            service_name: s.product_name,
            service_client_id: s.service_client_id,
            sale_date: s.sale_date,
            ia_contact_days: s.ia_contact_days,
            status: s.ia_scheduling_status,
            total_amount: s.total_amount,
            professional_id: s.professional_id,
            contact_id: s.contact?.id ?? null,
            contact_name: s.contact?.push_name ?? null,
            contact_number: s.contact?.number ? String(s.contact.number).split("@")[0] : null,
        }));

        console.log(`[api-sale-scheduling-due] user=${userId} due=${rows.length}`);
        return json({ success: true, count: rows.length, sales: rows });
    } catch (err: any) {
        console.error("[api-sale-scheduling-due] Error:", err);
        return json({ success: false, error: err.message }, 500);
    }
});
