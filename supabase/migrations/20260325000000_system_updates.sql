-- =============================================
-- Migration: Central de Atualizações do Sistema
-- Tabelas para publicação de atualizações pelos devs
-- e rastreamento de leitura por usuário
-- =============================================

-- 1. Tabela principal de atualizações
CREATE TABLE IF NOT EXISTS public.system_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('update', 'improvement', 'fix', 'alert')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  affected_areas TEXT[] DEFAULT '{}',
  impact_level INTEGER NOT NULL DEFAULT 0 CHECK (impact_level BETWEEN 0 AND 10),
  published_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela de leituras (quem visualizou cada update)
CREATE TABLE IF NOT EXISTS public.system_update_reads (
  update_id UUID NOT NULL REFERENCES public.system_updates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (update_id, user_id)
);

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_system_updates_type ON public.system_updates(type);
CREATE INDEX IF NOT EXISTS idx_system_updates_published ON public.system_updates(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_update_reads_user ON public.system_update_reads(user_id);

-- 4. RLS
ALTER TABLE public.system_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_update_reads ENABLE ROW LEVEL SECURITY;

-- Todos os usuários autenticados podem ler as atualizações
DROP POLICY IF EXISTS "system_updates_authenticated_read" ON public.system_updates;
CREATE POLICY "system_updates_authenticated_read"
  ON public.system_updates FOR SELECT
  TO authenticated
  USING (true);

-- Super-admin pode inserir/atualizar/deletar atualizações
DROP POLICY IF EXISTS "system_updates_super_admin_write" ON public.system_updates;
CREATE POLICY "system_updates_super_admin_write"
  ON public.system_updates FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super-admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super-admin')
  );

-- Reads: cada usuário gerencia os seus próprios
DROP POLICY IF EXISTS "system_update_reads_select" ON public.system_update_reads;
CREATE POLICY "system_update_reads_select"
  ON public.system_update_reads FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "system_update_reads_insert" ON public.system_update_reads;
CREATE POLICY "system_update_reads_insert"
  ON public.system_update_reads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 5. Permissões
GRANT SELECT ON public.system_updates TO authenticated;
GRANT SELECT, INSERT ON public.system_update_reads TO authenticated;
GRANT ALL ON public.system_updates TO service_role;
GRANT ALL ON public.system_update_reads TO service_role;
