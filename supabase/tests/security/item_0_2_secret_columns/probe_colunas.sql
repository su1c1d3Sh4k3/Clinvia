-- Colunas reais de profiles e quais ficaram sem SELECT para o front.
select 'profiles | ' || c.column_name
       || ' | front le=' || has_column_privilege('authenticated', 'public.profiles',
                                                 c.column_name, 'SELECT')::text as info
from information_schema.columns c
where c.table_schema = 'public' and c.table_name = 'profiles'
order by c.ordinal_position;
