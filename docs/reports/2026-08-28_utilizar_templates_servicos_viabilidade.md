# Viabilidade — "Utilizar templates" em /products-services

Data: 2026-08-28 · Status: **aguardando decisões do usuário**

## 1. O que existe hoje

### Página `/products-services` (`src/pages/ProductsServices.tsx`)
- Header (linhas 109-122) com 3 botões: `Importar` (outline), `Adicionar Categoria` (outline), `Adicionar Serviço por Categoria` (primary).
- Lista = categorias agrupadas a partir de `services_client`. Categoria `standard` → `ServiceCategoryCard`, `direct` → `DirectCategoryCard`.
- `ServiceCategoryCard` (linhas 42-121) é exatamente a UI que o pedido descreve: **header colapsável** (`ChevronDown`) → dentro, **`Tabs` por serviço** com **lápis** em cada aba (`setEditService`) → **tabela de aplicações** (`ServiceApplicationsTable`).

### Modelo de dados
```
services_category (name, description, category_type 'standard'|'direct', user_id)
  └── service_name (name, description, user_id, recurrence,
                    time_recurrence_1..3, recurrence_discount_pct_1..3, msg_recurrence_1..3)
        ├── service_applications  ← catálogo TEMPLATE (default_price, default_min_price,
        │                            default_expiry_months, default_session_interval,
        │                            default_duration_minutes)
        └── services_client       ← DADO REAL DO CLIENTE (name, description, price, min_price,
                                     status, expiry_months, session_interval, duration_minutes,
                                     professionals[], commission_pct, template_app_id)
```

### ⚠️ Descoberta que muda o desenho
Consulta no banco de produção:

| tabela | linhas |
|---|---|
| `services_category` com `user_id IS NULL` (globais) | **0** |
| `service_name` com `user_id IS NULL` (globais) | **0** |
| `service_applications` (catálogo template) | **0** |

O catálogo global **foi apagado** pela migration `20260825120000`. Consequência: o passo "Aplicações" do `AddByCategoryModal` (linhas 119-131) consulta `service_applications` e **vem sempre vazio hoje**. Não existe mais nenhum template no sistema.

Ou seja: o pedido não é "melhorar o template existente" — é **recriar o catálogo do zero**, e a planilha é a fonte.

## 2. A planilha

`template_categoria.xlsx`, aba `pg1`, **75 linhas** → 6 categorias, 30 serviços, 74 aplicações (1 linha duplicada idêntica).

| Coluna | Preenchimento | Destino proposto |
|---|---|---|
| `Categoria` | 6 valores | `services_category.name` (`category_type='standard'`) |
| `Serviço` | 30 valores | `service_name.name` |
| `Nome` | 74 únicos | `services_client.name` |
| `Valor` | 100% | `services_client.price` |
| `Preço Mín.` | 100% | `services_client.min_price` |
| `Vencimento` | "1 mes".."12 meses" | `services_client.expiry_months` |
| `Intervalo` | **100% vazio** | `services_client.session_interval` = NULL |
| `Tempo` | "15 mim".."90 mim" (typo) | `services_client.duration_minutes` |
| `Descrição` | 72/75 | `services_client.description` |
| `tempo de msg antes vencimento` | sempre "30 dias" | → `service_name.time_recurrence_1` |
| `tempo de msg pós vencimento` | sempre "30 dias" | → `service_name.time_recurrence_3` |
| — (não existe) | — | `commission_pct` = 0, `professionals` = [] |

Categorias: INJETAVEIS, EQUIPAMENTO SEM CONSUMIVEL, EQUIPAMENTO COM COSUMIVEL (sic), WELLNES (sic), PROCEDIMENTOS MEDICOS, DRUG DELIVERY.

## 3. Conflitos identificados na planilha

1. **Vencimento diverge dentro do mesmo serviço** em 5 casos, mas `time_recurrence_*` mora em `service_name` (é **por serviço**, não por aplicação):
   - `LASER SPECTRA` → 6 e 3 meses
   - `LASER LAVIEEN` → 3 e 6 meses
   - `LASER PISOM` → 3 e 6 meses
   - `RADIO FREQUENCIA DENSITY` → 3 e 1 mês
   - `TIRZEPATIDA` → 1, 2, 3 e 4 meses
2. **Linha duplicada** (idêntica em todos os campos): `CAMPO E.M. SUPRE PRO > 4 AREAS- 1 SESSAO`.
3. **3 linhas sem descrição**: TIRZEPATIDA 10mg, CONSULTA DERMATOLOGIA, PROCEDIMENTO MEDICO.
4. Typos que vão para o banco como o cliente vê: "COSUMIVEL", "WELLNES", "mim", "1 meses".

## 4. Desenho proposto

### 4.1 Onde mora o catálogo — **DECIDIDO: 3 tabelas dedicadas**
`service_catalog_categories` → `service_catalog_services` → `service_catalog_applications` (migrations `20260828210000_service_catalog_tables.sql` + `20260828210500_service_catalog_seed.sql`, já aplicadas). RLS: `SELECT` para `authenticated`, **nenhuma policy de escrita** (catálogo é global e só muda por migration). Hook `src/hooks/useServiceCatalog.ts` monta a árvore.

Por que **não** reaproveitar `services_category`/`service_name` com `user_id NULL`: `ProductsServices`, `AddByCategoryModal` e `ServiceCascadePicker` não filtram por `user_id` — linhas globais vazariam para o catálogo de **todos** os tenants, exatamente a regressão que a migration `20260825120000` removeu de propósito.

Por que **não** arquivo estático no front (opção avaliada primeiro): o catálogo precisa ser "prático e editável" sem deploy do front, e tabela permite corrigir/ampliar por SQL. Em produção: **6 categorias, 34 serviços, 74 aplicações**.

### 4.2 Botão
`Utilizar templates` no header, à esquerda de `Importar`, com `Sparkles`/`LayoutTemplate`.

### 4.3 Modal (espelha a UI da página)
```
[✓] ▸ INJETAVEIS                                    6 serviços · 19 aplicações   [✏️]
      [✓] ▸ TOXINA BOTULINICA                                8 aplicações        [✏️ serviço]
            ┌────┬──────────────────────┬────────┬──────────┬────────┬──────────┬──────────┐
            │ ✓  │ Nome                 │ Valor  │ Preço Mín│ Tempo  │ Retorno  │ Comissão │
            ├────┼──────────────────────┼────────┼──────────┼────────┼──────────┼──────────┤
            │ ✓  │ [BOTOX - AXILAS    ] │[2999,90]│[2299,90]│ [15]   │ [4]      │ [0]      │
```
- Tudo **marcado por padrão**; checkbox em cascata (categoria → serviços → aplicações), estado indeterminado quando parcial.
- Lápis da **categoria** = rename inline (só o nome).
- Lápis do **serviço** = modal completo (dados + recorrência), mas editando **rascunho em memória**.
- Tabela de aplicações = formulário editável (nome, descrição, valor, preço mín., tempo, retorno, comissão — comissão default **0**).
- Caixa **"Como importar os nomes"**: `MAIÚSCULAS` × `Normal` (só a 1ª letra), default `Normal`. Vale para categoria, serviço e aplicação; **não** altera descrições. Rename manual (`nameOverride`) vence a escolha de caixa.
- Rodapé: `Importar N aplicações`.

### 4.4 Importação
`src/lib/importServiceTemplates.ts`. Ordem: `services_category` → `service_name` (com a config de recorrência) → `services_client` em lotes de 200.
**Regra do cliente (nunca substituir):** categoria/serviço já existente do tenant é **reaproveitado** (comparação sem acento/caixa, `normalizeTxt` = espelho do `clinvia_normalize_txt`); aplicação com o mesmo nome no mesmo serviço é **ignorada** (contabilizada em `applicationsSkipped`). Serviços novos que trazem mensagem personalizada disparam `syncRecurrenceTemplates` (no-op sem instância Meta).

### 4.5 Recorrência (pedido 4)
Hoje `RecurrenceTab` mostra textarea **vazia** com placeholder quando `msg_recurrence_N` é NULL. Proposta:
- Campo exibe o **texto do template padrão da conta** (`profiles.recurrence_default_msg_N` → fallback `DEFAULT_RECURRENCE_MESSAGES[N]`), em modo leitura, com badge `Padrão da conta`.
- Botão **Editar** → `AlertDialog` de aprovação da Meta → libera a textarea (vira `Personalizado`).
- Botão **Voltar ao padrão** limpa o campo (grava NULL).
- Padrão exatamente igual ao `RecurrenceDefaultTemplateCard` (Conexões → Templates → Recorrência), que já faz alerta → editor.

O `AlertDialog` da Meta já existe no `EditServiceModal` (linhas 208-224), só que dispara **no Salvar**. Passa a disparar **no clique do Editar**.

## 5. Esforço e risco

| Item | Arquivos | Status |
|---|---|---|
| Catálogo (3 tabelas + seed 114 INSERTs) | `20260828210000_service_catalog_tables.sql`, `20260828210500_service_catalog_seed.sql` | aplicado |
| Hook do catálogo | `src/hooks/useServiceCatalog.ts` | feito |
| Botão + modal | `ProductsServices.tsx`, `services/ServiceTemplatesModal.tsx` | feito |
| Import em lote | `src/lib/importServiceTemplates.ts` | feito |
| Editor de serviço em rascunho | `EditServiceModal.tsx` (prop `onSaveDraft`) | feito |
| Recorrência com padrão visível | `RecurrenceTab.tsx`, `hooks/useRecurrenceDefaults.ts`, `AddByCategoryModal.tsx` | feito |
| Manual `/suporte` | `ServicosGuide.tsx` + tour `servicos-tour` | feito |

Sem edge function nova. `recurrence-template-sync` continua sendo chamada como hoje.

## 6. Decisões do cliente

1. Catálogo **não** atrelado a nenhum tenant — tabelas globais, editáveis por SQL.
2. Espectra / Laveien / Pison: 6 meses (Pison também 3); TIRZEPATIDA = 1 serviço por mg; Wellness = 5 serviços com a aplicação "APLICAÇÃO".
3. Correções ortográficas aplicadas no seed. Mês = **30 dias**; retorno em 1 mês ⇒ abordagem 15 dias antes, demais 30 dias antes.
4. Caixa **normal** = só a 1ª palavra e nomes próprios de equipamentos.
5. Categoria já cadastrada ⇒ **apenas acrescenta**, nunca substitui.
6. Alerta da Meta dispara **ao clicar em editar** o template (não no salvar).
7. Caixa de escolha MAIÚSCULAS × Normal no modal, **sem** afetar descrições.
