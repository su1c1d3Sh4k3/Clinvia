select pg_get_functiondef(p.oid) as info
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('admin_get_inactive_profiles','admin_get_pending_profiles',
                    'admin_get_team_members','admin_list_client_options')
order by p.proname;
