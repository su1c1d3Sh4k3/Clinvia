-- Teto por hora deixa de valer para critica e alta.
--
-- REGRA DO DONO (24/09/2026): "Nunca existe teto de envio. Critica e alta saem
-- sempre, quantas forem. Se der 40 alertas criticos num dia, quero os 40."
-- O "maximo 5 por dia" do plano e META DE CALIBRAGEM, nao regra de envio: o
-- caminho legitimo para chegar la e parar de GERAR alerta que nao exige acao —
-- suprima na origem, nunca na porta.
--
-- A decisao mora no `alert-notify` (constante IGNORA_TETO, espelhando
-- IGNORA_JANELA). Esta migration existe porque o COMENTARIO da coluna afirmava
-- outra coisa, e comentario de catalogo e o que a proxima pessoa le antes do
-- codigo. Alem disso a promessa de "uma mensagem de resumo do excedente" nunca
-- foi implementada: o excedente virava `skipped_ratelimit` e o incidente
-- voltava para a fila com recuo. Nao havia perda permanente — havia ATRASO de
-- ate 30 min em critica, que ja e inaceitavel.

comment on column public.llm_platform_settings.alert_max_per_hour is
    'Teto de mensagens por hora por destinatario. Vale SOMENTE para media/baixa '
    '(resumo de 2 em 2 horas e rajada agrupada). Critica e alta NUNCA sao '
    'seguradas por teto: saem quantas forem. Excedente de media/baixa vira '
    'skipped_ratelimit e o incidente volta para a fila com recuo — nao se perde.';
