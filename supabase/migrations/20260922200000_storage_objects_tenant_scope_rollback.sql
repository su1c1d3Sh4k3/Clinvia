-- Rollback de 20260922200000_storage_objects_tenant_scope.sql.
-- Recria as 45 policies removidas exatamente como estavam (pg_policies dump em
-- supabase/.temp/_st_policies.txt) e remove as novas. Volta ao estado vulneravel
-- -- usar so se alguma tela de upload quebrar.

begin;

drop policy if exists "clinvia_objects_select_scoped" on storage.objects;
drop policy if exists "clinvia_objects_insert_scoped" on storage.objects;
drop policy if exists "clinvia_objects_update_scoped" on storage.objects;
drop policy if exists "clinvia_objects_delete_scoped" on storage.objects;

-- SELECT
create policy "Allow authenticated view chat_media" on storage.objects for select to authenticated using (bucket_id = 'chat_media');
create policy "Allow authenticated viewing" on storage.objects for select to authenticated using (bucket_id = 'media');
create policy "Allow public view chat_media" on storage.objects for select using (bucket_id = 'chat_media');
create policy "Allow public viewing" on storage.objects for select using (bucket_id = 'media');
create policy "Allow view patient docs" on storage.objects for select to authenticated using (bucket_id = 'patients-docs');
create policy "Allow view patient photos" on storage.objects for select to authenticated using (bucket_id = 'patients-photos');
create policy "Anyone can view product images" on storage.objects for select using (bucket_id = 'product-images');
create policy "Anyone can view professional avatars" on storage.objects for select using (bucket_id = 'professional-avatars');
create policy "Authenticated users can view deal attachments" on storage.objects for select to authenticated using (bucket_id = 'deal-attachments');
create policy "Public Access" on storage.objects for select using (bucket_id = 'avatars');
create policy "Public access to avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "Public read client docs" on storage.objects for select using (bucket_id = 'client-documents');
create policy "Public read contact-avatars" on storage.objects for select using (bucket_id = 'contact-avatars');
create policy "Quick Messages Media Public Access" on storage.objects for select using (bucket_id = 'quick-messages');
create policy "company_branding_read" on storage.objects for select using (bucket_id = 'company-branding');
create policy "contact_photos_public_read" on storage.objects for select using (bucket_id = 'contact-photos');
create policy "login_design_objects_read" on storage.objects for select to anon, authenticated using (bucket_id = 'login-design');

-- INSERT
create policy "Allow authenticated insert chat_media" on storage.objects for insert to authenticated with check (bucket_id = 'chat_media');
create policy "Allow upload patient docs" on storage.objects for insert to authenticated with check (bucket_id = 'patients-docs');
create policy "Allow upload patient photos" on storage.objects for insert to authenticated with check (bucket_id = 'patients-photos');
create policy "Auth users upload client docs" on storage.objects for insert to authenticated with check (bucket_id = 'client-documents');
create policy "Authenticated Upload" on storage.objects for insert to authenticated with check (bucket_id = 'avatars');
create policy "Authenticated users can upload deal attachments" on storage.objects for insert to authenticated with check (bucket_id = 'deal-attachments');
create policy "Service upload contact-avatars" on storage.objects for insert with check (bucket_id = 'contact-avatars');
create policy "contact_photos_service_write" on storage.objects for insert with check (bucket_id = 'contact-photos');

-- UPDATE
create policy "Allow authenticated update chat_media" on storage.objects for update to authenticated using (bucket_id = 'chat_media');
create policy "Authenticated Update" on storage.objects for update to authenticated using (bucket_id = 'avatars');
create policy "Authenticated update own media" on storage.objects for update to authenticated using (bucket_id = 'media') with check (bucket_id = 'media');
create policy "Service update contact-avatars" on storage.objects for update using (bucket_id = 'contact-avatars');
create policy "contact_photos_service_update" on storage.objects for update using (bucket_id = 'contact-photos');

-- DELETE
create policy "Allow authenticated delete chat_media" on storage.objects for delete to authenticated using (bucket_id = 'chat_media');
create policy "Auth users delete own client docs" on storage.objects for delete to authenticated using (bucket_id = 'client-documents');
create policy "Authenticated delete own media" on storage.objects for delete to authenticated using (bucket_id = 'media');

-- As 12 policies "auth.uid() = owner" (roles=public nas de quick-messages).
create policy "Authenticated users can upload avatar" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and auth.uid() = owner);
create policy "Authenticated users can update own avatar" on storage.objects for update to authenticated using (bucket_id = 'avatars' and auth.uid() = owner);
create policy "Authenticated users can delete own avatar" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and auth.uid() = owner);
create policy "Authenticated users can upload product images" on storage.objects for insert to authenticated with check (bucket_id = 'product-images' and auth.uid() = owner);
create policy "Authenticated users can update product images" on storage.objects for update to authenticated using (bucket_id = 'product-images' and auth.uid() = owner);
create policy "Authenticated users can delete product images" on storage.objects for delete to authenticated using (bucket_id = 'product-images' and auth.uid() = owner);
create policy "Authenticated users can upload professional avatars" on storage.objects for insert to authenticated with check (bucket_id = 'professional-avatars' and auth.uid() = owner);
create policy "Authenticated users can update professional avatars" on storage.objects for update to authenticated using (bucket_id = 'professional-avatars' and auth.uid() = owner);
create policy "Authenticated users can delete professional avatars" on storage.objects for delete to authenticated using (bucket_id = 'professional-avatars' and auth.uid() = owner);
create policy "Users can upload quick messages media" on storage.objects for insert with check (bucket_id = 'quick-messages' and auth.uid() = owner);
create policy "Users can update their own quick messages media" on storage.objects for update using (bucket_id = 'quick-messages' and auth.uid() = owner);
create policy "Users can delete their own quick messages media" on storage.objects for delete using (bucket_id = 'quick-messages' and auth.uid() = owner);

commit;
