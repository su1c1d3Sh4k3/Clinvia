-- Exclusao de conta sem deixar orfaos.
--
-- Problema: a edge function admin-delete-client carregava uma lista fixa de 25
-- tabelas, escrita a mao, enquanto o schema tem 100 tabelas com coluna de dono.
-- Pior: quase nenhuma FK entre tabelas do tenant e ON DELETE CASCADE (a maioria
-- e SET NULL ou NO ACTION), entao apagar o pai nao apaga o filho -- ele so perde
-- a referencia e fica vivo para sempre. A ultima exclusao deixou, por exemplo,
-- 46 linhas em crm_stage_daily_snapshots e 4 em uazapi_automation_messages.
--
-- Solucao: varredura guiada pelo CATALOGO. As tabelas-alvo sao descobertas em
-- tempo de execucao (public + coluna user_id/owner_id uuid), entao tabela nova
-- entra na limpeza sozinha, sem ninguem lembrar de editar codigo. O delete roda
-- em passadas repetidas, tolerando foreign_key_violation, ate convergir; se
-- sobrar qualquer linha, a funcao levanta excecao -- nunca devolve sucesso falso.

-- ---------------------------------------------------------------------------
-- 1. Quem sao os "donos" de dados desta conta
-- ---------------------------------------------------------------------------
-- Alem do dono, as tabelas por pessoa (active_sessions, internal_chat_participants,
-- push_subscriptions...) guardam o auth_user_id de cada colaborador. O guarda do
-- `not exists` evita atingir alguem que tambem seja dono de outra conta.
create or replace function public.admin_tenant_principal_ids(p_user_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
    select array_agg(distinct id)
    from (
        select p_user_id as id
        union
        select tm.auth_user_id
        from public.team_members tm
        where tm.user_id = p_user_id
          and tm.auth_user_id is not null
          and tm.auth_user_id <> p_user_id
          and not exists (
              select 1 from public.team_members o
              where o.user_id = tm.auth_user_id
          )
    ) s
    where id is not null;
$$;

comment on function public.admin_tenant_principal_ids(uuid) is
'Dono da conta + auth_user_id dos colaboradores que nao sao donos de outra conta.';

-- ---------------------------------------------------------------------------
-- 2. Arquivos do storage que pertencem a conta
-- ---------------------------------------------------------------------------
-- Duas fontes, porque nenhuma sozinha cobre tudo:
--   (a) as URLs gravadas nas colunas de arquivo das tabelas do tenant -- unico
--       jeito de achar objetos do bucket `media`, cujo nome e aleatorio;
--   (b) o proprio caminho/uploader em storage.objects -- pega o que foi subido
--       e depois substituido (avatar trocado, cabecalho de orcamento antigo),
--       que nao esta referenciado por linha nenhuma.
-- Apagar linha de storage.objects NAO apaga o arquivo no bucket, por isso a
-- funcao apenas LISTA: quem remove e a edge function, pela Storage API.
create or replace function public.admin_tenant_storage_paths(p_user_id uuid)
returns table(bucket text, path text)
language plpgsql
security definer
set search_path = public, storage
set statement_timeout = '300s'
as $$
declare
    v_ids   uuid[];
    v_rec   record;
    v_expr  text;
begin
    v_ids := public.admin_tenant_principal_ids(p_user_id);

    create temp table if not exists _tenant_files(bucket text, path text) on commit drop;
    truncate _tenant_files;

    -- (a) URLs gravadas no banco. As colunas sao descobertas pelo catalogo para
    -- que coluna de arquivo nova seja coberta sem editar esta funcao.
    for v_rec in
        select c.relname as tbl, a.attname as col,
               format_type(a.atttypid, null) as typ,
               (select attname from pg_attribute oa
                 where oa.attrelid = c.oid and oa.attname in ('user_id','owner_id')
                   and not oa.attisdropped and oa.atttypid = 'uuid'::regtype
                 limit 1) as owner_col
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        where n.nspname = 'public' and c.relkind = 'r'
          and format_type(a.atttypid, null) in ('text','character varying','text[]')
          and a.attname ~ '(url|photo|pic|image|media|file|avatar|logo|banner|attach|doc|thumb)'
          and exists (
              select 1 from pg_attribute oa
              where oa.attrelid = c.oid and oa.attname in ('user_id','owner_id')
                and not oa.attisdropped and oa.atttypid = 'uuid'::regtype
          )
    loop
        -- unnest() so vale na lista do SELECT, nunca no WHERE: por isso o filtro
        -- do texto fica na camada de fora, sobre o valor ja desempacotado.
        v_expr := case when v_rec.typ = 'text[]'
                       then format('unnest(%I)', v_rec.col)
                       else format('%I::text', v_rec.col) end;

        execute format(
            $q$
            insert into _tenant_files(bucket, path)
            select split_part(u, '/', 1),
                   substring(u from position('/' in u) + 1)
            from (
                -- tira o prefixo public/ ou sign/ e sobra "<bucket>/<caminho>"
                select regexp_replace(
                           split_part(split_part(v, '/storage/v1/object/', 2), '?', 1),
                           '^(public|sign|authenticated)/', ''
                       ) as u
                from (
                    select %s as v from public.%I where %I = any($1)
                ) src
                where v like '%%/storage/v1/object/%%'
            ) s
            where u like '%%/%%'
            $q$,
            v_expr, v_rec.tbl, v_rec.owner_col
        ) using v_ids;
    end loop;

    -- profiles nao tem coluna de dono (a chave e o proprio id), entao entra a mao.
    insert into _tenant_files(bucket, path)
    select split_part(u, '/', 1), substring(u from position('/' in u) + 1)
    from (
        select regexp_replace(
                   split_part(split_part(v, '/storage/v1/object/', 2), '?', 1),
                   '^(public|sign|authenticated)/', ''
               ) as u
        from public.profiles p,
             lateral (values (p.avatar_url), (p.orcamento_header_url)) t(v)
        where p.id = any(v_ids)
          and v like '%/storage/v1/object/%'
    ) s
    where u like '%/%';

    -- (b) objetos do storage enderecados ao tenant: uuid da conta no inicio do
    -- caminho (separador / _ ou -) ou uploader autenticado da conta. Buckets da
    -- plataforma ficam de fora.
    insert into _tenant_files(bucket, path)
    select o.bucket_id, o.name
    from storage.objects o
    where o.bucket_id not in ('Bia', 'manuals', 'login-design')
      and (
        substring(o.name from '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')::uuid = any(v_ids)
        -- owner_id e text nesta versao do storage: casta so o que e uuid
        or nullif(o.owner_id, '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           and o.owner_id::uuid = any(v_ids)
        or o.owner = any(v_ids)
      );

    return query select distinct f.bucket, f.path
                 from _tenant_files f
                 where f.bucket <> '' and f.path <> '';
end;
$$;

comment on function public.admin_tenant_storage_paths(uuid) is
'Lista (bucket, caminho) dos arquivos da conta. Nao apaga: storage.objects nao remove o arquivo do bucket.';

-- ---------------------------------------------------------------------------
-- 3. A varredura
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_tenant_data(
    p_user_id  uuid,
    p_dry_run  boolean default true
)
returns table(objeto text, linhas bigint)
language plpgsql
security definer
set search_path = public
set statement_timeout = '600s'
set lock_timeout = '30s'
as $$
declare
    v_claims  text;
    v_ids     uuid[];
    v_rec     record;
    v_n       bigint;
    v_pass    int := 0;
    v_moveu   boolean;
    v_bypass  boolean := false;
    v_resta   text;
begin
    -- Quem pode chamar: a plataforma (service_role) ou um super admin. Conexao
    -- direta ao banco (sem claims de JWT) passa -- quem tem credencial do banco
    -- ja tem acesso total.
    v_claims := nullif(current_setting('request.jwt.claims', true), '');
    if v_claims is not null
       and coalesce(v_claims::jsonb ->> 'role', '') <> 'service_role'
       and not public.is_super_admin() then
        raise exception 'apenas a plataforma pode excluir os dados de uma conta'
            using errcode = '42501';
    end if;

    if p_user_id is null then
        raise exception 'p_user_id e obrigatorio' using errcode = '22004';
    end if;

    v_ids := public.admin_tenant_principal_ids(p_user_id);

    -- `if not exists` + truncate: dry run e execucao real podem acontecer na
    -- mesma sessao, e temp table sobrevive ao fim da chamada.
    create temp table if not exists _del_alvo(
        tbl       text primary key,
        col       text not null,
        restantes bigint not null default 0,
        apagadas  bigint not null default 0
    ) on commit drop;
    truncate _del_alvo;

    -- Alvos vindos do catalogo: tabela nova com user_id/owner_id entra sozinha.
    insert into _del_alvo(tbl, col)
    select distinct on (c.relname) c.relname, a.attname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
      and a.attname in ('user_id','owner_id')
      and a.atttypid = 'uuid'::regtype
    order by c.relname, a.attname;

    -- ---- Chaves de tenant que nao se chamam user_id -----------------------
    -- Estas precisam sair ANTES da varredura: a ligacao com a conta se perde
    -- quando instances/appointments/sales/profiles forem apagados.
    create temp table if not exists _del_extra(tbl text, apagadas bigint) on commit drop;
    truncate _del_extra;

    if not p_dry_run then
        delete from public.webhook_queue
        where instance_name in (
            select i.instance_name from public.instances i where i.user_id = any(v_ids)
        );
        get diagnostics v_n = row_count;
        insert into _del_extra values ('webhook_queue (instance_name)', v_n);

        delete from public._reminder_log
        where item_id in (
            select a.id from public.appointments a where a.user_id = any(v_ids)
            union all
            select s.id from public.sales s where s.user_id = any(v_ids)
        );
        get diagnostics v_n = row_count;
        insert into _del_extra values ('_reminder_log (item_id)', v_n);

        delete from public.pending_signups
        where email in (select p.email from public.profiles p where p.id = any(v_ids));
        get diagnostics v_n = row_count;
        insert into _del_extra values ('pending_signups (email)', v_n);

        delete from public.active_sessions where auth_user_id = any(v_ids);
        get diagnostics v_n = row_count;
        insert into _del_extra values ('active_sessions (auth_user_id)', v_n);

        delete from public.bia_chat_history where auth_user_id = any(v_ids);
        get diagnostics v_n = row_count;
        insert into _del_extra values ('bia_chat_history (auth_user_id)', v_n);

        delete from public."cache_ permanent_memory"
        where user_id = any(array(select x::text from unnest(v_ids) x));
        get diagnostics v_n = row_count;
        insert into _del_extra values ('cache_ permanent_memory (user_id text)', v_n);

        delete from public.token_monthly_history where profile_id = any(v_ids);
        get diagnostics v_n = row_count;
        insert into _del_extra values ('token_monthly_history (profile_id)', v_n);
    else
        insert into _del_extra
        select 'webhook_queue (instance_name)', count(*) from public.webhook_queue
        where instance_name in (select i.instance_name from public.instances i where i.user_id = any(v_ids));
        insert into _del_extra
        select '_reminder_log (item_id)', count(*) from public._reminder_log
        where item_id in (
            select a.id from public.appointments a where a.user_id = any(v_ids)
            union all select s.id from public.sales s where s.user_id = any(v_ids));
        insert into _del_extra
        select 'pending_signups (email)', count(*) from public.pending_signups
        where email in (select p.email from public.profiles p where p.id = any(v_ids));
        insert into _del_extra
        select 'active_sessions (auth_user_id)', count(*) from public.active_sessions
        where auth_user_id = any(v_ids);
        insert into _del_extra
        select 'bia_chat_history (auth_user_id)', count(*) from public.bia_chat_history
        where auth_user_id = any(v_ids);
        insert into _del_extra
        select 'cache_ permanent_memory (user_id text)', count(*) from public."cache_ permanent_memory"
        where user_id = any(array(select x::text from unnest(v_ids) x));
        insert into _del_extra
        select 'token_monthly_history (profile_id)', count(*) from public.token_monthly_history
        where profile_id = any(v_ids);
    end if;

    -- ---- Contagem inicial -------------------------------------------------
    for v_rec in select tbl, col from _del_alvo loop
        execute format('select count(*) from public.%I where %I = any($1)', v_rec.tbl, v_rec.col)
            into v_n using v_ids;
        update _del_alvo set restantes = v_n where tbl = v_rec.tbl;
    end loop;

    if p_dry_run then
        return query
            select a.tbl, a.restantes from _del_alvo a where a.restantes > 0
            union all
            select e.tbl, e.apagadas from _del_extra e where e.apagadas > 0
            union all
            select '(storage) ' || s.bucket, count(*)
            from public.admin_tenant_storage_paths(p_user_id) s
            group by s.bucket
            order by 2 desc;
        return;
    end if;

    -- ---- Passadas ate convergir ------------------------------------------
    -- Sem ordem fixa: quando uma FK bloqueia (NO ACTION/RESTRICT), a tabela
    -- espera a passada seguinte, quando o filho ja tera saido.
    loop
        v_pass := v_pass + 1;
        v_moveu := false;

        for v_rec in select tbl, col from _del_alvo where restantes > 0 loop
            begin
                execute format('delete from public.%I where %I = any($1)', v_rec.tbl, v_rec.col)
                    using v_ids;
                get diagnostics v_n = row_count;
                if v_n > 0 then
                    v_moveu := true;
                    update _del_alvo set apagadas = apagadas + v_n where tbl = v_rec.tbl;
                end if;
            exception
                when foreign_key_violation then
                    null; -- tenta de novo na proxima passada
                when others then
                    -- Guarda de regra de negocio (ex.: protect_avaliacao_category,
                    -- lifecycle do CRM) impedindo o delete. Elas existem para o uso
                    -- normal do app; numa exclusao de conta nao ha regra a
                    -- preservar. `disable trigger user` NAO desliga os triggers
                    -- internos de FK, entao cascata e integridade continuam valendo.
                    --
                    -- Mas `alter table` pega ACCESS EXCLUSIVE e o segura ate o fim
                    -- da transacao, travando a tabela para TODOS os tenants. Por
                    -- isso este caminho so abre depois que a via normal esgotou:
                    -- assim o lock dura o minimo possivel, no fim da limpeza.
                    if v_bypass then
                        begin
                            execute format('alter table public.%I disable trigger user', v_rec.tbl);
                            execute format('delete from public.%I where %I = any($1)', v_rec.tbl, v_rec.col)
                                using v_ids;
                            get diagnostics v_n = row_count;
                            execute format('alter table public.%I enable trigger user', v_rec.tbl);
                            if v_n > 0 then
                                v_moveu := true;
                                update _del_alvo set apagadas = apagadas + v_n where tbl = v_rec.tbl;
                                insert into _del_extra values ('(trigger desligado) ' || v_rec.tbl, v_n);
                            end if;
                        exception
                            when others then
                                -- a subtransacao volta atras, inclusive o disable;
                                -- fica para a proxima passada
                                null;
                        end;
                    end if;
            end;
        end loop;

        -- Recontagem em vez de subtracao: apagar um pai pode levar filhos de
        -- outras tabelas-alvo junto (as FKs que sao CASCADE).
        for v_rec in select tbl, col from _del_alvo where restantes > 0 loop
            execute format('select count(*) from public.%I where %I = any($1)', v_rec.tbl, v_rec.col)
                into v_n using v_ids;
            update _del_alvo set restantes = v_n where tbl = v_rec.tbl;
        end loop;

        exit when not exists (select 1 from _del_alvo where restantes > 0);

        if not v_moveu then
            if not v_bypass then
                -- A via normal esgotou e ainda sobra dado: o que resta esta
                -- barrado por guarda de negocio, nao por FK. Libera o bypass
                -- (com o lock exclusivo) para a passada seguinte.
                v_bypass := true;
            else
                select string_agg(tbl || '=' || restantes::text, ', ' order by tbl)
                  into v_resta from _del_alvo where restantes > 0;
                raise exception 'exclusao travada apos % passadas: %', v_pass, v_resta
                    using errcode = '23503';
            end if;
        end if;

        if v_pass >= 30 then
            select string_agg(tbl || '=' || restantes::text, ', ' order by tbl)
              into v_resta from _del_alvo where restantes > 0;
            raise exception 'exclusao nao convergiu em 30 passadas: %', v_resta
                using errcode = '23503';
        end if;
    end loop;

    return query
        select a.tbl, a.apagadas from _del_alvo a where a.apagadas > 0
        union all
        select e.tbl, e.apagadas from _del_extra e where e.apagadas > 0
        union all
        select '(passadas)', v_pass::bigint
        order by 2 desc;
end;
$$;

comment on function public.admin_delete_tenant_data(uuid, boolean) is
'Apaga TODOS os dados da conta varrendo o catalogo (100 tabelas com user_id/owner_id) em passadas ate convergir. p_dry_run=true so conta. Levanta excecao se sobrar linha.';

-- Nenhum tenant pode chamar isso.
revoke all on function public.admin_tenant_principal_ids(uuid) from anon, authenticated;
revoke all on function public.admin_tenant_storage_paths(uuid) from anon, authenticated;
revoke all on function public.admin_delete_tenant_data(uuid, boolean) from anon, authenticated;
grant execute on function public.admin_tenant_principal_ids(uuid) to service_role;
grant execute on function public.admin_tenant_storage_paths(uuid) to service_role;
grant execute on function public.admin_delete_tenant_data(uuid, boolean) to service_role;
