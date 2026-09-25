-- Catalogo dos 12 pontos que erravam em silencio no caminho da mensagem
-- (25/09/2026). Leitura pura: nenhuma linha e criada, alterada ou apagada.
-- Statement unico de proposito: o CLI so devolve as linhas do ultimo statement.
--
-- O QUE ESTE VERIFY EXISTE PARA IMPEDIR, em uma frase: que alguem "limpe" o
-- catalogo apagando estas linhas achando que isso cala o alerta. Apagar a linha
-- NAO cala — tira o piso, tira o `somente_painel` e deixa a IA como unica autora
-- da gravidade. O recibo de leitura, hoje painel, viraria telefone.

with
esperado (ord, component, match_tipo, severidade, painel) as (
    values
    -- Caminho de ENTRADA da mensagem: alta, telefone. O que se perde e a
    -- mensagem do paciente (aqui, a que QUASE se perdeu: a que se perde de
    -- verdade e a `recebimento:perdida-`, critica, do item anterior).
    ( 1, 'recebimento:banco-',       'prefixo', 'alta',  false),
    -- Familia PROPRIA para o COMPROVANTE de entrega. Separada de proposito:
    -- misturar as duas obrigaria escolher entre acordar alguem por um recibo de
    -- leitura ou emudecer a entrada da mensagem.
    ( 2, 'recibo:banco-',            'prefixo', 'baixa', true ),
    ( 3, 'instancia:sem-dono',       'prefixo', 'alta',  false),
    ( 4, 'instancia:nao-encontrada', 'prefixo', 'alta',  false),
    ( 5, 'conversa:orfa-migracao',   'prefixo', 'media', true ),
    ( 6, 'n8n:repasse-recusado',     'prefixo', 'alta',  false),
    ( 7, 'n8n:repasse-falhou',       'prefixo', 'alta',  false),
    ( 8, 'token:cripto-falhou',      'exato',   'alta',  false),
    ( 9, 'token:cripto-ausente',     'exato',   'alta',  false),
    (10, 'token:cripto-ilegivel',    'exato',   'alta',  false),
    (11, 'token:openai-leitura',     'exato',   'media', false),
    (12, 'template-sends:log',       'exato',   'baixa', true )
),
-- 1-12. Cada linha existe, ativa, com o piso e a porta que foram DECIDIDOS.
-- `natureza = 'servico'` em todas: detector e o varredor que ENCONTRA um padrao
-- sozinho; estas sao relatadas pela propria funcao no instante em que falhou, e
-- trocar para `detector` faria o alerta dizer "O QUE FOI DETECTADO" sobre uma
-- falha — o mesmo erro de rotulo de 23/09.
-- `left join` de proposito: linha apagada reprova como ausente em vez de sumir
-- do resultado e o verify passar com 11 de 12.
c_linhas as (
    select e.ord,
           'catalogo: ' || e.component as checagem,
           case when c.component is null then 'FALHOU'
                when c.match_tipo = e.match_tipo
                 and c.natureza = 'servico'
                 and c.severidade_padrao = e.severidade
                 and c.somente_painel = e.painel
                 and c.is_active
                then 'ok' else 'FALHOU' end as resultado,
           case when c.component is null then '(ausente do catalogo)'
                else c.match_tipo || ' / ' || c.natureza || ' / ' || c.severidade_padrao ||
                     ' / painel=' || c.somente_painel::text ||
                     ' / ativo=' || c.is_active::text
           end as detalhe
      from esperado e
      left join public.incident_component_catalog c on c.component = e.component
),
-- 13-18. Os componentes REAIS que o codigo escreve, com SQLSTATE e instancia,
-- resolvem para a familia certa. Sem isto o catalogo existe e nao casa nada: o
-- piso nao se aplica e a gravidade fica inteira nas maos da IA.
c13 as (
    select 13, 'real recebimento:banco-57014 resolve para a familia de entrada',
           case when component = 'recebimento:banco-' and severidade_padrao = 'alta'
                 and somente_painel = false
                then 'ok' else 'FALHOU' end,
           coalesce(component, '(nao catalogado)')
      from public.incident_component_info('recebimento:banco-57014 (pele-10)')
),
c14 as (
    select 14, 'real recibo:banco-57014 resolve para painel, nao telefone',
           case when component = 'recibo:banco-' and somente_painel = true
                then 'ok' else 'FALHOU' end,
           coalesce(component, '(nao catalogado)')
      from public.incident_component_info('recibo:banco-57014 (pele-10)')
),
c15 as (
    select 15, 'real instancia:nao-encontrada resolve com a instancia nos parenteses',
           case when component = 'instancia:nao-encontrada' and severidade_padrao = 'alta'
                then 'ok' else 'FALHOU' end,
           coalesce(component, '(nao catalogado)')
      from public.incident_component_info('instancia:nao-encontrada (pele-10)')
),
-- O prefixo mais longo vence: `n8n:repasse-recusado` NAO pode cair num
-- `n8n:` generico do `fetchProvider`, que tem outra gravidade.
c16 as (
    select 16, 'real n8n:repasse-recusado vence prefixo n8n generico',
           case when component = 'n8n:repasse-recusado' then 'ok' else 'FALHOU' end,
           coalesce(component, '(nao catalogado)')
      from public.incident_component_info('n8n:repasse-recusado (pele-10)')
),
c17 as (
    select 17, 'real conversa:orfa-migracao fica no painel',
           case when component = 'conversa:orfa-migracao' and somente_painel = true
                then 'ok' else 'FALHOU' end,
           coalesce(component, '(nao catalogado)')
      from public.incident_component_info('conversa:orfa-migracao (pele-10)')
),
c18 as (
    select 18, 'exato token:cripto-falhou resolve para si mesmo',
           case when component = 'token:cripto-falhou' and severidade_padrao = 'alta'
                then 'ok' else 'FALHOU' end,
           coalesce(component, '(nao catalogado)')
      from public.incident_component_info('token:cripto-falhou')
),
-- 19. A DIVERGENCIA, travada. O nome pedido era `entrada:<code>`, mas `entrada:`
--     ja existe desde 20260923540000 querendo dizer o OPOSTO ("o chamador mandou
--     valor errado, nao e defeito nosso"), catalogado baixa + somente_painel, e
--     `entrada_invalida_scan()` varre `component like 'entrada:%'` atras de surto
--     e persistencia. Renomear estas familias para `entrada:` rebaixaria a
--     entrada da mensagem do paciente ao painel E poluiria os dois detectores de
--     taxa. Se alguem tentar, isto reprova antes de ir para producao.
c19 as (
    select 19, 'nenhuma familia nova mora sob o prefixo entrada:',
           case when count(*) = 0 then 'ok' else 'FALHOU' end,
           case when count(*) = 0 then 'so a familia original de entrada invalida'
                else string_agg(component, ', ') end
      from public.incident_component_catalog
     where component like 'entrada:%'
       and component <> 'entrada:'
),
-- 20. Nenhum teto nas que vao ao telefone. O teto e excecao deliberada; posto
--     aqui sem decisao, seria mordaca.
c20 as (
    select 20, 'nenhuma das 12 tem teto de gravidade',
           case when count(*) = 0 then 'ok' else 'FALHOU' end,
           count(*)::text || ' com teto'
      from public.incident_component_catalog c
      join esperado e on e.component = c.component
     where c.severidade_teto is not null
),
-- 21. O ponto do caso de 22/09: o 57014 na ENTRADA nao pode ser somente_painel.
--     Esta e a unica linha das 12 cuja porta aberta e o motivo de existirem.
c21 as (
    select 21, 'recebimento:banco- nao e somente_painel',
           case when bool_and(somente_painel = false) then 'ok' else 'FALHOU' end,
           'painel=' || coalesce(bool_or(somente_painel)::text, '(ausente)')
      from public.incident_component_catalog
     where component = 'recebimento:banco-'
)
select * from c_linhas
union all select * from c13
union all select * from c14
union all select * from c15
union all select * from c16
union all select * from c17
union all select * from c18
union all select * from c19
union all select * from c20
union all select * from c21
order by ord;
