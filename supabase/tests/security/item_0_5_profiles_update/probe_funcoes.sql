-- Quem escreve em profiles por dentro do banco? Funcao SECURITY INVOKER chamada
-- por authenticated perderia o privilegio junto com o revoke de coluna.
select 'FN | ' || rpad(p.proname, 46) || ' | secdef=' || p.prosecdef::text
       || ' | mexe em: ' || (
         select string_agg(col, ',') from (
           select c as col from unnest(array['role','status','markup','tokens_total',
             'tokens_monthly','approximate_cost_total','approximate_cost_monthly',
             'audio_cost_total','audio_cost_monthly','openai_token','openai_token_invalid',
             'openai_key_source','openai_project_id','openai_service_account_id',
             'openai_api_key_id','openai_spend_limit_usd','openai_provisioned_at',
             'openai_provision_error','openai_spend_alert_level','openai_spend_alert_sent_at',
             'deactivated_at','deletion_warning_sent_at','created_at']) c
           where p.prosrc ~* ('\m' || c || '\M')
         ) x
       ) as info
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
where p.prosrc ~* 'update\s+(public\.)?profiles'
order by p.prosecdef, p.proname;
