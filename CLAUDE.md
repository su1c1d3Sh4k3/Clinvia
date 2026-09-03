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
- `supabase/functions/` — ~115 Deno edge functions; shared code in `supabase/functions/_shared/`
- `supabase/migrations/` — SQL migrations
- `docs/diagnostics/` and `docs/reports/` — incident post-mortems and client reports (write new diagnostics here)
- `feegow/` — PRD for planned Feegow Clinic API integration (IA scheduling), not yet implemented
- Repo root contains legacy one-off scripts/SQL (analyze_schema.js, manual_*.sql, etc.) — ignore them; put ad-hoc SQL in `supabase/.temp/`

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

## Supabase workflow (IMPORTANT)

- Migration history has diverged: `npx supabase db push` FAILS. Apply SQL with `npx supabase db query --linked --file <path>` (inline SQL starting with `--` comments breaks CLI arg parsing — use a file)
- Deploy functions with `npx supabase functions deploy <name>`
- Management API calls need `-H "Authorization: Bearer sbp_..."` (token = `SUPABASE_ACCESS_TOKEN` in `.env`); log timestamps need `Z` suffix
- Real credentials live in `.env` at repo root — check before asking the user

## Definition of done

Every task must end with the full deploy ritual: commit + push + apply migrations + deploy affected edge functions. Work is not finished until it's in production.

BEFORE committing any change that alters app behavior, UI, or business rules, update BOTH of these in the SAME commit (or a follow-up docs commit in the same task):

1. **Support manual** — `src/pages/Suporte.tsx` + `src/components/suporte/` guides, simulators, and tours in `src/lib/suporteTours.ts`. Keep the manual's style: TopicSection/Callout/StepByStep blocks, interactive simulators, and `?tour=` anchors.
2. **Support AI knowledge base** — `supabase/functions/_shared/support-knowledge.ts` (`SUPPORT_TOPICS`: resolves/steps/gotchas/tours per manual tab). It mirrors the manual; if it drifts, the assistant starts giving customers wrong instructions. Editing it requires `npx supabase functions deploy support-ai-chat`.
