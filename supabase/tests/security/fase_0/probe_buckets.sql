-- Inventario de buckets (Fase 0.7): quais sao publicos e quanto guardam.
select 'BUCKET | ' || b.id
       || ' | public=' || b.public::text
       || ' | objetos=' || coalesce((select count(*)::text from storage.objects o where o.bucket_id = b.id), '?')
       || ' | limite=' || coalesce(b.file_size_limit::text, 'sem')
       || ' | criado=' || to_char(b.created_at, 'YYYY-MM-DD') as info
from storage.buckets b
union all
select 'POLICY storage.objects | ' || policyname || ' | cmd=' || cmd
       || ' | roles=' || array_to_string(roles, ',')
       || ' | using=' || coalesce(qual, 'NULL')
       || ' | check=' || coalesce(with_check, 'NULL')
from pg_policies where schemaname = 'storage' and tablename = 'objects'
order by 1;
