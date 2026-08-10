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

## Commands

```sh
npm run dev        # dev server (Vite)
npm run build      # production build
npm run lint       # eslint
npm test           # vitest (config: vitest.config.ts, setup: src/test/setup.ts)
```

Frontend deploys via Vercel (vercel.json) on push to main.

Python integration tests live in `tests/` (test_*.py) — run manually with python.

## Structure

- `src/pages/` — route pages (Index.tsx = inbox, CRM.tsx, Scheduling.tsx, Campaigns.tsx, IAConfig.tsx, etc.)
- `src/components/<feature>/` — feature components (chat, crm, campaigns, scheduling, dashboard, settings, ia-wizard, ...)
- `src/components/ui/` — shadcn primitives (do not hand-edit style conventions)
- `src/hooks/` — data hooks (useAuth, useOwnerId, usePermissions, useConversations, useMessages, ...)
- `src/integrations/supabase/client.ts` — Supabase client (`import { supabase } from "@/integrations/supabase/client"`)
- `src/lib/utils.ts` — `cn()` helper
- `supabase/functions/` — ~100 Deno edge functions; shared code in `supabase/functions/_shared/`
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

## Supabase workflow (IMPORTANT)

- Migration history has diverged: `npx supabase db push` FAILS. Apply SQL with `npx supabase db query --linked --file <path>` (inline SQL starting with `--` comments breaks CLI arg parsing — use a file)
- Deploy functions with `npx supabase functions deploy <name>`
- Management API calls need `-H "Authorization: Bearer sbp_..."` (token = `SUPABASE_ACCESS_TOKEN` in `.env`); log timestamps need `Z` suffix
- Real credentials live in `.env` at repo root — check before asking the user

## Definition of done

Every task must end with the full deploy ritual: commit + push + apply migrations + deploy affected edge functions. Work is not finished until it's in production.
