// =====================================================
// refresh-contact-photos
// =====================================================
// Atualiza profile_pic_url de contatos com URL temporária do WhatsApp
// (pps.whatsapp.net) ou ausente — substituindo por URL permanente do
// Supabase Storage (bucket `avatars`).
//
// Fonte da nova URL: UZAPI POST /chat/details devolve { image, name, ... }
// onde `image` é a URL recém-assinada (oe= timestamp atualizado).
//
// Fluxo por contato:
//   1. POST {server_url}/chat/details {number}  →  data.image
//   2. fetch(data.image) → blob
//   3. supabase.storage.from('avatars').upload(`contact_{id}.jpg`)
//   4. UPDATE contacts SET profile_pic_url = <permanent storage url>
//
// Acionado:
//   • Manualmente (POST sem body) — processa até MAX_PER_RUN contatos
//   • Por pg_cron (1x/dia ou similar) — escalonando por owner
//
// Critérios de elegibilidade (em ordem):
//   - profile_pic_url IS NULL (nunca teve foto)
//   - profile_pic_url LIKE '%pps.whatsapp.net%' (URL temporária)
//   - profile_pic_url LIKE '%/storage/...' SEM verificação (já permanente, skip)
// =====================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
const MAX_PER_RUN = 200; // limite de contatos por execução
const UZAPI_TIMEOUT_MS = 8_000;
const RATE_LIMIT_PER_INSTANCE_MS = 350; // delay entre chamadas UZAPI por instance
function isTemporaryPhotoUrl(url) {
  if (!url) return false;
  return url.includes('pps.whatsapp.net') || url.includes('cdn.whatsapp.net');
}
function normalizeNumber(remoteJid) {
  if (!remoteJid) return null;
  return remoteJid.includes('@') ? remoteJid.split('@')[0] : remoteJid;
}
async function fetchUzapiDetails(serverUrl, apikey, number) {
  const url = `${serverUrl.replace(/\/$/, '')}/chat/details`;
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'token': apikey
      },
      body: JSON.stringify({
        number
      }),
      signal: AbortSignal.timeout(UZAPI_TIMEOUT_MS)
    });
    if (!resp.ok) {
      console.warn(`[refresh-contact-photos] /chat/details ${number} HTTP ${resp.status}`);
      return null;
    }
    const data = await resp.json().catch(()=>null);
    if (!data) return null;
    return {
      image: typeof data.image === 'string' ? data.image : typeof data.imagePreview === 'string' ? data.imagePreview : null,
      name: typeof data.name === 'string' ? data.name : null
    };
  } catch (err) {
    console.warn(`[refresh-contact-photos] /chat/details ${number} exception:`, err?.message);
    return null;
  }
}
async function uploadToStorage(supabase, contactId, photoUrl) {
  try {
    const imgResp = await fetch(photoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Clinvia RefreshPhotos)'
      },
      signal: AbortSignal.timeout(UZAPI_TIMEOUT_MS)
    });
    if (!imgResp.ok) {
      console.warn(`[refresh-contact-photos] download failed (${imgResp.status}) for ${contactId}`);
      return null;
    }
    const blob = await imgResp.blob();
    if (blob.size < 100) {
      console.warn(`[refresh-contact-photos] image too small for ${contactId}`);
      return null;
    }
    const fileName = `contact_${contactId}.jpg`;
    const { error: uploadErr } = await supabase.storage.from('avatars').upload(fileName, blob, {
      contentType: 'image/jpeg',
      upsert: true
    });
    if (uploadErr) {
      console.error(`[refresh-contact-photos] upload error for ${contactId}:`, uploadErr);
      return null;
    }
    const { data: pubData } = supabase.storage.from('avatars').getPublicUrl(fileName);
    return `${pubData.publicUrl}?t=${Date.now()}`;
  } catch (err) {
    console.error(`[refresh-contact-photos] uploadToStorage exception for ${contactId}:`, err);
    return null;
  }
}
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const startedAt = Date.now();
  const summary = {
    candidates_found: 0,
    refreshed_ok: 0,
    skipped_no_image_from_uzapi: 0,
    skipped_no_instance: 0,
    skipped_no_number: 0,
    upload_failed: 0,
    errors: 0,
    elapsed_ms: 0
  };
  try {
    // Carrega contatos elegíveis: foto temporária OU sem foto (mas com instance e número WhatsApp)
    const { data: contacts, error: fetchErr } = await supabase.from('contacts').select('id, number, profile_pic_url, instance_id').eq('channel', 'whatsapp').or('profile_pic_url.is.null,profile_pic_url.ilike.%pps.whatsapp.net%').not('instance_id', 'is', null).not('number', 'is', null).limit(MAX_PER_RUN);
    if (fetchErr) throw fetchErr;
    const candidates = contacts ?? [];
    summary.candidates_found = candidates.length;
    if (candidates.length === 0) {
      summary.elapsed_ms = Date.now() - startedAt;
      return new Response(JSON.stringify({
        success: true,
        summary
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Carrega credenciais das instances envolvidas (1 query)
    const instanceIds = Array.from(new Set(candidates.map((c)=>c.instance_id).filter(Boolean)));
    const { data: instances, error: instErr } = await supabase.from('instances').select('id, server_url, apikey, name').in('id', instanceIds);
    if (instErr) throw instErr;
    const instanceMap = new Map();
    for (const inst of instances ?? []){
      if (inst.server_url && inst.apikey) {
        instanceMap.set(inst.id, inst);
      }
    }
    // Agrupa contatos por instance para serializar chamadas UZAPI (rate-limit por apikey)
    const byInstance = new Map();
    for (const c of candidates){
      if (!c.instance_id || !instanceMap.has(c.instance_id)) {
        summary.skipped_no_instance++;
        continue;
      }
      if (!byInstance.has(c.instance_id)) byInstance.set(c.instance_id, []);
      byInstance.get(c.instance_id).push(c);
    }
    // Processa instances em paralelo, contatos dentro da mesma instance em sequência
    await Promise.all(Array.from(byInstance.entries()).map(async ([instanceId, list])=>{
      const inst = instanceMap.get(instanceId);
      for (const contact of list){
        const number = normalizeNumber(contact.number);
        if (!number) {
          summary.skipped_no_number++;
          continue;
        }
        try {
          const details = await fetchUzapiDetails(inst.server_url, inst.apikey, number);
          if (!details?.image) {
            summary.skipped_no_image_from_uzapi++;
            await new Promise((r)=>setTimeout(r, RATE_LIMIT_PER_INSTANCE_MS));
            continue;
          }
          const permanentUrl = await uploadToStorage(supabase, contact.id, details.image);
          if (!permanentUrl) {
            summary.upload_failed++;
            await new Promise((r)=>setTimeout(r, RATE_LIMIT_PER_INSTANCE_MS));
            continue;
          }
          const updates = {
            profile_pic_url: permanentUrl
          };
          // Atualiza push_name se mudou e estava vazio
          if (details.name) updates.push_name = details.name;
          const { error: updErr } = await supabase.from('contacts').update(updates).eq('id', contact.id);
          if (updErr) {
            console.error(`[refresh-contact-photos] DB update error for ${contact.id}:`, updErr);
            summary.errors++;
          } else {
            summary.refreshed_ok++;
          }
        } catch (err) {
          console.error(`[refresh-contact-photos] error for contact ${contact.id}:`, err);
          summary.errors++;
        }
        // Rate limit por instance (UZAPI)
        await new Promise((r)=>setTimeout(r, RATE_LIMIT_PER_INSTANCE_MS));
      }
    }));
    summary.elapsed_ms = Date.now() - startedAt;
    console.log('[refresh-contact-photos] summary:', JSON.stringify(summary));
    return new Response(JSON.stringify({
      success: true,
      summary
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    summary.elapsed_ms = Date.now() - startedAt;
    console.error('[refresh-contact-photos] fatal:', err);
    return new Response(JSON.stringify({
      success: false,
      error: String(err?.message ?? err),
      summary
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
