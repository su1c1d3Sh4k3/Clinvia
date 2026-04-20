# Delivery Automation — Test Suite

Testes do fluxo de automação de agendamento via WhatsApp (`/delivery`).

## Setup

```bash
pip install pytest supabase freezegun python-dateutil httpx pytz
```

Env vars necessárias (staging):

```
STAGING_SUPABASE_URL=https://<staging>.supabase.co
STAGING_SERVICE_ROLE_KEY=eyJhbG...
STAGING_USER_ID=<uuid de um user de teste>
STAGING_INSTANCE_ID=<uuid de uma instância conectada do user de teste>
STAGING_PROFESSIONAL_ID=<uuid de profissional Mon-Fri>
STAGING_SERVICE_ID=<uuid de serviço com duration_minutes>
STAGING_PATIENT_ID=<uuid de paciente com contact_id e telefone>
STAGING_TEST_PHONE=<nº WhatsApp real p/ UazAPI; só usado quando UAZAPI_MOCK=0>
UAZAPI_MOCK=1   # liga mock nas edge functions (vê _shared/uazapi-menu.ts)
```

## Layout

```
tests/delivery_automation/
  conftest.py            # fixtures (supa client, seed helpers, cleanup)
  test_timezone.py       # unit tests sobre helpers de timezone (puros, sem DB)
  test_state_machine.py  # transições da state machine (chama edge fn respond)
  test_dispatcher.py     # dispatcher elegibilidade + staggering
  test_worker.py         # SKIP LOCKED + retry + rate-limit
  test_webhook_intercept.py  # webhook-handle-message bloqueia N8N quando sessão ativa
  test_appointment_flow.py   # E2E: dispatcher → worker → respond(d,p,t) → appointment
```

## Rodando

```bash
pytest tests/delivery_automation/ -v
# subset:
pytest tests/delivery_automation/test_timezone.py -v
```

## Observações

- Todos os testes **cleanup** seus próprios dados via `supabase.table(...).delete()`
  em fixtures teardown. Use um user/instância DEDICADOS de teste em staging.
- `test_timezone.py` é 100% puro e pode rodar sem Supabase (usa Python's pytz).
- Testes que invocam edge functions esperam que elas já estejam deployadas em
  staging (`supabase functions deploy ...`).
- `UAZAPI_MOCK=1` configurado como env var da edge function em staging faz
  com que `sendMenu`/`sendText` apenas loguem em `messages` sem HTTP real à UazAPI.
