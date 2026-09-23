-- Rollback de 20260923500000.
--
-- Remove SO o que aquela migration inseriu. As linhas que ja existiam antes
-- (`google-calendar-`, `openai:`, `n8n:`, `gemini:` e as exatas antigas) nao
-- aparecem aqui: o insert usou `on conflict do nothing` e nao encostou nelas.
--
-- Desfazer isto nao apaga incidente nenhum e nao muda severidade de nada que ja
-- foi notificado — a severidade e resolvida na leitura. O unico efeito e que os
-- componentes voltam a cair no padrao `media` de quem nao esta catalogado, e o
-- detector `monitoramento:componente-nao-catalogado` volta a reclamar deles.

delete from public.incident_component_catalog
 where component in (
    -- provedores
    'meta:', 'uazapi:', 'google:', 'resend:',
    -- familias de function
    'api-', 'ai-', 'meta-', 'instagram-', 'webhook-', 'admin-',
    'delivery-automation-', 'appointment-confirmation-', 'campaign-',
    -- exatas com texto proprio
    'webhook-handle-message', 'ai-analyze-conversation'
 );
