-- Tabela principal de conexões Google Calendar
CREATE TABLE public.professional_google_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE CASCADE,
  -- NULL = agenda da clínica; UUID = agenda individual do profissional

  google_account_email TEXT,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  token_expiry TIMESTAMPTZ,
  calendar_id TEXT NOT NULL DEFAULT 'primary',

  sync_mode TEXT NOT NULL DEFAULT 'one_way'
    CHECK (sync_mode IN ('one_way', 'two_way')),
    -- one_way: plataforma → Google apenas
    -- two_way: bidirecional com webhooks

  -- Para sincronização bidirecional (webhooks)
  webhook_channel_id TEXT,
  webhook_resource_id TEXT,
  webhook_expiry TIMESTAMPTZ,

  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraint: um profissional = uma conexão Google Calendar por vez
  UNIQUE(user_id, professional_id)
);

-- Índices
CREATE INDEX idx_pgc_user_id ON public.professional_google_calendars(user_id);
CREATE INDEX idx_pgc_professional_id ON public.professional_google_calendars(professional_id);
CREATE INDEX idx_pgc_webhook_channel ON public.professional_google_calendars(webhook_channel_id);

-- RLS
ALTER TABLE public.professional_google_calendars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own calendar connections"
  ON public.professional_google_calendars
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Adicionar colunas de sync na tabela appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_sync_id UUID
    REFERENCES public.professional_google_calendars(id) ON DELETE SET NULL;
