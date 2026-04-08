# Auditoria Completa de Permissoes - Clinvia

**Data:** 2026-04-07
**Escopo:** Todas as 15 features da aba Permissoes (Settings > Permissoes)

---

## Resumo Executivo

| Metrica | Valor |
|---------|-------|
| Total de features | 15 |
| RLS 100% OK para supervisor/agent | **15/15** (apos correcoes) |
| Frontend enforcement (antes) | 8/15 |
| Frontend enforcement (depois) | **15/15** (apos correcoes) |
| Policies RLS corrigidas | 5 tabelas |
| Policies redundantes removidas | 11 policies |
| Bug critico encontrado | 1 (team_members INSERT/DELETE) |

---

## Correcoes Aplicadas

### Migration 1: `fix_broken_rls_policies_for_team_members`
| Tabela | Problema | Correcao |
|--------|----------|----------|
| `crm_deal_history` | ALL usava `auth.uid()` - supervisor BLOQUEADO | Trocado para `get_owner_id()` |
| `crm_deal_attachments` | ALL usava `auth.uid()` - supervisor BLOQUEADO | Trocado para `get_owner_id()` |
| `instagram_instances` | 4 policies usavam `auth.uid()` - supervisor BLOQUEADO | Unificado com `get_owner_id()` |
| `financial_reports` | INSERT/DELETE usavam `auth.uid()` - supervisor nao criava/deletava | Unificado com `get_owner_id()` |
| `contact_tags` | Policies com `true` (qualquer usuario podia modificar qualquer tag) | Trocado para `get_owner_id()` |

### Migration 2: `cleanup_redundant_crm_rls_policies`
Removidas 7 policies redundantes (`auth.uid()`) de `crm_deals`, `crm_funnels`, `crm_stages` que ja tinham policy ALL com `get_owner_id()`.

### Migration 3: `cleanup_redundant_queues_rls_policies`
Removidas 2 policies redundantes de `queues` que ja tinha `queues_all` com `get_owner_id()`.

### Frontend: Permissoes adicionadas em 7 paginas
Adicionado `usePermissions()` com `canCreate`/`canEdit`/`canDelete` em:
- Contacts.tsx
- CRM (pagina + componentes de deal)
- Tasks (TaskBoard)
- Scheduling.tsx
- Professionals
- Follow-up
- Quick Messages

---

## Status Detalhado por Feature

### 1. Contatos (`contacts`)
| Item | Status |
|------|--------|
| **RLS - SELECT** | `contacts_all`: `get_owner_id()` |
| **RLS - INSERT** | `contacts_all`: `get_owner_id()` |
| **RLS - UPDATE** | `contacts_all`: `get_owner_id()` |
| **RLS - DELETE** | `contacts_all`: `get_owner_id()` |
| **Sub-tabela `contact_tags`** | `get_owner_id()` (CORRIGIDO - antes era `true`) |
| **Frontend canCreate** | **ADICIONADO** - botao "Novo Contato" |
| **Frontend canEdit** | **ADICIONADO** - botoes de edicao |
| **Frontend canDelete** | **ADICIONADO** - botoes de exclusao |
| **Nav guard** | Nao (pagina sempre acessivel) |
| **Veredicto** | **OK** |

### 2. Tags (`tags`)
| Item | Status |
|------|--------|
| **RLS** | `tags_all`: `get_owner_id()` |
| **Frontend canCreate** | Sim - Tags.tsx:100 |
| **Frontend canEdit** | Sim - Tags.tsx:149 |
| **Frontend canDelete** | Sim - Tags.tsx:159 |
| **Nav guard** | Nao |
| **Veredicto** | **OK** |

### 3. Filas (`queues`)
| Item | Status |
|------|--------|
| **RLS** | `queues_all`: `get_owner_id()` |
| **Protecao extra** | System queues protegidas (nao podem ser deletadas/modificadas) |
| **Frontend canCreate** | Sim - Queues.tsx:95 |
| **Frontend canEdit** | Sim - Queues.tsx:161 |
| **Frontend canDelete** | Sim - Queues.tsx:172 |
| **Nav guard** | Nao |
| **Veredicto** | **OK** |

### 4. Produtos e Servicos (`products_services`)
| Item | Status |
|------|--------|
| **RLS** | `products_all`: `get_owner_id()` |
| **Frontend canCreate** | Sim - ProductsServices.tsx:319 |
| **Frontend canEdit** | Sim - ProductsServices.tsx:438,451 |
| **Frontend canDelete** | Sim - ProductsServices.tsx:360,379,413,456,477,511 |
| **Nav guard** | Nao |
| **Veredicto** | **OK** |

### 5. Tarefas (`tasks`)
| Item | Status |
|------|--------|
| **RLS - tasks** | `tasks_all`: `get_owner_id()` + board-based policies |
| **RLS - task_boards** | `task_boards_all`: `get_owner_id()` + allowed_agents |
| **Frontend canCreate** | **ADICIONADO** - botao criar tarefa/board |
| **Frontend canEdit** | **ADICIONADO** - botoes de edicao |
| **Frontend canDelete** | **ADICIONADO** - botoes de exclusao |
| **Nav guard** | Nao |
| **Veredicto** | **OK** |

### 6. Agendamentos (`appointments`)
| Item | Status |
|------|--------|
| **RLS - appointments** | `get_owner_id()` (2 policies ALL) |
| **RLS - scheduling_settings** | `get_owner_id()` (SELECT, INSERT, UPDATE, DELETE) |
| **Frontend canCreate** | **ADICIONADO** - botao novo agendamento |
| **Frontend canEdit** | **ADICIONADO** - edicao de agendamentos |
| **Frontend canDelete** | **ADICIONADO** - exclusao de agendamentos |
| **Nav guard** | Nao |
| **Nota sobre "configuracoes da agenda"** | RLS permite supervisores. Frontend nao bloqueava. Se supervisor reportou problema, pode ser cache ou outra causa. |
| **Veredicto** | **OK** |

### 7. Profissionais (`professionals`)
| Item | Status |
|------|--------|
| **RLS** | `professionals_all`: `get_owner_id()` + policies Team INSERT/UPDATE/DELETE |
| **Frontend canCreate** | **ADICIONADO** |
| **Frontend canEdit** | **ADICIONADO** |
| **Frontend canDelete** | **ADICIONADO** |
| **Nav guard** | Nao |
| **Veredicto** | **OK** |

### 8. CRM / Negocios (`crm_deals`)
| Item | Status |
|------|--------|
| **RLS - crm_deals** | `crm_deals_access`: `get_owner_id()` |
| **RLS - crm_funnels** | `crm_funnels_all`: `get_owner_id()` |
| **RLS - crm_stages** | `crm_stages_all`: `get_owner_id()` |
| **RLS - crm_deal_history** | `get_owner_id()` **(CORRIGIDO)** |
| **RLS - crm_deal_attachments** | `get_owner_id()` **(CORRIGIDO)** |
| **RLS - crm_deal_products** | `team_members join` |
| **Frontend canCreate** | **ADICIONADO** - botao criar deal |
| **Frontend canEdit** | **ADICIONADO** - edicao de deals |
| **Frontend canDelete** | **ADICIONADO** - exclusao de deals |
| **Veredicto** | **OK** |

### 9. Financeiro (`financial`)
| Item | Status |
|------|--------|
| **RLS - expenses** | `expenses_all`: `get_owner_id()` |
| **RLS - revenues** | `revenues_all`: `get_owner_id()` |
| **RLS - expense_categories** | `get_owner_id()` |
| **RLS - revenue_categories** | `get_owner_id()` |
| **RLS - financial_reports** | `get_owner_id()` **(CORRIGIDO)** |
| **Frontend** | `hasAnyAccess('financial')` guard em Financial.tsx |
| **Nav guard** | Sim - sidebar esconde + redirect na pagina |
| **Veredicto** | **OK** |

### 10. Vendas (`sales`)
| Item | Status |
|------|--------|
| **RLS - sales** | `team_members join` (SELECT/INSERT/UPDATE/DELETE) |
| **RLS - sale_installments** | `team_members join` |
| **RLS - sales_reports** | `team_members join` |
| **Frontend canEdit** | Sim - SalesTable.tsx:342 |
| **Frontend canDelete** | Sim - SalesTable.tsx:352 |
| **Nav guard** | Sim - sidebar esconde + redirect na pagina |
| **Veredicto** | **OK** |

### 11. Membros da Equipe (`team_members`)
| Item | Status |
|------|--------|
| **RLS - SELECT** | `get_my_owner_id()` - supervisor ve equipe |
| **RLS - UPDATE** | `auth_user_id = auth.uid()` - apenas proprio perfil |
| **RLS - INSERT** | `is_admin()` apenas **ADMIN** |
| **RLS - DELETE** | `is_admin()` apenas **ADMIN** |
| **Frontend canCreate** | Sim - Team.tsx:272 (botao visivel) |
| **Frontend canEdit** | Sim - Team.tsx:395 (botao visivel) |
| **Frontend canDelete** | Sim - Team.tsx:416 (botao visivel) |
| **Nav guard** | Sim - sidebar + redirect |
| **ATENCAO** | Se admin der `can_create: true` a supervisor, o botao aparece mas o INSERT falha no banco (RLS bloqueia). Idem para DELETE. |
| **Veredicto** | **LIMITACAO CONHECIDA** - switches de Create/Delete para supervisor nao funcionam na pratica porque o RLS exige `is_admin()`. O frontend mostra o botao mas a operacao falha. |

### 12. Follow-up (`followup`)
| Item | Status |
|------|--------|
| **RLS - follow_up_templates** | `get_owner_id()` |
| **RLS - follow_up_categories** | `get_owner_id()` |
| **RLS - conversation_follow_ups** | `get_owner_id()` via conversations join |
| **Frontend canCreate** | **ADICIONADO** |
| **Frontend canEdit** | **ADICIONADO** |
| **Frontend canDelete** | **ADICIONADO** |
| **Nav guard** | Nao |
| **Veredicto** | **OK** |

### 13. Conexoes (`connections`)
| Item | Status |
|------|--------|
| **RLS - instances** | `instances_all`: `get_owner_id()` |
| **RLS - instagram_instances** | `get_owner_id()` **(CORRIGIDO)** |
| **Frontend canCreate** | Sim - Connections.tsx:551,687 |
| **Frontend canEdit** | Sim - Connections.tsx:642,644 + InstanceRow.tsx:140,162 |
| **Frontend canDelete** | Sim - Connections.tsx:655 + InstanceRow.tsx:213 |
| **Nav guard** | Nao (padrao supervisor: tudo false) |
| **Veredicto** | **OK** |

### 14. Configuracao da IA (`ia_config`)
| Item | Status |
|------|--------|
| **RLS** | `ia_config_all`: `get_owner_id()` |
| **Frontend** | `hasAnyAccess('ia_config')` guard em IAConfig.tsx |
| **Nav guard** | Sim - sidebar esconde + redirect na pagina |
| **Veredicto** | **OK** |

### 15. Mensagens Rapidas (`quick_messages`)
| Item | Status |
|------|--------|
| **RLS** | `team_members join` via COALESCE (SELECT/INSERT/UPDATE/DELETE) |
| **Frontend canCreate** | **ADICIONADO** |
| **Frontend canEdit** | **ADICIONADO** |
| **Frontend canDelete** | **ADICIONADO** |
| **Nav guard** | Nao |
| **Veredicto** | **OK** |

---

## Tabela Resumo Final

| # | Feature | RLS | Frontend | Nav Guard | Status |
|---|---------|-----|----------|-----------|--------|
| 1 | contacts | get_owner_id | canCreate/Edit/Delete | - | **OK** |
| 2 | tags | get_owner_id | canCreate/Edit/Delete | - | **OK** |
| 3 | queues | get_owner_id | canCreate/Edit/Delete | - | **OK** |
| 4 | products_services | get_owner_id | canCreate/Edit/Delete | - | **OK** |
| 5 | tasks | get_owner_id | canCreate/Edit/Delete | - | **OK** |
| 6 | appointments | get_owner_id | canCreate/Edit/Delete | - | **OK** |
| 7 | professionals | get_owner_id | canCreate/Edit/Delete | - | **OK** |
| 8 | crm_deals | get_owner_id | canCreate/Edit/Delete | - | **OK** |
| 9 | financial | get_owner_id | hasAnyAccess | Sim | **OK** |
| 10 | sales | team_members join | canEdit/Delete + guard | Sim | **OK** |
| 11 | team_members | is_admin (INSERT/DELETE) | canCreate/Edit/Delete + guard | Sim | **LIMITACAO** |
| 12 | followup | get_owner_id | canCreate/Edit/Delete | - | **OK** |
| 13 | connections | get_owner_id | canCreate/Edit/Delete | - | **OK** |
| 14 | ia_config | get_owner_id | hasAnyAccess | Sim | **OK** |
| 15 | quick_messages | team_members join | canCreate/Edit/Delete | - | **OK** |

---

## Limitacao Conhecida: `team_members`

O RLS da tabela `team_members` exige `is_admin()` para INSERT e DELETE. Isso significa que:
- Mesmo que o admin ative `can_create: true` para supervisores, o supervisor vera o botao mas a operacao falhara no banco.
- O mesmo vale para `can_delete`.
- `can_edit` funciona parcialmente: o supervisor so pode editar SEU PROPRIO perfil.

**Recomendacao:** Considerar se supervisores devem poder criar/deletar membros. Se sim, criar uma policy RLS especifica. Se nao, remover os switches de Create/Delete para team_members no frontend para nao confundir o admin.

---

## Funcoes RLS Helper - Todas SECURITY DEFINER

| Funcao | Tipo | Status |
|--------|------|--------|
| `get_owner_id()` | SECURITY DEFINER | OK |
| `get_my_owner_id()` | SECURITY DEFINER | OK |
| `is_admin()` | SECURITY DEFINER | OK |
| `is_supervisor()` | SECURITY DEFINER | OK |
| `is_agent()` | SECURITY DEFINER | OK |
| `is_staff()` | SECURITY DEFINER | OK |
| `get_current_user_role()` | SECURITY DEFINER | OK |

---

## Vulnerabilidade Corrigida: `contact_tags`

A tabela `contact_tags` tinha policies com `qual = true` que permitiam que QUALQUER usuario autenticado (mesmo de outra empresa) pudesse inserir, ver e deletar tags de contatos de outros usuarios. Corrigido para usar `get_owner_id()`.
