-- Edição de templates Meta + switches de automação
-- 1) message_templates.variable_map: ordem das variáveis nomeadas ({{1}}..{{n}})
--    de templates de sistema editados pelo cliente — o cron monta os parâmetros
--    por esse mapa em vez da ordem hardcoded.
ALTER TABLE public.message_templates ADD COLUMN IF NOT EXISTS variable_map JSONB;

-- 2) Switches liga/desliga por template automático (4 templates de sistema).
--    Ausência de linha = habilitado (default true). Desligar afeta o fluxo
--    inteiro (Meta e UAZAPI) — decisão do usuário.
CREATE TABLE IF NOT EXISTS public.automation_template_settings (
  user_id UUID NOT NULL,
  template_name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, template_name)
);

ALTER TABLE public.automation_template_settings ENABLE ROW LEVEL SECURITY;

-- RLS team-aware: membros da equipe operam sobre os dados do owner
DROP POLICY IF EXISTS "Team can manage automation template settings"
  ON public.automation_template_settings;
CREATE POLICY "Team can manage automation template settings"
  ON public.automation_template_settings
  FOR ALL
  USING (user_id = public.get_owner_id())
  WITH CHECK (user_id = public.get_owner_id());
