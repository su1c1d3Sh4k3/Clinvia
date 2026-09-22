-- ROLLBACK da migration 20260922153000.
-- A migration e aditiva (so cria admin_get_support_profiles), entao o rollback e
-- apagar a funcao. ATENCAO: so aplicar isto se o front tambem voltar para a
-- leitura direta de public.profiles em useSupportInbox.ts — caso contrario a
-- caixa de entrada do suporte no /admin fica sem nome de empresa/dono.

drop function if exists public.admin_get_support_profiles(uuid[]);
