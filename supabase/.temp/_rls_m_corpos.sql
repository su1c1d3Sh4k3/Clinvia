-- ITEM 6 / varredura M: corpos das SECURITY DEFINER sem ancora mais graves,
-- pra confirmar se de fato devolvem/alteram dados de outro tenant so pelo id.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       replace(replace(p.prosrc, E'\n', ' '), '  ', ' ') as corpo
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('cleanup_team_member_data','send_push_notification','admin_get_profile_tokens',
                    'track_token_usage','get_account_usage_report','check_auth_email_exists',
                    'get_last_messages','add_nps_entry','pick_campaign_contacts')
order by p.proname;
