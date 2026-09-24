import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GRAPH_VERSION = "v25.0";
serve(async (req)=>{
  const trace = [];
  const log = (step, data)=>trace.push({
      step,
      data
    });
  try {
    const { igsid, recipient } = await req.json();
    log("start", {
      igsid,
      recipient
    });
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: instance, error: instErr } = await supabase.from("instagram_instances").select("id, user_id, access_token, status, account_name").eq("instagram_account_id", recipient).eq("status", "connected").maybeSingle();
    log("lookup_instance", {
      found: !!instance,
      account_name: instance?.account_name,
      user_id: instance?.user_id,
      instErr
    });
    if (!instance) return resp({
      trace,
      error: "no instance"
    });
    const { data: contact, error: contactErr } = await supabase.from("contacts").select("id, user_id, push_name, profile_pic_url").eq("instagram_id", igsid).eq("user_id", instance.user_id).eq("channel", "instagram").maybeSingle();
    log("lookup_contact", {
      found: !!contact,
      contact_id: contact?.id,
      push_name: contact?.push_name,
      contactErr
    });
    if (!contact) return resp({
      trace,
      error: "no contact"
    });
    const u = `https://graph.instagram.com/${GRAPH_VERSION}/${igsid}?fields=name,username,profile_pic&access_token=${instance.access_token}`;
    const r = await fetch(u);
    const profileBody = await r.json();
    log("user_profile_api", {
      status: r.status,
      hasName: !!profileBody.name,
      hasPic: !!profileBody.profile_pic,
      error: profileBody.error
    });
    const resolvedPic = profileBody.profile_pic;
    if (!resolvedPic) return resp({
      trace,
      error: "no pic"
    });
    const imgResp = await fetch(resolvedPic, {
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });
    log("image_download", {
      status: imgResp.status,
      ok: imgResp.ok
    });
    if (!imgResp.ok) return resp({
      trace,
      error: "download failed"
    });
    const blob = await imgResp.blob();
    log("image_blob", {
      size: blob.size,
      type: blob.type
    });
    const fileName = `contact_${contact.id}.jpg`;
    const { error: uploadErr } = await supabase.storage.from("avatars").upload(fileName, blob, {
      contentType: "image/jpeg",
      upsert: true
    });
    log("storage_upload", {
      error: uploadErr ? String(uploadErr.message || uploadErr) : null
    });
    if (uploadErr) return resp({
      trace,
      error: "upload failed"
    });
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(fileName);
    const permanentUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    log("public_url", {
      permanentUrl
    });
    const { error: updateErr } = await supabase.from("contacts").update({
      profile_pic_url: permanentUrl
    }).eq("id", contact.id);
    log("update_contact", {
      error: updateErr ? String(updateErr.message) : null
    });
    return resp({
      success: !updateErr,
      trace,
      finalUrl: permanentUrl
    });
  } catch (err) {
    log("exception", {
      message: err.message
    });
    return resp({
      trace,
      error: err.message
    });
  }
});
function resp(body) {
  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
