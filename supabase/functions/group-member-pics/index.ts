import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * group-member-pics
 *
 * Busca server-side as fotos de perfil dos participantes de um grupo na
 * UAZAPI (POST /chat/details {number, preview:true} → imagePreview) e:
 * - persiste em group_members.profile_pic_url (match por últimos 8 dígitos)
 * - retorna o mapa { telefone(dígitos) → url } p/ o GroupInfoModal exibir
 *
 * Server-side de propósito: o frontend não depende de apikey da instância
 * (RLS), CORS ou extensões — e as fotos ficam salvas p/ o inbox.
 *
 * Body: { group_id: string, phones?: string[] }  (phones = dígitos; cap 60)
 */

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

const digits = (s: string) => (s || "").split("@")[0].replace(/\D/g, "");

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL") ?? "",
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );

        // ── Autenticação + resolução do owner (team-aware) ──
        const authHeader = req.headers.get("Authorization") || "";
        const { data: { user }, error: userError } = await supabase.auth.getUser(
            authHeader.replace("Bearer ", "")
        );
        if (userError || !user) return json({ error: "Não autorizado" }, 401);

        let ownerId = user.id;
        const { data: teamMember } = await supabase
            .from("team_members")
            .select("user_id")
            .eq("auth_user_id", user.id)
            .maybeSingle();
        if (teamMember?.user_id) ownerId = teamMember.user_id;

        const { group_id, phones } = await req.json().catch(() => ({}));
        if (!group_id) return json({ error: "group_id é obrigatório" }, 400);

        // ── Grupo do owner + apikey da instância ──
        const { data: group } = await supabase
            .from("groups")
            .select("id, user_id, instance_id")
            .eq("id", group_id)
            .maybeSingle();
        if (!group || group.user_id !== ownerId) return json({ error: "Grupo não encontrado" }, 404);

        const { data: instance } = await supabase
            .from("instances")
            .select("id, apikey")
            .eq("id", group.instance_id)
            .maybeSingle();
        if (!instance?.apikey) return json({ pics: {}, note: "Instância sem apikey" });

        // ── Membros conhecidos (p/ persistência por last8) ──
        const { data: members } = await supabase
            .from("group_members")
            .select("id, number, profile_pic_url")
            .eq("group_id", group.id);
        const memberByLast8 = new Map<string, any>();
        for (const m of members || []) {
            const l8 = digits(m.number).slice(-8);
            if (l8.length === 8) memberByLast8.set(l8, m);
        }

        // ── Alvos: phones do body (participantes exibidos no modal) senão
        //    membros do banco sem foto ──
        let targets: string[] = Array.isArray(phones)
            ? phones.map((p: string) => digits(String(p))).filter((d: string) => d.length >= 8 && d.length <= 15)
            : (members || [])
                .filter((m: any) => !m.profile_pic_url)
                .map((m: any) => digits(m.number))
                .filter((d: string) => d.length >= 8);
        targets = [...new Set(targets)].slice(0, 60);

        const pics: Record<string, string> = {};
        const updates: { id: string; url: string }[] = [];

        for (let i = 0; i < targets.length; i += 6) {
            const batch = targets.slice(i, i + 6);
            await Promise.all(batch.map(async (num) => {
                try {
                    const ctrl = new AbortController();
                    const t = setTimeout(() => ctrl.abort(), 6000);
                    const resp = await fetch("https://clinvia.uazapi.com/chat/details", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", token: instance.apikey },
                        body: JSON.stringify({ number: num, preview: true }),
                        signal: ctrl.signal,
                    });
                    clearTimeout(t);
                    if (!resp.ok) return;
                    const d = await resp.json();
                    const url = d?.imagePreview || d?.image || "";
                    if (!url) return;
                    pics[num] = url;
                    const m = memberByLast8.get(num.slice(-8));
                    if (m && m.profile_pic_url !== url) updates.push({ id: m.id, url });
                } catch (_) { /* privacidade/timeout — segue */ }
            }));
        }

        for (const u of updates) {
            await supabase.from("group_members").update({ profile_pic_url: u.url }).eq("id", u.id);
        }

        console.log(`[group-member-pics] group=${group.id} targets=${targets.length} found=${Object.keys(pics).length} persisted=${updates.length}`);
        return json({ pics, persisted: updates.length });
    } catch (err: any) {
        console.error("[group-member-pics] Error:", err?.message || err);
        return json({ error: err?.message || "Erro interno" }, 500);
    }
});
