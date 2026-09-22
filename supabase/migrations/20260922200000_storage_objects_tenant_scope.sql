-- Escopo de tenant em storage.objects.
--
-- Estado anterior: 56 policies, quase todas "bucket_id = 'x'" sem filtro nenhum.
-- Consequencias medidas:
--   - anon (chave do bundle, sem login) LISTAVA todos os 72.764 objetos de
--     'media', os 22.692 de 'avatars', os documentos de paciente de
--     'client-documents' e mais 6 buckets;
--   - qualquer usuario logado de QUALQUER tenant podia sobrescrever (UPDATE) ou
--     apagar (DELETE) o bucket 'media' inteiro, o 'chat_media' e os documentos
--     de cliente -- as policies chamadas "own media"/"own client docs" nao
--     tinham clausula de dono;
--   - anon podia INSERIR/ATUALIZAR em 'contact-avatars' e 'contact-photos'
--     (policies "Service ...", roles=public). Quem escreve nesses buckets de
--     verdade e a edge function send-push, com service_role, que ignora RLS.
--
-- O que NAO muda:
--   - Download por URL publica: os 16 buckets continuam public=true e a rota
--     /storage/v1/object/public/... nao avalia RLS. Nenhuma URL ja gravada em
--     messages.media_url, contacts.profile_pic_url, client_documents etc muda.
--   - Edge functions, crons, webhooks e n8n: todos usam service_role, que tem
--     rolbypassrls -- RLS de storage nao os alcanca.
--   - Upload pelas telas: as policies de INSERT que ja tinham filtro correto
--     (avatar proprio, product-images, professional-avatars, quick-messages,
--     company-branding, login-design, template-headers e o upload de midia na
--     conversa do proprio tenant) ficam intactas.
--
-- O front nunca chama .list(), .download() nem .createSignedUrl() (inventario
-- completo de src/ e supabase/functions/): so upload, getPublicUrl e um remove
-- em company-branding. Por isso apertar o SELECT nao pode esvaziar tela.

begin;

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

-- Cast seguro: path de storage nao e confiavel, '3e21175c' ou 'media' quebrariam
-- um ::uuid direto.
create or replace function public.clinvia_uuid_or_null(p_text text)
returns uuid
language sql
immutable
as $$
  select case
    when p_text ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then p_text::uuid
  end;
$$;

comment on function public.clinvia_uuid_or_null(text) is
  'Cast text->uuid que devolve NULL em vez de erro. Usado pelas policies de storage.';

-- Traduz (bucket, path) para "esse arquivo e do meu tenant?".
-- A forma do path foi levantada objeto por objeto (mapas em supabase/.temp/_st_map*.sql):
--   media                : <conversationId>/...            (upload do chat)
--                          media/<conversationId>/...      (71.516 legados dos webhooks)
--                          template-headers/<ownerId>/...  (cabecalho de template Meta)
--   avatars              : contact_<contactId>.jpg | group_<groupId>.jpg
--                          <contactId>_avatar_<ts>.jpg | <authUid>-<rand>.<ext>
--   contact-avatars      : <ownerId>/<contactId>.jpg       (cache do send-push)
--   contact-photos       : contact_<contactId>.jpg
--   chat_media           : <internalChatId>/...            (chat interno)
--   client-documents     : <ownerId>/<contactId|dealId>/<ts>.<ext>
--   deal-attachments     : deal-attachments/<crmDealId>/...
--   patients-docs/photos : <patientId>/...                 (telas legadas de paciente)
--   product-images       : <userId>/<arquivo>
--   professional-avatars : <ownerId>/<arquivo>
--   quick-messages       : <userId>-<rand>.<ext>
--   company-branding     : <ownerId>/orcamento-header.png
--   Bia, manuals, login-design: ativos da plataforma, sem dado de tenant.
create or replace function public.clinvia_storage_is_mine(
  p_bucket text,
  p_name text,
  p_owner uuid default null,
  p_allow_owner boolean default true
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid := public.get_owner_id();
  v_seg   text[];
  v_s1    text;
  v_s2    text;
  v_id    uuid;
begin
  if v_uid is null or p_name is null then
    return false;
  end if;

  -- Arquivo que o proprio usuario subiu. Vale para ler, sobrescrever e apagar,
  -- nunca para criar (senao qualquer path passaria no INSERT).
  if p_allow_owner and p_owner is not null and p_owner = v_uid then
    return true;
  end if;

  if v_owner is null then
    return false;
  end if;

  v_seg := storage.foldername(p_name);
  v_s1  := v_seg[1];
  v_s2  := v_seg[2];

  if p_bucket = 'media' then
    if v_s1 = 'template-headers' then
      return v_s2 = v_owner::text;
    end if;
    v_id := public.clinvia_uuid_or_null(case when v_s1 = 'media' then v_s2 else v_s1 end);
    return v_id is not null and exists (
      select 1 from public.conversations c where c.id = v_id and c.user_id = v_owner
    );

  elsif p_bucket = 'chat_media' then
    v_id := public.clinvia_uuid_or_null(v_s1);
    return v_id is not null and exists (
      select 1 from public.internal_chats t where t.id = v_id and t.user_id = v_owner
    );

  elsif p_bucket in ('client-documents', 'contact-avatars', 'company-branding',
                     'product-images', 'professional-avatars') then
    -- Pasta do dono. O uid tambem serve porque product-images grava a pasta com
    -- o id de quem subiu, que pode ser um colaborador do tenant.
    return v_s1 is not null and v_s1 in (v_owner::text, v_uid::text);

  elsif p_bucket = 'avatars' then
    v_id := public.clinvia_uuid_or_null(left(regexp_replace(p_name, '^(contact_|group_)', ''), 36));
    if v_id is null then
      return false;
    end if;
    if v_id = v_uid or v_id = v_owner then
      return true;
    end if;
    return exists (select 1 from public.contacts c where c.id = v_id and c.user_id = v_owner)
        or exists (select 1 from public.groups g where g.id = v_id and g.user_id = v_owner)
        or exists (select 1 from public.team_members t
                   where t.auth_user_id = v_id and t.user_id = v_owner);

  elsif p_bucket = 'contact-photos' then
    v_id := public.clinvia_uuid_or_null(left(regexp_replace(p_name, '^contact_', ''), 36));
    return v_id is not null and exists (
      select 1 from public.contacts c where c.id = v_id and c.user_id = v_owner
    );

  elsif p_bucket in ('patients-docs', 'patients-photos') then
    v_id := public.clinvia_uuid_or_null(v_s1);
    return v_id is not null and exists (
      select 1 from public.patients p where p.id = v_id and p.user_id = v_owner
    );

  elsif p_bucket = 'deal-attachments' then
    if v_s1 = 'deal-attachments' then
      v_id := public.clinvia_uuid_or_null(v_s2);
      return v_id is not null and exists (
        select 1 from public.crm_deals d where d.id = v_id and d.user_id = v_owner
      );
    end if;
    return v_s1 is not null and v_s1 in (v_owner::text, v_uid::text);

  elsif p_bucket = 'quick-messages' then
    return p_name like v_uid::text || '-%' or p_name like v_owner::text || '-%';
  end if;

  -- Bia, manuals, login-design e qualquer bucket novo: nenhuma escrita por RLS.
  return false;
end;
$$;

comment on function public.clinvia_storage_is_mine(text, text, uuid, boolean) is
  'Decide se um objeto de storage pertence ao tenant do usuario logado, pela forma do path de cada bucket. Usada pelas policies de storage.objects.';

revoke all on function public.clinvia_storage_is_mine(text, text, uuid, boolean) from public;
grant execute on function public.clinvia_storage_is_mine(text, text, uuid, boolean) to authenticated, service_role;
grant execute on function public.clinvia_uuid_or_null(text) to authenticated, anon, service_role;

-- ---------------------------------------------------------------------------
-- 2. Policies abertas que saem
-- ---------------------------------------------------------------------------

-- SELECT: 17 policies sem filtro (10 delas alcancaveis por anon).
drop policy if exists "Allow authenticated view chat_media" on storage.objects;
drop policy if exists "Allow authenticated viewing" on storage.objects;
drop policy if exists "Allow public view chat_media" on storage.objects;
drop policy if exists "Allow public viewing" on storage.objects;
drop policy if exists "Allow view patient docs" on storage.objects;
drop policy if exists "Allow view patient photos" on storage.objects;
drop policy if exists "Anyone can view product images" on storage.objects;
drop policy if exists "Anyone can view professional avatars" on storage.objects;
drop policy if exists "Authenticated users can view deal attachments" on storage.objects;
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Public access to avatars" on storage.objects;
drop policy if exists "Public read client docs" on storage.objects;
drop policy if exists "Public read contact-avatars" on storage.objects;
drop policy if exists "Quick Messages Media Public Access" on storage.objects;
drop policy if exists "company_branding_read" on storage.objects;
drop policy if exists "contact_photos_public_read" on storage.objects;
-- O banner de login e lido pela tela de login por URL publica (a tabela
-- login_design guarda a URL), nunca listando o bucket.
drop policy if exists "login_design_objects_read" on storage.objects;

-- INSERT sem filtro de tenant.
drop policy if exists "Allow authenticated insert chat_media" on storage.objects;
drop policy if exists "Allow upload patient docs" on storage.objects;
drop policy if exists "Allow upload patient photos" on storage.objects;
drop policy if exists "Auth users upload client docs" on storage.objects;
drop policy if exists "Authenticated Upload" on storage.objects;
drop policy if exists "Authenticated users can upload deal attachments" on storage.objects;
-- roles=public: anon conseguia subir arquivo. Quem escreve de verdade e o
-- send-push (service_role).
drop policy if exists "Service upload contact-avatars" on storage.objects;
drop policy if exists "contact_photos_service_write" on storage.objects;

-- UPDATE sem filtro de tenant.
drop policy if exists "Allow authenticated update chat_media" on storage.objects;
drop policy if exists "Authenticated Update" on storage.objects;
drop policy if exists "Authenticated update own media" on storage.objects;
drop policy if exists "Service update contact-avatars" on storage.objects;
drop policy if exists "contact_photos_service_update" on storage.objects;

-- DELETE sem filtro de tenant.
drop policy if exists "Allow authenticated delete chat_media" on storage.objects;
drop policy if exists "Auth users delete own client docs" on storage.objects;
drop policy if exists "Authenticated delete own media" on storage.objects;

-- Policies "auth.uid() = owner" de 4 buckets: protegem a LINHA de quem subiu,
-- mas liberam QUALQUER nome do bucket. O arnes mostrou o efeito: o tenant B
-- criava 'contact_<contatoDeA>.jpg' em avatars (nome que a tela de A depois
-- tenta usar com upsert -- e o upsert de A falharia, porque o dono da linha
-- seria B). Os caminhos reais dessas telas ja passam pelas policies novas
-- (avatar proprio '<uid>-<rand>.<ext>', 'contact_<contatoDoTenant>.jpg',
-- 'group_<grupoDoTenant>.jpg', '<uid|owner>/<arquivo>' e '<uid>-<rand>' em
-- quick-messages), entao nada de upload de tela depende mais delas.
drop policy if exists "Authenticated users can upload avatar" on storage.objects;
drop policy if exists "Authenticated users can update own avatar" on storage.objects;
drop policy if exists "Authenticated users can delete own avatar" on storage.objects;
drop policy if exists "Authenticated users can upload product images" on storage.objects;
drop policy if exists "Authenticated users can update product images" on storage.objects;
drop policy if exists "Authenticated users can delete product images" on storage.objects;
drop policy if exists "Authenticated users can upload professional avatars" on storage.objects;
drop policy if exists "Authenticated users can update professional avatars" on storage.objects;
drop policy if exists "Authenticated users can delete professional avatars" on storage.objects;
drop policy if exists "Users can upload quick messages media" on storage.objects;
drop policy if exists "Users can update their own quick messages media" on storage.objects;
drop policy if exists "Users can delete their own quick messages media" on storage.objects;

-- ---------------------------------------------------------------------------
-- 3. Policies novas, com escopo
-- ---------------------------------------------------------------------------

-- Bia/manuals/login-design sao ativos da plataforma (audios da Bia, manuais e
-- banner de login): sem dado de paciente, seguem listaveis por quem esta logado.
create policy "clinvia_objects_select_scoped"
  on storage.objects for select to authenticated
  using (
    bucket_id in ('Bia', 'manuals', 'login-design')
    or public.clinvia_storage_is_mine(bucket_id, name, owner)
  );

create policy "clinvia_objects_insert_scoped"
  on storage.objects for insert to authenticated
  with check (public.clinvia_storage_is_mine(bucket_id, name, owner, false));

create policy "clinvia_objects_update_scoped"
  on storage.objects for update to authenticated
  using (public.clinvia_storage_is_mine(bucket_id, name, owner))
  with check (public.clinvia_storage_is_mine(bucket_id, name, owner, false));

create policy "clinvia_objects_delete_scoped"
  on storage.objects for delete to authenticated
  using (public.clinvia_storage_is_mine(bucket_id, name, owner));

commit;
