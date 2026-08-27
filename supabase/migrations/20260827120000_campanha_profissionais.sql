-- Profissionais habilitados na campanha (etapa "Tipo" > Promoção).
--
-- Não tem efeito prático no sistema: é apenas contexto para a IA, que usa a
-- lista para restringir com quem o agendamento pode ser marcado. Vai para o
-- n8n já pronto em `bd_data.campaign.professionals`, como STRING:
--   "Campanha habilitada para os profissionais: X, Y e Z"
--   "Campanha habilitada a todos os profissionais"  (lista vazia)
--
-- Formato igual ao de `campaigns.services`: [{ "id": uuid, "name": text }]
-- (snapshot do nome no momento da criação).

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS professionals JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
