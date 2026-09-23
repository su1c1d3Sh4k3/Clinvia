-- Tres linhas que faltavam no catalogo de componentes.
--
-- 1. `zz-teste:` — prefixo reservado a teste, SOMENTE PAINEL.
--    Nasceu de um erro meu: um incidente de teste virou 🔴 CRITICO no WhatsApp
--    real do Super Admin. O dano foi zero; o custo nao. Se ele aprende que
--    vermelho pode ser ensaio, o alerta vermelho para de valer no dia em que
--    importa. Teste agora fica no painel e nao sai sozinho por canal nenhum.
--
-- 2. `api-scheduling` — estava fora do catalogo e, sem linha, caia em 'media',
--    que vai para o resumo de 2 em 2 horas. Agenda quebrada nao espera 2 horas:
--    quem sente e o paciente que perde a consulta. Nasce ALTA.
--
-- 3. `openai-alerts` — a ponte entre `openai_alerts` e `incidents`. Fica em
--    'media' de proposito: esses alertas ja trazem a propria severidade e, com
--    o teto de severidade (a IA escala, nunca rebaixa), a linha do catalogo
--    vira PISO. Piso alto aqui promoveria todo aviso de custo a urgencia.

insert into public.incident_component_catalog
    (component, match_tipo, natureza, severidade_padrao, somente_painel, descricao, acao_padrao)
values
    ('zz-teste:', 'prefixo', 'detector', 'baixa', true,
     'Prefixo reservado a incidentes de teste criados a mao para provar que uma '
     || 'deteccao ou um caminho de aviso funciona. Nao representa nada em producao.',
     'Nenhuma. Se aparecer um destes no painel fora de um teste em andamento, '
     || 'foi sujeira deixada para tras: apague a linha.'),

    ('api-scheduling', 'exato', 'servico', 'alta', false,
     'API que a IA usa para criar, remarcar e cancelar agendamento. Valida dia de '
     || 'trabalho, horario e intervalo do profissional antes de gravar, e e o unico '
     || 'caminho pelo qual uma conversa vira consulta na agenda.',
     'Quando ela falha, a IA responde ao paciente sem conseguir agendar — e o '
     || 'paciente vai embora achando que agendou. Confira, nesta ordem: (1) o erro '
     || 'exato no painel, que ja vem com `code` estavel; (2) se e erro de validacao '
     || '(horario fora do expediente, sala sem profissional) ou de banco; (3) o '
     || 'workflow do n8n, se a chamada nem chegou. Cheque a agenda do dia por '
     || 'agendamentos que a IA prometeu e nao gravou.'),

    ('openai-alerts', 'exato', 'detector', 'media', false,
     'Ponte que transforma as linhas de `openai_alerts` (sincronizacao de uso '
     || 'parada, consumo zerado em dia util, anomalia de gasto, saldo baixo) em '
     || 'incidente. Nao mede nada sozinha: so carrega para o painel o que os '
     || 'detectores de custo ja apuraram.',
     'Abra o alerta de origem no Super Admin para ver qual dos quatro detectores '
     || 'disparou. Alerta de custo NUNCA corta o servico — e aviso, nao corte; '
     || 'a acao e humana.')
on conflict (component) do update set
    match_tipo        = excluded.match_tipo,
    natureza          = excluded.natureza,
    severidade_padrao = excluded.severidade_padrao,
    somente_painel    = excluded.somente_painel,
    descricao         = excluded.descricao,
    acao_padrao       = excluded.acao_padrao,
    is_active         = true,
    updated_at        = now();
