-- Padroniza o nome das aplicações do catálogo (a aplicação não repete o nome do
-- serviço) e cria o helper SQL do nome composto "Serviço - Aplicação".
-- Gêmeos: src/lib/serviceDisplayName.ts e supabase/functions/_shared/service-display-name.ts

-- 1) Helper: nome composto usado pelas RPCs de relatório
create or replace function public.clinvia_full_service_name(
    p_service       text,
    p_application   text,
    p_category_type text default null
) returns text
language sql
immutable
as $$
    select case
        when coalesce(btrim(p_application), '') = '' then coalesce(btrim(p_service), '')
        when coalesce(btrim(p_service), '') = ''     then btrim(p_application)
        when p_category_type = 'direct'              then btrim(p_application)
        when starts_with(
                public.clinvia_normalize_txt(btrim(p_application)),
                public.clinvia_normalize_txt(btrim(p_service))
             )                                       then btrim(p_application)
        else btrim(p_service) || ' - ' || btrim(p_application)
    end
$$;

-- 2) Catálogo padrão (service_catalog_*): a aplicação perde o nome do equipamento
update public.service_catalog_applications a
set name_normal = r.novo,
    name_upper  = upper(r.novo),
    updated_at  = now()
from public.service_catalog_services s,
     (values
        -- Equipamento com consumível
        ('Hifu Linear Z',           'Linear Z face e pescoço - 1 sessão',     'Face e pescoço - 1 sessão'),
        ('Hifu Linear Z',           'Linear Z face - 1 sessão',               'Face - 1 sessão'),
        ('Hifu Linear Z',           'Linear Z corporal - 1 área - 1 sessão',  'Corporal - 1 área - 1 sessão'),
        ('Hifu Ultraformer',        'Ultraformer face e pescoço - 1 sessão',  'Face e pescoço - 1 sessão'),
        ('Hifu Ultraformer',        'Ultraformer face - 1 sessão',            'Face - 1 sessão'),
        ('Hifu Ultraformer',        'Ultraformer corporal - área - 1 sessão', 'Corporal - área - 1 sessão'),
        ('Hifu Ultraformer',        'Ultraformer colágeno face - 1 sessão',   'Colágeno face - 1 sessão'),
        ('Laser CO2 Fraxel Repair', 'CO2 full face com sedação - 1 sessão',   'Full face com sedação - 1 sessão'),
        ('Laser CO2 Fraxel Repair', 'CO2 área pequena - 1 sessão',            'Área pequena - 1 sessão'),
        ('Radiofrequência Density', 'Density face e pescoço - 1 sessão',      'Face e pescoço - 1 sessão'),
        ('Radiofrequência Density', 'Density facial área pequena - 1 sessão', 'Facial área pequena - 1 sessão'),
        ('Radiofrequência Density', 'Density corporal 1 área - 1 sessão',     'Corporal 1 área - 1 sessão'),
        ('Radiofrequência Reverso', 'Reverso - 1 ponteira - 2 sessões',       '1 ponteira - 2 sessões'),
        -- Drug delivery
        ('Exossomos laser',         'Exossomos laser full face',              'Full face'),
        ('PDRN dermatologista',     'PDRN área pequena 1ml - 1 sessão',       'Área pequena 1ml - 1 sessão'),
        ('PDRN dermatologista',     'PDRN full face 2ml',                     'Full face 2ml'),
        ('PDRN laser',              'PDRN laser full face',                   'Full face'),
        -- Injetáveis
        ('Harmonica',               'Harmonica - 1 ampola',                   '1 ampola'),
        ('Fios Aptos',              'Fios Aptos',                             'Aplicação')
     ) as r(servico, antigo, novo)
where s.id = a.service_id
  and public.clinvia_normalize_txt(s.name_normal) = public.clinvia_normalize_txt(r.servico)
  and public.clinvia_normalize_txt(a.name_normal) = public.clinvia_normalize_txt(r.antigo);

-- 3) Clientes que já importaram: só as linhas que ainda estão com o nome do
--    template (nome editado à mão nunca é sobrescrito). A caixa é preservada:
--    quem importou em MAIÚSCULAS continua em MAIÚSCULAS.
update public.services_client sc
set name       = case when sc.name = upper(sc.name) then upper(r.novo) else r.novo end,
    updated_at = now()
from public.service_name sn,
     (values
        ('Hifu Linear Z',           'Linear Z face e pescoço - 1 sessão',     'Face e pescoço - 1 sessão'),
        ('Hifu Linear Z',           'Linear Z face - 1 sessão',               'Face - 1 sessão'),
        ('Hifu Linear Z',           'Linear Z corporal - 1 área - 1 sessão',  'Corporal - 1 área - 1 sessão'),
        ('Hifu Ultraformer',        'Ultraformer face e pescoço - 1 sessão',  'Face e pescoço - 1 sessão'),
        ('Hifu Ultraformer',        'Ultraformer face - 1 sessão',            'Face - 1 sessão'),
        ('Hifu Ultraformer',        'Ultraformer corporal - área - 1 sessão', 'Corporal - área - 1 sessão'),
        ('Hifu Ultraformer',        'Ultraformer colágeno face - 1 sessão',   'Colágeno face - 1 sessão'),
        ('Laser CO2 Fraxel Repair', 'CO2 full face com sedação - 1 sessão',   'Full face com sedação - 1 sessão'),
        ('Laser CO2 Fraxel Repair', 'CO2 área pequena - 1 sessão',            'Área pequena - 1 sessão'),
        ('Radiofrequência Density', 'Density face e pescoço - 1 sessão',      'Face e pescoço - 1 sessão'),
        ('Radiofrequência Density', 'Density facial área pequena - 1 sessão', 'Facial área pequena - 1 sessão'),
        ('Radiofrequência Density', 'Density corporal 1 área - 1 sessão',     'Corporal 1 área - 1 sessão'),
        ('Radiofrequência Reverso', 'Reverso - 1 ponteira - 2 sessões',       '1 ponteira - 2 sessões'),
        ('Exossomos laser',         'Exossomos laser full face',              'Full face'),
        ('PDRN dermatologista',     'PDRN área pequena 1ml - 1 sessão',       'Área pequena 1ml - 1 sessão'),
        ('PDRN dermatologista',     'PDRN full face 2ml',                     'Full face 2ml'),
        ('PDRN laser',              'PDRN laser full face',                   'Full face'),
        ('Harmonica',               'Harmonica - 1 ampola',                   '1 ampola'),
        ('Fios Aptos',              'Fios Aptos',                             'Aplicação')
     ) as r(servico, antigo, novo)
where sn.id = sc.service_name_id
  and public.clinvia_normalize_txt(sn.name) = public.clinvia_normalize_txt(r.servico)
  and public.clinvia_normalize_txt(sc.name) = public.clinvia_normalize_txt(r.antigo);
