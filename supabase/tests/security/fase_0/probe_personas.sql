-- GARANTIA 3: personas reais para o arnes de teste. Preciso de: dono do tenant A,
-- agente/membro do tenant A, dono do tenant B (outro tenant, com dados), e um
-- admin de plataforma. So ids e papeis — nenhum dado sensivel.
select 'DONO' as papel, p.id::text as auth_uid,
       coalesce(p.company_name, '(sem nome)') as quem,
       (select count(*) from public.groups g where g.user_id = p.id)::text as grupos,
       (select count(*) from public.contacts c where c.user_id = p.id)::text as contatos
from public.profiles p
where p.role <> 'super-admin'
order by 4 desc, 5 desc
limit 6;
