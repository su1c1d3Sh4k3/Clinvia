# Language

Always respond in **Portuguese (pt-BR)**. Internal processing, code analysis, and reasoning can be done in English, but all final responses, explanations, and communications to the user must be in Portuguese.

Technical terms, code identifiers, and proper nouns should remain in their original form (English).

# Project Overview

Clinvia is a WhatsApp/Instagram messaging platform for clinics (SaaS): multi-provider inbox (UAZAPI + Meta Cloud API + Instagram), AI agent (via n8n workflows), CRM, scheduling, campaigns, financial, and reports. Originally scaffolded with Lovable.

## Stack

- **Frontend:** React 18 + TypeScript + Vite (SWC), React Router v6, TanStack React Query, react-hook-form + zod
- **UI:** Tailwind CSS + tailwindcss-animate (NO framer-motion), shadcn/ui (Radix), lucide-react, sonner for toasts
- **Backend:** Supabase (Postgres + Auth + Storage + Edge Functions in Deno), pg_cron for scheduled jobs
- **AI routing:** messages forwarded to n8n webhooks (`webhooks.clinvia.com.br`)
- **Other notable deps:** recharts (charts), xlsx (spreadsheet import/export), papaparse (CSV), date-fns + date-fns-tz, @hello-pangea/dnd (kanban), react-virtuoso (long lists), driver.js (guided tours), vite-plugin-pwa (service worker)

## Commands

```sh
npm run dev        # dev server (Vite)
npm run build      # production build
npm run lint       # eslint
npm test           # vitest (config: vitest.config.ts, setup: src/test/setup.ts)
```

**O DEPLOY DO FRONTEND É SEMPRE MANUAL, FEITO PELO USER.** Não existe deploy automático no push para main — nunca fique esperando o bundle de produção trocar sozinho, nem prometa que a correção "já está no ar" depois de um push. Seu trabalho termina em commit + push; avise o user que o deploy depende dele.

Frontend build = EasyPanel + `docker buildx` (Dockerfile `node:20-alpine`, VITE_*/SUPABASE_* como build args), Cloudflare só na frente. Produção é `app.clinbia.ai`; existem duas VPS (produção e backup) — comparar as duas é o teste mais rápido para separar código de infra. `vercel.json` é resíduo; não há Vercel.

O único workflow do GitHub Actions é `.github/workflows/deploy-drift.yml` (roda `supabase/tests/security/deploy_drift/check.py`, que falha se existir edge function ACTIVE sem fonte no repo). **Ele NÃO é o build do frontend.**

Do NOT wait for local `npm run build` to verify (PWA precache + OneDrive makes it take 8-10 min).

Frontend tests: vitest, either colocated (`src/components/**/X.test.tsx`) or grouped by feature in `src/test/<feature>/`.

Python integration tests live in `tests/` (test_*.py, grouped by domain: appointment_metrics, attendance_metrics, ...) — run manually with python.

## Structure

- `src/pages/` — route pages (Index.tsx = inbox, CRM.tsx, Scheduling.tsx, Campaigns.tsx, IAConfig.tsx, etc.)
- `src/components/<feature>/` — feature components (chat, crm, campaigns, scheduling, dashboard, settings, connections, ...)
- `src/components/ui/` — shadcn primitives (do not hand-edit style conventions)
- `src/hooks/` — data hooks (useAuth, useOwnerId, usePermissions, useConversations, useMessages, ...)
- `src/contexts/`, `src/types/`, `src/utils/` — React contexts, shared TS types, misc helpers
- `src/integrations/supabase/client.ts` — Supabase client (`import { supabase } from "@/integrations/supabase/client"`). NOTE: `types.ts` is intentionally EMPTY — there are no generated DB types; check real columns via `information_schema` before assuming a schema
- `src/lib/` — domain helpers (`utils.ts` = `cn()`, `timezone.ts`, `nps.ts`, `chatDates.ts`, `messageSender.ts`, `suporteTours.ts`, import\* parsers, ...)
- `supabase/functions/` — ~137 Deno edge functions; shared code in `supabase/functions/_shared/`. `_webhook-template` and `evolution-webhook.disabled` are not deployed
- `supabase/migrations/` — SQL migrations (~660); `supabase/rollback/` — paired rollbacks
- `supabase/tests/security/` — access-test harness and monitors, one folder per item (`deploy_drift/`, `fase_*/`, `item_*/`); most are `check.py`/`verify.sql`
- `supabase/manuals/` — per-page markdown the support AI reads; `manuais/` at the root is the older copy
- `monitoring/sentinela_login/` — external login sentinel (stdlib Python, alerts by Resend without Supabase in the path); runs off-box
- `docs/diagnostics/`, `docs/reports/`, `docs/security/` — post-mortems, client reports, and the RLS/security state of record (`docs/security/ESTADO_ATUAL.md`)
- `tests/` — Python integration tests; `scripts/` — webhook-function generator + ad-hoc SQL
- `feegow/` — PRD for planned Feegow Clinic API integration (IA scheduling), not yet implemented
- Repo root contains legacy one-off scripts/SQL/dumps (analyze_schema.js, manual_*.sql, schema_dump.sql, current_*_revert.tsx, vite.config.ts.timestamp-*.mjs, ...) — ignore them; put ad-hoc SQL in `supabase/.temp/`

## Conventions

- Data fetching: `useQuery`/`useMutation` from `@tanstack/react-query`
- Toasts: `import { toast } from "sonner"`
- Path alias `@/` → `src/`
- Multi-tenant: data is scoped by owner — use `useOwnerId()`; roles via `useUserRole`/`usePermissions` (admin/supervisor/agent)
- Providers: UAZAPI (evolution-*/uzapi-* functions) vs Meta Cloud API (meta-* functions); message sending always routes through `evolution-send-message`, which delegates to `meta-send-message` for Meta instances
- Inbound pipeline: `webhook-queue-receiver` → `webhook-handle-message` (also handles automation intercepts and n8n forwarding gates)
- Timezone: Postgres stores UTC; every user-facing or n8n-facing output converts to America/São Paulo (-03:00) via `src/lib/timezone.ts` / `supabase/functions/_shared/timezone.ts`. Never format a raw UTC timestamp
- `_shared/` helpers are the single source of truth (`api-errors.ts` error contract, `crm-stages.ts`, `slot-settings.ts`, `system-templates.ts`, `support-knowledge.ts`, ...). Some have a frontend twin in `src/lib/` (e.g. `professional-schedule.ts`) that must be kept in sync. The Deno bundler inlines `_shared`, so editing a shared file requires redeploying EVERY function that imports it
- A React Query `queryFn` must `throw` on a Supabase error — swallowing it caches an empty result with no retry (recurring cause of "screen is empty" bugs)
- PostgREST caps responses at 1000 rows; `.limit(5000)` does NOT bypass it. Paginate with `.range()` when a query can exceed that
- `supabase.functions.invoke` on a non-2xx replaces the message with the fixed string `"Edge Function returned a non-2xx status code"`, returns `data: null` and hides the body in `error.context`. Always unwrap through `src/lib/functionError.ts` (`mensagemDoErroDaFuncao`) — `if (data?.error)` never fires
- Resolving a ticket DELETES rows from `messages` and archives them into `conversations.messages_history`. Any message query with a window longer than a day must read BOTH, or it undercounts by an order of magnitude
- CORS: the client sends a custom `x-origin` header, which forces a preflight. Every edge function must list it in `Access-Control-Allow-Headers`. Almost none of them import `corsHeaders` from `_shared/utils.ts` — the block is copy-pasted per function, so a new header means sweeping the whole repo. `curl` does NOT prove CORS: test with `OPTIONS` + `Access-Control-Request-Headers` against the exact `/functions/v1/<slug>`

## Supabase workflow (IMPORTANT)

- Migration history has diverged: `npx supabase db push` FAILS. Apply SQL with `npx supabase db query --linked --file <path>` (inline SQL starting with `--` comments breaks CLI arg parsing — use a file)
- Deploy functions with `npx supabase functions deploy <name>`
- Management API calls need `-H "Authorization: Bearer sbp_..."` (token = `SUPABASE_ACCESS_TOKEN` in `.env`); log timestamps need `Z` suffix
- Real credentials live in `.env` at repo root — check before asking the user
- **There is no log warehouse.** `edge_logs`, `function_edge_logs`, `postgres_logs` and friends answer `Table "X" does not exist`, and `logs.all` returns 410. `console.error` in an edge function writes nowhere and cannot be read back. Anything you need to diagnose later must be written to a TABLE. To inspect a deployed function's actual code, fetch the published bundle: `GET /v1/projects/{ref}/functions/<slug>/body`

### Two service keys coexist, and the gateway hides the difference (23/09/2026)

The project migrated to the new API keys, but the migration was partial:

| Where | What is actually stored |
|---|---|
| Edge function env `SUPABASE_SERVICE_ROLE_KEY` | new key, `sb_secret_…` (41 chars) |
| Vault secret `SUPABASE_SERVICE_ROLE_KEY` | **legacy JWT**, `eyJ…` (219 chars) |
| Vault secret `SUPABASE_EDGE_SECRET_KEY` | new key, `sb_secret_…` |

**The Supabase gateway accepts BOTH formats**, so a caller using the legacy JWT gets through the
gateway and the request reaches the function. The failure only happens if the function then
compares the presented key against its OWN env — the two strings differ and it answers 401. That is
invisible from the caller's side because `net.http_post` is fire-and-forget: **pg_cron reports
`succeeded` for a call that was rejected.** `alert-notify` was 401 for weeks this way.

Rules:
- A DB function that wakes an edge function must read **`SUPABASE_EDGE_SECRET_KEY`** from the vault,
  not `SUPABASE_SERVICE_ROLE_KEY`, and send it in `x-service-key`. 19 invokers still carry the
  legacy JWT — they work only because they call functions that do not self-check.
- Never trust `cron.job_run_details.status` as a health signal. The HTTP outcome is in
  `net._http_response` — which has **no URL column** and is **purged after 30 minutes**. Fire
  through `public.clinvia_http_post(...)` so the request id gets recorded and the failure can be
  named; `cron-health-watch` (`public.cron_health_scan()`, every 5 min) turns it into an incident.
- Never build a cron on `current_setting('app.settings.*')`: **those GUCs were never defined in this
  project.** `instagram-enrich-profiles` failed 100% of its runs for 140 days because of it.

### Incident severity: the component floor is a floor, NOT a cap (measured 23/09/2026)

`incident_severidade_efetiva(component, ai_severity)` returns the **worst** of two independent
sources: `incident_component_catalog.severidade_padrao` (the per-component floor) and
`incidents.ai_severity` (written by an `incident_catalog` message match **or** re-rated upward by
the cron `incident-analyze-scan`, `*/2 * * * *`, **which is active** — any note claiming there is no
analyzer in production is wrong). A component catalogued as `baixa` can therefore show `alta`.

**What keeps an alert off his phone is `somente_painel = true`, not a low floor.** Never turn
`somente_painel` off reasoning that "the severity is low anyway".

### An input error is not our defect

`_shared/api-errors.ts` states *"Erro de banco é sempre defeito nosso (ou regressão de RLS) ⇒
reporta"*. That premise is false and it is the pattern behind the `appointment_id` incidents:
`22P02` (text where a UUID is expected), `22007` (bad date) and input-caused `23514` come from the
CALLER. Today `dbErrorResponse` answers 500 and always reports — 101 call sites across 29 functions,
and zero places in the repo map a Postgres data-exception code to 400. Validate the shape at the
edge of the handler (`checkAppointmentIds` in `api-scheduling` is the model) and return 400 through
`apiError`, which does not report.

## Security rules (mandatory for all new code)

Outcome of the September/2026 RLS correction plan. Full state — what is applied, what is ready but
unapplied, what was never started, and the agreed resume order: **`docs/security/ESTADO_ATUAL.md`**.
Harness and monitoring scripts: `supabase/tests/security/`.

- **No `using (true)` / `with check (true)` policy** for `anon` or `authenticated`. Every tenant
  table anchors on `public.get_owner_id()`.
- **Never put a secret in a column the front can read.** Keys/tokens leave the DB only through an
  edge function, masked when displayed.
- **Every SECURITY DEFINER RPC needs a tenant check in its body and a fixed `search_path`.**
- **Super admin is `public.admin_users`** (`is_super_admin` + `is_active`), never `profiles.role`.
- Column-level `revoke` is inert while the table-level `grant` exists: `revoke <priv> on <table> from <role>` **then** `grant <priv> (<allowed cols>) on <table> to <role>`.
- Same trap with functions: **`create function` grants EXECUTE to `PUBLIC`**, and `revoke ... from anon, authenticated` does NOT remove PUBLIC's grant — the function stays callable by everyone. Every new function ends with `revoke all on function <fn>(<args>) from public, anon[, authenticated]` **then** `grant execute on function <fn>(<args>) to <roles>`. Check with `has_function_privilege('anon', oid, 'EXECUTE')`, never by reading the migration.
- RLS never errors on UPDATE/DELETE (no matching policy = 0 rows, success). Only INSERT/`with check` raises `42501`. To hard-block a write, use a privilege, not a policy.
- Every security migration ships with a `_rollback.sql` next to it and a before/after access test.

## Testing against production (mandatory, no exceptions)

**Ask BEFORE, not after.** Any test that touches a real channel, production data, or the user's
phone requires an explicit heads-up and his confirmation FIRST. Warning him afterwards, in the
report, is too late — by then the message is already on his phone. This is a rule, not a courtesy.

The reason is not the damage (usually zero). It is that **he must always be able to tell a real
alert from a test.** A red CRÍTICO on his WhatsApp that turns out to be a drill teaches him that red
can be ignored — and then the whole alerting system is worth nothing on the day it matters.

Consequences for how tests are built:

- **Test components use the `zz-teste:` prefix, catalogued as `somente_painel`.** A test incident
  stays in the panel and never reaches WhatsApp on its own. When a test genuinely has to prove the
  message arrives, warn him first and wait for the go-ahead.
- Prefer an injection that cannot escape: a panel-only component, a recipient that is not him, a
  channel that is not the real one. Reach for the real channel only when the thing being proven IS
  the real channel.
- Never measure volume, run load, or mutate rows on a large ACTIVE tenant.

## Definition of done

Every task must end with the full deploy ritual: commit + push + apply migrations + deploy affected edge functions. Work is not finished until it's in production.

BEFORE committing any change that alters app behavior, UI, or business rules, update BOTH of these in the SAME commit (or a follow-up docs commit in the same task):

1. **Support manual** — `src/pages/Suporte.tsx` + `src/components/suporte/` guides, simulators, and tours in `src/lib/suporteTours.ts`. Keep the manual's style: TopicSection/Callout/StepByStep blocks, interactive simulators, and `?tour=` anchors.
2. **Support AI knowledge base** — `supabase/functions/_shared/support-knowledge.ts` (`SUPPORT_TOPICS`: resolves/steps/gotchas/tours per manual tab). It mirrors the manual; if it drifts, the assistant starts giving customers wrong instructions. Editing it requires `npx supabase functions deploy support-ai-chat`.
