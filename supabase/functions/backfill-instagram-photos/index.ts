import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req: Request) => {
  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log("[BACKFILL INSTAGRAM PHOTOS] Starting backfill...");

  // 1. Buscar todos os contatos do Instagram sem foto de perfil
  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select("id, instagram_id, push_name, instagram_instance_id, user_id")
    .eq("channel", "instagram")
    .is("profile_pic_url", null)
    .not("instagram_id", "is", null);

  if (contactsError) {
    console.error("[BACKFILL] Error fetching contacts:", contactsError);
    return new Response(JSON.stringify({ error: contactsError.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const total = contacts?.length ?? 0;
  console.log(`[BACKFILL] Found ${total} Instagram contacts without profile photo`);

  if (total === 0) {
    return new Response(
      JSON.stringify({ message: "No contacts need update", updated: 0, total: 0 }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // 2. Buscar todas as instâncias Instagram conectadas (para evitar N+1 queries)
  const { data: instances, error: instancesError } = await supabase
    .from("instagram_instances")
    .select("id, user_id, access_token")
    .eq("status", "connected");

  if (instancesError || !instances || instances.length === 0) {
    console.error("[BACKFILL] No connected Instagram instances found");
    return new Response(
      JSON.stringify({ error: "No connected Instagram instances found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Mapa de instance_id → access_token para acesso rápido
  const instanceMap = new Map(instances.map((i: any) => [i.id, i.access_token]));
  // Mapa fallback por user_id (caso instagram_instance_id seja nulo)
  const instanceByUser = new Map(instances.map((i: any) => [i.user_id, i.access_token]));

  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  // 3. Para cada contato, buscar a foto no Instagram Graph API
  for (const contact of contacts ?? []) {
    const instagram_id = contact.instagram_id;
    if (!instagram_id) continue;

    // Encontrar o access_token pela instância do contato (ou pelo user_id como fallback)
    const accessToken =
      instanceMap.get(contact.instagram_instance_id) ||
      instanceByUser.get(contact.user_id);

    if (!accessToken) {
      console.warn(`[BACKFILL] No access token for contact ${contact.id} (instagram_id: ${instagram_id})`);
      failed++;
      errors.push(`No token for contact ${contact.id}`);
      continue;
    }

    try {
      const profileResponse = await fetch(
        `https://graph.instagram.com/v24.0/${instagram_id}?fields=name,profile_pic&access_token=${accessToken}`
      );

      if (!profileResponse.ok) {
        const errText = await profileResponse.text();
        console.warn(`[BACKFILL] Graph API error for ${instagram_id}: ${profileResponse.status} - ${errText}`);
        failed++;
        errors.push(`Graph API ${profileResponse.status} for ${instagram_id}`);
        continue;
      }

      const profileData = await profileResponse.json();
      const profilePicUrl: string | null = profileData.profile_pic || null;
      const fetchedName: string | null = profileData.name || null;

      if (!profilePicUrl && !fetchedName) {
        console.log(`[BACKFILL] No data returned for ${instagram_id}`);
        failed++;
        continue;
      }

      const updatePayload: Record<string, string> = {};
      if (profilePicUrl) updatePayload.profile_pic_url = profilePicUrl;
      // Atualiza o nome apenas se ainda estiver no placeholder padrão
      if (fetchedName && (!contact.push_name || contact.push_name === "Instagram User")) {
        updatePayload.push_name = fetchedName;
      }

      if (Object.keys(updatePayload).length > 0) {
        const { error: updateError } = await supabase
          .from("contacts")
          .update(updatePayload)
          .eq("id", contact.id);

        if (updateError) {
          console.error(`[BACKFILL] Error updating contact ${contact.id}:`, updateError);
          failed++;
          errors.push(`Update failed for ${contact.id}: ${updateError.message}`);
        } else {
          updated++;
          console.log(`[BACKFILL] Updated contact ${contact.id} (${instagram_id}) - photo: ${!!profilePicUrl}`);
        }
      }

      // Pequeno delay para respeitar rate limits da API do Instagram (200 req/hora por token)
      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (e: any) {
      console.error(`[BACKFILL] Exception for contact ${contact.id}:`, e);
      failed++;
      errors.push(`Exception for ${contact.id}: ${e.message}`);
    }
  }

  const result = {
    message: "Backfill completed",
    total,
    updated,
    failed,
    errors: errors.slice(0, 20), // limitar erros no response
  };

  console.log("[BACKFILL] Done:", result);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json", "Connection": "keep-alive" },
  });
});
