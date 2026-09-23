-- ============================================================
-- item: origem nunca nula (migration 20260923480000)
--
-- O que se prova aqui, nesta ordem:
--
--   1. o residuo acabou — nenhuma linha viva com origem nula;
--   2. o CHECK nao aceita mais nulo, nas DUAS tabelas. Provado TENTANDO, com
--      insert direto, e nao lendo o texto da constraint: constraint que existe
--      no catalogo e nao barra e a forma mais comum de seguranca de papel;
--   3. o caminho normal continua atravessando — e esta e a asserção que importa
--      mais. Fechar o nulo nao pode ter custado a ingestao: um evento com
--      rotulo invalido tem que virar `nao_identificada` e ser GRAVADO, nao
--      derrubado. Perder o incidente por causa do rotulo seria trocar o
--      problema grande pelo pequeno.
--
-- Usa o componente `zz-teste:origem-sem-nulo`, que o catalogo trata como
-- `somente_painel` pelo prefixo: nada daqui chega a telefone nenhum. Tudo roda
-- dentro de begin/rollback — nem a funcao auxiliar sobrevive ao arquivo.
-- ============================================================

begin;

-- ── auxiliar: grava origem nula e devolve o que FICOU na linha ──────────────
-- A primeira versao desta funcao perguntava "foi barrado?" e me deu duas
-- respostas erradas de uma vez: no `incident_events` o CHECK aceitava o nulo
-- (porque `null = any(...)` avalia NULL, e NULL satisfaz constraint) e no
-- `incidents` o insert morria numa OUTRA coluna NOT NULL, que eu contabilizei
-- como sucesso. Verde provando outra coisa.
--
-- Agora ela le o resultado: preenche as colunas obrigatorias, manda origem
-- nula e devolve o valor gravado. Assim a asserção fala do efeito — a linha
-- entrou e a origem nao e nula — em vez de falar de erro.
create function pg_temp.origem_gravada(p_tabela text) returns text
language plpgsql as $$
declare
    v     text;
    extra text := '';
    vals  text := '';
begin
    -- `incidents.fingerprint` e NOT NULL sem default, e `incident_events` nem
    -- tem a coluna. Sem este ramo o insert morre por fingerprint e a asserção
    -- reprova falando de origem — que foi como eu li errado da primeira vez.
    if p_tabela = 'incidents' then
        extra := ', fingerprint';
        vals  := ', ''zz-teste:origem-sem-nulo:fp''';
    end if;

    -- So as colunas que as DUAS tabelas tem: `error_message` existe no evento e
    -- nao no incidente, e incluir por reflexo custou mais uma rodada.
    execute format(
        'insert into public.%I (source, component, origem, origem_inferida%s)
              values (''edge_function'', ''zz-teste:origem-sem-nulo'', null, false%s)
           returning origem', p_tabela, extra, vals)
       into v;
    return coalesce(v, 'NULA');
exception when others then
    return 'ERRO ' || sqlstate || ' ' || sqlerrm;
end;
$$;

-- ── fixture ─────────────────────────────────────────────────────────────────
-- Sem origem declarada: tem que sair inferida.
select public.incident_record(jsonb_build_object(
    'source',        'edge_function',
    'component',     'zz-teste:origem-sem-nulo',
    'route',         'verify',
    'http_code',     500,
    'error_message', 'evento de teste do item origem-sem-nulo',
    'request_id',    'zz-teste:origem-sem-nulo:inferida',
    'started_at',    now()
));

-- Rotulo invalido: NAO pode derrubar a ingestao, tem que virar nao_identificada.
select public.incident_record(jsonb_build_object(
    'source',        'edge_function',
    'component',     'zz-teste:origem-sem-nulo',
    'route',         'verify',
    'http_code',     500,
    'error_message', 'evento de teste com rotulo de origem invalido',
    'request_id',    'zz-teste:origem-sem-nulo:invalida',
    'origem',        'marte',
    'started_at',    now()
));

with casos(ordem, caso, passou, porque) as (values

-- ── 1. o residuo ────────────────────────────────────────────────────────────
(1, 'nenhum evento vivo com origem nula',
 (select count(*) = 0 from public.incident_events where origem is null),
 'era 1 em 223 — vazio que se apresentava como declaracao'),

(2, 'nenhum incidente vivo com origem nula',
 (select count(*) = 0 from public.incidents where origem is null),
 'o alerta le o incidente; nulo aqui sairia como linha em branco na mensagem'),

-- ── 2. nulo e COAGIDO, e a linha entra ──────────────────────────────────────
(3, 'incident_events: origem nula vira nao_identificada e a linha entra',
 pg_temp.origem_gravada('incident_events') = 'nao_identificada',
 'coagir em vez de rejeitar: nao se perde um incidente por causa do rotulo'),

(4, 'incidents: origem nula vira nao_identificada e a linha entra',
 pg_temp.origem_gravada('incidents') = 'nao_identificada',
 'as duas tabelas — aqui o teste antigo passava pelo motivo errado'),

(9, 'o CHECK fala do nulo EXPLICITAMENTE nas duas tabelas',
 (select count(*) = 2 from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
   where rel.relname in ('incident_events','incidents')
     and con.conname like '%origem%'
     and pg_get_constraintdef(con.oid) ilike '%is not null%'),
 'sem o `is not null` a constraint e decorativa: NULL satisfaz CHECK'),

(10, 'incidents ainda aceita `multiplas`',
 (select pg_get_constraintdef(con.oid) ilike '%multiplas%'
    from pg_constraint con join pg_class rel on rel.oid = con.conrelid
   where rel.relname = 'incidents' and con.conname = 'incidents_origem_check'),
 'o proprio incident_record grava multiplas quando os eventos discordam — a 480000 comeu o valor e teria derrubado a ingestao'),

-- ── 3. o caminho normal nao pagou a conta ───────────────────────────────────
(5, 'evento sem origem declarada continua sendo gravado, inferido',
 (select origem = 'edge_interna' and origem_inferida
    from public.incident_events
   where request_id = 'zz-teste:origem-sem-nulo:inferida'),
 'fechar o nulo nao pode ter quebrado a inferencia'),

(6, 'rotulo invalido vira nao_identificada e o evento SOBREVIVE',
 (select origem = 'nao_identificada' and origem_inferida
    from public.incident_events
   where request_id = 'zz-teste:origem-sem-nulo:invalida'),
 'derrubar a ingestao por causa do rotulo seria trocar o problema grande pelo pequeno'),

(7, 'o default da coluna e nao_identificada, nao nulo',
 (select column_default like '%nao_identificada%'
    from information_schema.columns
   where table_schema = 'public' and table_name = 'incident_events'
     and column_name = 'origem'),
 'cobre o insert que simplesmente esquece a coluna'),

-- ── 4. o de sempre: o teste nao pode tocar o telefone ───────────────────────
(8, 'o componente de teste continua fora da fila de aviso',
 not exists (select 1 from public.incident_claim_for_notification(50) c
              where c.component like 'zz-teste:%'),
 'prefixo zz-teste: e somente_painel — e a regra age, nao so existe')

)
-- O `db query` do CLI devolve so as linhas do ULTIMO statement, entao o placar
-- entra como linha 99 desta mesma consulta em vez de virar um select separado.
select ordem, caso, case when passou then 'ok' else 'REPROVADO' end as resultado, porque
  from casos
union all
select 99,
       'PLACAR',
       case when (select count(*) from casos where not passou) = 0
            then 'ok' else 'REPROVADO' end,
       format('%s de %s asserções passaram',
              (select count(*) from casos where passou),
              (select count(*) from casos))
order by 1;

-- Nada de teste sobrevive a este arquivo: o rollback apaga tudo.
rollback;
