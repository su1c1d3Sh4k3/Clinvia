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
SELECT cron.schedule(
    'generate-opportunities-daily',  -- nome do job
    '0 8 * * *',                     -- 8:00 UTC = 5:00 Brasília
    $$
    SELECT net.http_post(
        url := 'https://fvbmqxmlwerizjlvqrag.supabase.co/functions/v1/generate-opportunities',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2Ym1xeG1sd2VyaXpqbHZxcmFnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMTE2NjkyMywiZXhwIjoyMDQ2NzQyOTIzfQ.VBq3PlMqxPBMbbCJObbNe0mIXFjftd1bhmj4Km73E50'
        ),
        body := '{}'::jsonb
    );
    $$
);

-- 6. Verificar se o job foi criado
SELECT * FROM cron.job WHERE jobname = 'generate-opportunities-daily';

-- 7. Log de sucesso
DO $$
BEGIN
    RAISE NOTICE 'Cron job generate-opportunities-daily configurado para rodar às 5:00 AM (Brasília) / 8:00 UTC';
END $$;
