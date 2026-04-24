# Testes — Métricas do Relatório de Atendimento

Suíte de testes de integração que valida as 5 novas métricas do AttendanceReport end-to-end: dados no banco → triggers → RPC → valores esperados.

## O que é testado

| Arquivo | Métricas |
|---|---|
| `test_first_response.py` | Tempo da 1ª resposta (IA vs Humano) + outliers + override |
| `test_ai_vs_human.py` | `is_ai_handled` + contagem IA/Humano |
| `test_outside_business_hours.py` | Expediente (timezone, dias úteis, bordas) |
| `test_abandonment.py` | Abandono 48h + status resolved/closed + fallback created_at |
| `test_nps_and_sentiment.py` | NPS (contacts.nps) + Sentiment (conversations.sentiment_score) |
| `test_date_filters.py` | Filtros `p_start` / `p_end` (bordas inclusivas) |

Cada teste cria dados com um `user_id` aleatório (UUID), chama a RPC auxiliar `get_attendance_metrics_for_owner(p_owner, p_start, p_end)` e valida os campos do JSON de resposta. No teardown, remove tudo o que foi inserido.

## Pré-requisitos

### 1. Instalar dependências
```bash
pip install -r tests/attendance_metrics/requirements.txt
```

### 2. Variáveis de ambiente
Exporte antes de rodar:

```bash
export STAGING_SUPABASE_URL="https://swfshqvvbohnahdyndch.supabase.co"
export STAGING_SERVICE_ROLE_KEY="<service-role-key>"
export STAGING_USER_ID="<uuid-de-usuario-real-em-staging>"
```

**Por que `STAGING_USER_ID`?** `scheduling_settings.user_id` tem FK para `auth.users`, então não podemos usar UUIDs aleatórios. Os testes usam esse usuário como "owner" e rastreiam por ID todo dado inserido — no teardown, removem APENAS os registros criados pelo teste (nada real é tocado). O `scheduling_settings` original do usuário é salvo e restaurado.

> A `service_role` é necessária para bypass de RLS. **Não** use a `anon_key`.

### 3. Ambiente de staging dedicado (recomendado)
Para evitar interferência entre testes paralelos e dados reais, recomenda-se:
- Um usuário de teste dedicado (`STAGING_USER_ID`) em um banco de staging
- Rodar a suíte serializada (`pytest -p no:xdist`), não em paralelo

## Como rodar

```bash
# Suíte completa
pytest tests/attendance_metrics/ -v

# Arquivo específico
pytest tests/attendance_metrics/test_first_response.py -v

# Teste específico
pytest tests/attendance_metrics/test_abandonment.py::test_stale_conversation_abandoned -v

# Parar no primeiro erro + output verboso
pytest tests/attendance_metrics/ -x -vv
```

## Arquitetura dos testes

- **`conftest.py`** — fixtures compartilhadas:
  - `supa` (session): client Supabase com service_role
  - `test_owner` (function): UUID único + cleanup automático
  - `seed` (function): helpers para inserir `contact`, `conversation`, `message`, `scheduling_settings`
  - `call_metrics_rpc()`: chama `get_attendance_metrics_for_owner`

- **RPC de teste**: `get_attendance_metrics_for_owner(p_owner, p_start, p_end)` aceita owner explícito. A RPC pública `get_attendance_metrics(start, end)` delega a essa, resolvendo `auth.uid()` → `owner_id`. Os testes chamam a versão interna para não depender de auth.

- **Timestamps**: testes usam `datetime(..., tzinfo=timezone.utc)` para datas absolutas. Para horários locais (expediente), usa-se `SP = timezone(timedelta(hours=-3))`.

- **Triggers**: os triggers SQL rodam com `NOW()` na inserção. O helper `seed.message()` insere, depois atualiza `created_at`, depois recalcula manualmente os campos derivados (`first_response_at`, `last_customer_message_at`, `is_ai_handled`) em `conversations`. Assim o teste exercita tanto a lógica do trigger quanto a da RPC sem depender de `pg_sleep`.

## Troubleshooting

- **`pytest.skip: Missing env vars`** — defina `STAGING_SUPABASE_URL` e `STAGING_SERVICE_ROLE_KEY`.
- **`supabase-py não instalado`** — rode `pip install -r tests/attendance_metrics/requirements.txt`.
- **Testes falham em CI com "constraint violation"** — garanta que migrations `20260424130000`, `130100`, `130200` e `130300` foram aplicadas antes de rodar.
- **`count_abandoned` inesperado** — verifique se NOW() no teste está próximo: o cutoff de abandono é `NOW() - 48h`. Testes usam timestamps relativos (ex: `now - timedelta(hours=60)`) para serem estáveis em qualquer horário.

## Cobertura

Cada métrica tem cenários:
- ✅ Caminho feliz (valor esperado correto)
- ✅ Casos de borda (zero, NULL, valores exatos na borda)
- ✅ Isolamento multi-tenant (dados de outro owner não vazam)
- ✅ Filtros de data (antes/depois/dentro do período)
- ✅ Consistência entre campos derivados (soma, percentual)
