-- Rollback de 20260925160000_catalogo_erro_silencioso.sql
--
-- ATENÇÃO AO QUE ISTO FAZ DE VERDADE: apagar a linha NÃO cala o incidente — cala
-- o CATÁLOGO. Sem linha, o piso implícito vira `media`, `somente_painel` some e a
-- IA passa a ser a única autora da gravidade. Ou seja, remover `recibo:banco-`
-- daqui não tira o recibo de leitura do telefone dele: PROMOVE. Desfazer isto só
-- faz sentido junto com o rollback do código das edge functions.
--
-- Por isso o rollback é `is_active = false`, não `delete`: preserva a descrição e
-- a ação escritas aqui (que é o trabalho de verdade destes registros) e deixa
-- reversível com um `update` de uma linha.

set lock_timeout = '5s';
set statement_timeout = '120s';

update public.incident_component_catalog
set is_active  = false,
    updated_at = now()
where component in (
    'recebimento:banco-',
    'recibo:banco-',
    'instancia:sem-dono',
    'instancia:nao-encontrada',
    'conversa:orfa-migracao',
    'n8n:repasse-recusado',
    'n8n:repasse-falhou',
    'token:cripto-falhou',
    'token:cripto-ausente',
    'token:cripto-ilegivel',
    'token:openai-leitura',
    'template-sends:log'
);

-- Para apagar de fato (perde descrição e ação):
--   delete from public.incident_component_catalog where component in (...);
