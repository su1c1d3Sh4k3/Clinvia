-- Mensagens automáticas da API não oficial (UAZAPI) — equivalente aos 4
-- templates de sistema da Meta, porém com texto editável por usuário e switch
-- liga/desliga INDEPENDENTE do switch da Meta (automation_template_settings
-- passa a valer só para envios Meta).
-- Ausência de linha = habilitado + texto default (hardcoded no cron/_shared).

CREATE TABLE IF NOT EXISTS public.uazapi_automation_messages (
  user_id UUID NOT NULL,
  template_name TEXT NOT NULL,
  body TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, template_name)
);

ALTER TABLE public.uazapi_automation_messages ENABLE ROW LEVEL SECURITY;

-- RLS team-aware: membros da equipe operam sobre os dados do owner
DROP POLICY IF EXISTS "Team can manage uazapi automation messages"
  ON public.uazapi_automation_messages;
CREATE POLICY "Team can manage uazapi automation messages"
  ON public.uazapi_automation_messages
  FOR ALL
  USING (user_id = public.get_owner_id())
  WITH CHECK (user_id = public.get_owner_id());

-- Migração de comportamento: o switch antigo desligava Meta E UAZAPI.
-- Copia os desligados atuais para a nova tabela para não religar nada
-- silenciosamente na virada.
INSERT INTO public.uazapi_automation_messages (user_id, template_name, enabled)
SELECT user_id, template_name, FALSE
FROM public.automation_template_settings
WHERE enabled = FALSE
  AND template_name IN ('sys_confirm_24h_v1','sys_confirm_multi_v1','sys_reminder_2h_v1','sys_feedback_24h_v1')
ON CONFLICT (user_id, template_name) DO NOTHING;
