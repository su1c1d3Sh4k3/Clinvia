-- =============================================
-- Configurar Cron Job para Gerar Oportunidades
-- Executa diariamente às 5:00 da manhã (horário do servidor)
-- Data: 2025-12-17
-- =============================================

-- 1. Habilitar extensões necessárias (se não estiverem habilitadas)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- 2. Armazenar credenciais no vault (mais seguro)
-- NOTA: Você precisará substituir os valores abaixo pelos reais
-- Execute isso manualmente no SQL Editor após criar os secrets no Vault
/*
SELECT vault.create_secret(
    'https://fvbmqxmlwerizjlvqrag.supabase.co',
    'supabase_url',
    'URL do projeto Supabase'
);

SELECT vault.create_secret(
    'SUA_SERVICE_ROLE_KEY_AQUI',
    'service_role_key', 
    'Service role key para autenticação'
);
*/

-- 3. Criar função que chama a Edge Function
CREATE OR REPLACE FUNCTION public.call_generate_opportunities()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_url TEXT;
    v_key TEXT;
BEGIN
    -- Buscar URL e key do vault (ou usar diretamente se não usar vault)
    -- Para usar vault: SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url';
    
    -- Usar variáveis de ambiente do Supabase diretamente
    v_url := 'https://fvbmqxmlwerizjlvqrag.supabase.co/functions/v1/generate-opportunities';
    
    -- Chamar a Edge Function usando pg_net
    PERFORM extensions.http_post(
        url := v_url,
        body := '{}'::jsonb,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        )
    );
    
    RAISE NOTICE 'Cron job generate-opportunities executed at %', NOW();
END;
$$;

-- 4. Remover job antigo se existir (ignorar erro se não existir)
DO $$
BEGIN
    PERFORM cron.unschedule('generate-opportunities-daily');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Job não existia, continuando...';
END $$;

-- 5. Criar o cron job para rodar às 5:00 AM horário de Brasília (8:00 UTC)
-- Para 5:00 AM horário de Brasília, use 8:00 AM UTC (5 + 3 = 8)
--
-- 26/09/2026 — SEGREDO REMOVIDO DESTE ARQUIVO. Este bloco carregava, em texto
-- puro, a chave `service_role` do projeto Supabase `fvbmqxmlwerizjlvqrag`, que
-- NAO e este projeto (`swfshqvvbohnahdyndch`) — resíduo do scaffold original.
-- `service_role` ignora RLS: quem tivesse o arquivo tinha o banco daquele
-- projeto inteiro. Tirar daqui NAO invalida a chave; ela precisa ser
-- ROTACIONADA (ou o projeto encerrado) do lado de quem o administra.
--
-- O bloco esta NEUTRALIZADO e nao reagendado: o job `generate-opportunities-
-- daily` que existe hoje em producao foi recriado por migration posterior,
-- roda `8 8 * * *` e NAO aponta para aquele projeto nem carrega JWT nenhum
-- (medido em 26/09/2026). Reexecutar este arquivo nao pode ressuscitar a
-- chamada com credencial de terceiro.
DO $$
BEGIN
    RAISE NOTICE 'Bloco historico neutralizado: continha service_role de outro projeto. Job atual foi recriado por migration posterior.';
END $$;

-- 6. Verificar se o job foi criado
SELECT * FROM cron.job WHERE jobname = 'generate-opportunities-daily';

-- 7. Log de sucesso
DO $$
BEGIN
    RAISE NOTICE 'Cron job generate-opportunities-daily configurado para rodar às 5:00 AM (Brasília) / 8:00 UTC';
END $$;
