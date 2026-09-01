-- Mescla de contatos duplicados pelo 9o digito do celular.
--
-- REGRAS DO USER:
--   - DDD diferente = pessoas diferentes -> NAO mescla.
--   - Duplicidade real e o mesmo numero cadastrado 2x variando o 9o digito
--     e/ou o sufixo @s.whatsapp.net (ex.: 558281434141 x 5582981434141@s.whatsapp.net).
--
-- Grupo = mesmo user_id + mesmos 8 ultimos digitos + MESMO DDD.
-- Sobrevivente = linha com mais dados anexados (conversas+vendas+agendamentos+cards+docs),
-- desempate pela mais antiga. O NUMERO que fica e o da linha com atividade de entrada
-- mais recente (e o JID que o WhatsApp esta usando de fato hoje), sem sufixo.

set local lock_timeout = '10s';
set local statement_timeout = '600s';

-- ---------------------------------------------------------------- 1. plano
create temp table _mg_rows on commit drop as
with base as (
  select c.id, c.user_id, c.number, c.push_name, c.created_at, c.last_message_time,
         c.patient_id, c.client_stage, c.instance_id,
         regexp_replace(split_part(c.number,'@',1), '\D', '', 'g') as dig
  from public.contacts c
  where c.number !~ '@(lid|broadcast|g\.us)$'
    and c.instagram_id is null
    and coalesce(c.is_group,false) = false
),
b2 as (
  select *, right(dig,8) as last8,
         case when dig ~ '^55' and length(dig) in (12,13) then substr(dig,3,2) end as ddd
  from base where length(dig) >= 8
),
grp as (
  select user_id, last8
  from b2 group by 1,2
  having count(*) > 1 and count(distinct coalesce(ddd,'SEM')) = 1
),
r as (select b2.* from b2 join grp using (user_id,last8)),
carga as (
  select r.*,
    (select count(*) from public.conversations c where c.contact_id=r.id) as convs,
    (select count(*) from public.sales s where s.contact_id=r.id) as vendas,
    (select count(*) from public.appointments a where a.contact_id=r.id) as agend,
    (select count(*) from public.crm_client k where k.contact_id=r.id) as cards,
    (select count(*) from public.client_documents d where d.contact_id=r.id) as docs,
    greatest(
      coalesce((select max(c.last_customer_message_at) from public.conversations c where c.contact_id=r.id), 'epoch'::timestamptz),
      coalesce(r.last_message_time, 'epoch'::timestamptz),
      r.created_at
    ) as ultima_entrada
  from r
)
select *,
  row_number() over (partition by user_id, last8
                     order by (convs+vendas+agend+cards+docs) desc, created_at asc, id asc) as rn_dados,
  row_number() over (partition by user_id, last8
                     order by ultima_entrada desc, created_at desc, id desc) as rn_recente
from carga;

create temp table _mg_pairs on commit drop as
select s.user_id,
       s.id                as survivor_id,
       l.id                as loser_id,
       s.number            as survivor_number_before,
       l.push_name         as loser_push_name,
       l.patient_id        as loser_patient_id,
       (select n.dig from _mg_rows n
         where n.user_id=s.user_id and n.last8=s.last8 and n.rn_recente=1) as numero_canonico
from _mg_rows s
join _mg_rows l on l.user_id=s.user_id and l.last8=s.last8 and l.rn_dados > 1
where s.rn_dados = 1;

-- ------------------------------------------------------------- 2. backup
create table if not exists public.contacts_merge_backup_20260901 (
  merged_at              timestamptz not null default now(),
  user_id                uuid,
  survivor_id            uuid,
  loser_id               uuid,
  survivor_number_before text,
  survivor_number_after  text,
  loser_row              jsonb
);

insert into public.contacts_merge_backup_20260901
  (user_id, survivor_id, loser_id, survivor_number_before, survivor_number_after, loser_row)
select p.user_id, p.survivor_id, p.loser_id, p.survivor_number_before, p.numero_canonico,
       to_jsonb(c.*)
from _mg_pairs p
join public.contacts c on c.id = p.loser_id;

-- ------------------------------------ 3. conversa ativa duplicada na instancia
-- idx_conversations_unique_active(contact_id, instance_id) WHERE status in (pending,open):
-- se os dois lados tem ticket vivo na MESMA conexao, encerra o mais antigo
-- (o atendimento vivo e sempre o de mensagem mais recente).
--
-- O trigger de auto-mensagem de encerramento fica DESLIGADO no meio da
-- manutencao: encerrar ticket aqui e limpeza de cadastro, o cliente nao pode
-- receber "pesquisa de satisfacao" por causa disso.
alter table public.conversations disable trigger trg_conversation_resolved_auto_message;

with viva as (
  select cv.id, cv.instance_id, cv.last_message_at, cv.created_at,
         p.survivor_id
  from _mg_pairs p
  join public.conversations cv on cv.contact_id in (p.survivor_id, p.loser_id)
  where cv.status in ('open','pending')
    and cv.instance_id is not null
),
ranked as (
  select id, row_number() over (
           partition by survivor_id, instance_id
           order by coalesce(last_message_at, created_at) desc, created_at desc
         ) as rn
  from viva
)
update public.conversations cv
   set status = 'resolved',
       resolved_at = coalesce(cv.resolved_at, now()),
       updated_at = now()
from ranked
where ranked.id = cv.id and ranked.rn > 1;

alter table public.conversations enable trigger trg_conversation_resolved_auto_message;

-- ------------------------------------------------- 4. repontar as 16 FKs
-- unique (contact_id, flow_type, appointment_date): remove a sessao repetida do perdedor
delete from public.appointment_confirmation_sessions l
using _mg_pairs p
where l.contact_id = p.loser_id
  and exists (select 1 from public.appointment_confirmation_sessions s
               where s.contact_id = p.survivor_id
                 and s.flow_type = l.flow_type
                 and s.appointment_date is not distinct from l.appointment_date);

-- unique (contact_id, tag_id)
delete from public.contact_tags l
using _mg_pairs p
where l.contact_id = p.loser_id
  and exists (select 1 from public.contact_tags s
               where s.contact_id = p.survivor_id and s.tag_id = l.tag_id);

-- unique (campaign_id, contact_id) where contact_id is not null
delete from public.campaign_contacts l
using _mg_pairs p
where l.contact_id = p.loser_id
  and exists (select 1 from public.campaign_contacts s
               where s.contact_id = p.survivor_id and s.campaign_id = l.campaign_id);

-- uq_crm_client_one_active_per_contact_channel(contact_id, channel_key) where is_active:
-- e checada NO MEIO do UPDATE, entao a desduplicacao tem que vir ANTES do repoint.
-- Sobrevive o card de movimentacao mais recente do canal, olhando os dois lados.
with cand as (
  select k.id, p.survivor_id, k.channel_key, k.stage_changed_at, k.created_at
  from _mg_pairs p
  join public.crm_client k on k.contact_id in (p.survivor_id, p.loser_id)
  where k.is_active
),
ranked as (
  select id, row_number() over (
           partition by survivor_id, channel_key
           order by stage_changed_at desc nulls last, created_at desc
         ) as rn
  from cand
)
update public.crm_client k set is_active = false, updated_at = now()
from ranked where ranked.id = k.id and ranked.rn > 1;

update public.appointment_confirmation_sessions t set contact_id = p.survivor_id from _mg_pairs p where t.contact_id = p.loser_id;
update public.appointments                     t set contact_id = p.survivor_id from _mg_pairs p where t.contact_id = p.loser_id;
update public.campaign_contacts                t set contact_id = p.survivor_id from _mg_pairs p where t.contact_id = p.loser_id;
update public.client_documents                 t set contact_id = p.survivor_id from _mg_pairs p where t.contact_id = p.loser_id;
update public.contact_tags                     t set contact_id = p.survivor_id from _mg_pairs p where t.contact_id = p.loser_id;
update public.conversations                    t set contact_id = p.survivor_id from _mg_pairs p where t.contact_id = p.loser_id;
update public.crm_client                       t set contact_id = p.survivor_id from _mg_pairs p where t.contact_id = p.loser_id;
update public.crm_deals                        t set contact_id = p.survivor_id from _mg_pairs p where t.contact_id = p.loser_id;
update public.delivery_automation_sessions     t set contact_id = p.survivor_id from _mg_pairs p where t.contact_id = p.loser_id;
update public.opportunities                    t set contact_id = p.survivor_id from _mg_pairs p where t.contact_id = p.loser_id;
update public.patients                         t set contact_id = p.survivor_id from _mg_pairs p where t.contact_id = p.loser_id;
update public.recurrence_tracking              t set contact_id = p.survivor_id from _mg_pairs p where t.contact_id = p.loser_id;
update public.revenues                         t set contact_id = p.survivor_id from _mg_pairs p where t.contact_id = p.loser_id;
update public.sales                            t set contact_id = p.survivor_id from _mg_pairs p where t.contact_id = p.loser_id;
update public.tasks                            t set contact_id = p.survivor_id from _mg_pairs p where t.contact_id = p.loser_id;
update public.contacts                         t set linked_contact_id = p.survivor_id from _mg_pairs p where t.linked_contact_id = p.loser_id;

-- ------------------------------- 5. um unico card ativo por contato/canal
with dup as (
  select k.id, row_number() over (
           partition by k.contact_id, k.channel_key
           order by k.stage_changed_at desc nulls last, k.created_at desc
         ) as rn
  from public.crm_client k
  join _mg_pairs p on p.survivor_id = k.contact_id
  where k.is_active
)
update public.crm_client k set is_active = false
from dup where dup.id = k.id and dup.rn > 1;

-- --------------------------- 6. sobrevivente herda o que estiver faltando
update public.contacts s
   set push_name  = coalesce(nullif(s.push_name,''), p.loser_push_name),
       patient_id = coalesce(s.patient_id, p.loser_patient_id)
from _mg_pairs p
where s.id = p.survivor_id;

-- ------------------------------------------------- 7. remove os duplicados
delete from public.contacts c using _mg_pairs p where c.id = p.loser_id;

-- 8. so agora da pra gravar o numero canonico: em boa parte dos pares ele e o
--    numero do proprio perdedor, que ate aqui ainda ocupava (user_id, number).
update public.contacts s
   set number = p.numero_canonico
from _mg_pairs p
where s.id = p.survivor_id and s.number is distinct from p.numero_canonico;
