-- Cabeçalho e rodapé do orçamento em PDF.
-- O cabeçalho é uma imagem PNG por conta; o rodapé é texto livre (condições de
-- pagamento, CNPJ, endereço...). Ambos moram em profiles porque é onde já vivem
-- company_name/phone/address — o escopo é a CONTA, não o colaborador.

alter table public.profiles
    add column if not exists orcamento_header_url  text,
    add column if not exists orcamento_footer_text text;

comment on column public.profiles.orcamento_header_url is
    'PNG do cabeçalho do orçamento em PDF (faixa 210x35mm, recomendado 2400x400). Null = cabeçalho de texto com company_name.';
comment on column public.profiles.orcamento_footer_text is
    'Texto livre impresso no rodapé do orçamento em PDF.';

-- ── Bucket do branding da conta ────────────────────────────────────────────
-- Público na leitura (o PDF é gerado no browser e a imagem precisa ser baixada
-- sem sessão), PNG apenas, 2 MB. Caminho: <owner_id>/orcamento-header-*.png
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-branding', 'company-branding', true, 2097152, array['image/png'])
on conflict (id) do update
    set public             = excluded.public,
        file_size_limit    = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists company_branding_read   on storage.objects;
drop policy if exists company_branding_insert on storage.objects;
drop policy if exists company_branding_update on storage.objects;
drop policy if exists company_branding_delete on storage.objects;

create policy company_branding_read on storage.objects
    for select using (bucket_id = 'company-branding');

-- Escrita só na pasta da própria conta. get_owner_id() resolve o dono a partir
-- do team_member logado, então supervisor/atendente com permissão não escrevem
-- na pasta de outro tenant.
create policy company_branding_insert on storage.objects
    for insert with check (
        bucket_id = 'company-branding'
        and (storage.foldername(name))[1] = (select get_owner_id())::text
    );

create policy company_branding_update on storage.objects
    for update using (
        bucket_id = 'company-branding'
        and (storage.foldername(name))[1] = (select get_owner_id())::text
    );

create policy company_branding_delete on storage.objects
    for delete using (
        bucket_id = 'company-branding'
        and (storage.foldername(name))[1] = (select get_owner_id())::text
    );
