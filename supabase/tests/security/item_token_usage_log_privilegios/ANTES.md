# token_usage_log — estado ANTES da migration 20260923110000

Saida de `verify.sql` em 22/09/2026 ~19:58 SP, contra producao.

```
GRANT DE TABELA | anon | DELETE,INSERT,MAINTAIN,REFERENCES,TRIGGER,TRUNCATE,UPDATE
GRANT DE TABELA | authenticated | DELETE,INSERT,MAINTAIN,REFERENCES,TRIGGER,TRUNCATE,UPDATE
GRANT DE TABELA | service_role | DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
GRANT DE COLUNA | authenticated | SELECT | 22 colunas
TRUNCATE (nao passa por RLS) | anon=true | authenticated=true | service_role=true
SENSIVEL | cache_ratio_applied | anon_sel=false | auth_sel=false | auth_upd=true
SENSIVEL | cost_brl_original | anon_sel=false | auth_sel=false | auth_upd=true
SENSIVEL | cost_usd_original | anon_sel=false | auth_sel=false | auth_upd=true
SENSIVEL | markup_applied | anon_sel=false | auth_sel=false | auth_upd=true
SENSIVEL | provider_cost_usd | anon_sel=false | auth_sel=false | auth_upd=true
ANON | delete | PASSOU, 0 linhas
ANON | insert forjado | BLOQUEADO 42501
ANON | le colunas sensiveis | BLOQUEADO 42501
ANON | select * | BLOQUEADO 42501
ANON | update zerando custo | PASSOU, 0 linhas
DONO DA PROPRIA LINHA | delete | PASSOU, 0 linhas
DONO DA PROPRIA LINHA | insert forjado | BLOQUEADO 42501
DONO DA PROPRIA LINHA | le colunas sensiveis | BLOQUEADO 42501
DONO DA PROPRIA LINHA | select * | BLOQUEADO 42501
DONO DA PROPRIA LINHA | update zerando custo | PASSOU, 0 linhas
ANON | le as 22 colunas liberadas | FALHOU 42501 permission denied for table token_usage_log
DONO DA PROPRIA LINHA | le as 22 colunas liberadas | linhas=28571
DONO | RPC get_my_token_stats | OK
SERVICE_ROLE | insert | OK
SERVICE_ROLE | le colunas sensiveis | OK
```

## Leitura

O vazamento de LEITURA das 5 colunas sensiveis ja estava fechado pela migration
`20260922270000` (`auth_sel=false` nas cinco). O que sobrou e privilegio de ESCRITA:

- `update`/`delete` aparecem como "PASSOU, 0 linhas". Isso e a RLS funcionando como
  sempre: sem policy que case, a operacao nao levanta erro, so nao acha linha. A
  protecao esta na policy, nao no privilegio — e a policy pode ser trocada por engano
  numa migration futura.
- `TRUNCATE` e o problema de verdade: **nao passa por RLS**. Quem tem o privilegio
  esvazia a tabela inteira. Nao ha verbo TRUNCATE no PostgREST, entao hoje nao ha
  caminho de exploracao pela API; mas qualquer funcao SECURITY INVOKER chamavel por
  `anon`/`authenticated` que rode TRUNCATE herda o privilegio. Numa tabela de
  faturamento, isso e perda de dado sem volta.
- `auth_upd=true` nas 5 colunas sensiveis: o grant de UPDATE cobre as 27 colunas,
  incluindo `markup_applied` e `provider_cost_usd`.

Depois da migration, `anon` fica sem nenhum privilegio e `authenticated` fica so com
`SELECT` nas 22 colunas nao sensiveis. As linhas de "leitura legitima" e as de
`SERVICE_ROLE` tem que continuar iguais — sao elas que provam que producao nao quebrou.

## DEPOIS (migration aplicada 22/09/2026 ~20:02 SP)

```
GRANT DE TABELA | service_role | DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
GRANT DE COLUNA | authenticated | SELECT | 22 colunas
TRUNCATE (nao passa por RLS) | anon=false | authenticated=false | service_role=true
SENSIVEL | cache_ratio_applied | anon_sel=false | auth_sel=false | auth_upd=false
SENSIVEL | cost_brl_original | anon_sel=false | auth_sel=false | auth_upd=false
SENSIVEL | cost_usd_original | anon_sel=false | auth_sel=false | auth_upd=false
SENSIVEL | markup_applied | anon_sel=false | auth_sel=false | auth_upd=false
SENSIVEL | provider_cost_usd | anon_sel=false | auth_sel=false | auth_upd=false
ANON | delete | BLOQUEADO 42501
ANON | insert forjado | BLOQUEADO 42501
ANON | le colunas sensiveis | BLOQUEADO 42501
ANON | select * | BLOQUEADO 42501
ANON | update zerando custo | BLOQUEADO 42501
DONO DA PROPRIA LINHA | delete | BLOQUEADO 42501
DONO DA PROPRIA LINHA | insert forjado | BLOQUEADO 42501
DONO DA PROPRIA LINHA | le colunas sensiveis | BLOQUEADO 42501
DONO DA PROPRIA LINHA | select * | BLOQUEADO 42501
DONO DA PROPRIA LINHA | update zerando custo | BLOQUEADO 42501
ANON | le as 22 colunas liberadas | FALHOU 42501 permission denied for table token_usage_log
DONO DA PROPRIA LINHA | le as 22 colunas liberadas | linhas=28571
DONO | RPC get_my_token_stats | OK
SERVICE_ROLE | insert | OK
SERVICE_ROLE | le colunas sensiveis | OK
```

`anon` sumiu da lista de grants (nao tem mais privilegio nenhum). `authenticated` ficou
so com o SELECT de coluna. Os tres indicadores de "producao intacta" nao se mexeram:
28.571 linhas lidas pelo dono, `get_my_token_stats` OK, `service_role` escreve e le o
custo real. E o "PASSOU, 0 linhas" do update/delete virou `42501` de verdade — agora o
bloqueio e privilegio, nao policy.

## Achado lateral (fora do escopo desta migration)

`supabase/.temp/_trunc_scan.sql`: **134 das 139 tabelas do schema `public` concedem
TRUNCATE a `anon` e a `authenticated`** — e o `GRANT ALL` padrao do Supabase, nao um erro
especifico desta tabela. As 5 excecoes (tabelas criadas com grant explicito) sao
`_reminder_log`, `admin_users`, `conversation_summary_queue`, `openai_alerts`,
`openai_sync_runs`. Corrigir em massa e um item proprio, com teste proprio.
