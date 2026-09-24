-- Rollback de 20260924140000: restaura o comentario anterior da coluna.
-- Atencao: o comportamento em si vive no `alert-notify` (IGNORA_TETO); desfazer
-- so este arquivo NAO faz o teto voltar a segurar critica.

comment on column public.llm_platform_settings.alert_max_per_hour is
    'Teto de mensagens enviadas por hora por destinatario. Excedente vira skipped_ratelimit + uma mensagem de resumo.';
