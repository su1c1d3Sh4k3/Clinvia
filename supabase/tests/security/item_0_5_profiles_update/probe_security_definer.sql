-- As funcoes que escrevem profiles rodam como o OWNER (SECURITY DEFINER) e por
-- isso nao dependem do grant de authenticated. Confirma owner + secdef.
select 'FN | ' || rpad(p.proname, 34) || ' | secdef=' || p.prosecdef::text
       || ' | owner=' || pg_get_userbyid(p.proowner)
       || ' | args=' || pg_get_function_identity_arguments(p.oid) as info
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.proname in ('increment_profile_token_usage','track_token_usage',
                    'track_audio_usage','reset_monthly_tokens',
                    'admin_deactivate_profile','admin_reactivate_profile')
order by p.proname;
