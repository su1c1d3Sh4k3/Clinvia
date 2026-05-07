# Testes — Métricas do Relatório de Agendamentos

Suíte de integração que valida as 4 métricas novas do AppointmentsReport end-to-end: migrations → triggers → RPC `get_appointment_metrics_for_owner` → valores esperados.

## O que é testado

| Arquivo | Métricas |
|---|---|
| `test_no_show_rate.py` | No-show rate, pure_no_show, canceled_rate, filtro de type=absence |
| `test_goal_tracking.py` | Meta mensal, progress_pct, achieved apenas de completed, over-100% |
| `test_by_professional.py` | Contagem + ordenação decrescente |
| `test_temporal_patterns.py` | DOW e hora em timezone SP, agrupamento de slots |
| `test_date_filters.py` | Janela vazia, borda inclusiva |

## Pré-requisitos

```bash
pip install -r tests/appointment_metrics/requirements.txt
```

## Variáveis de ambiente

```bash
export STAGING_SUPABASE_URL="https://swfshqvvbohnahdyndch.supabase.co"
export STAGING_SERVICE_ROLE_KEY="<service-role-key>"
export STAGING_USER_ID="<uuid-de-usuario-real-em-staging>"
export STAGING_PROFESSIONAL_ID="<uuid-profissional-opcional>"  # opcional — se omitido, pega o primeiro
```

**Por que `STAGING_USER_ID`?** `appointment_goals.user_id` e `professionals.user_id` têm FK para `auth.users`, então não podemos usar UUIDs aleatórios. O fixture rastreia IDs inseridos e remove APENAS eles no teardown — nenhum dado real é tocado.

## Como rodar

```bash
pytest tests/appointment_metrics/ -v
pytest tests/appointment_metrics/test_no_show_rate.py -v
pytest tests/appointment_metrics/test_goal_tracking.py::test_goal_progress_calculated -v
```

## Arquitetura

- **`conftest.py`** — fixtures `supa`, `test_owner`, `professional_id`, `seed` (insere com cleanup automático)
- **RPC de teste**: chama `get_appointment_metrics_for_owner(p_owner, p_start, p_end)` — aceita owner explícito, sem auth
- **Datas isoladas**: testes usam anos futuros (2029-2040) para não colidir com dados reais de staging
- **Timezone**: testes usam `SP = timezone(timedelta(hours=-3))` para horários locais; UTC para datas absolutas

## Smoke test SQL (fallback sem Python)

Sem env vars? Há um smoke test SQL inline que roda no Supabase e valida 15 cenários end-to-end em segundos — veja o histórico de migrations `20260424140200`.
