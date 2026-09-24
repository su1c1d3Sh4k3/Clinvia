-- Catalogo das duas familias de "mensagem aceita no envio e recusada depois".
--
-- POR QUE ISTO EXISTE (medido em 24/09/2026)
-- ------------------------------------------
-- Um atendente respondeu um cliente, a mensagem nao chegou, e nenhum alerta foi
-- emitido. A causa nao e uma funcao quebrada: e uma CLASSE de falha que nao tem
-- como ser vista pelo monitoramento atual.
--
-- No envio, a Meta responde 200 com wamid de verdade. O recibo de falha chega
-- minutos depois, por webhook assincrono, e o `webhook-handle-status` responde
-- 200 tambem. Como o `serveMonitored` so relata resposta >= 500, nada nessa
-- cadeia e visto. No dia da medicao, 9 mensagens de clientes morreram assim,
-- numa unica conta, com o painel verde o dia inteiro.
--
-- A partir de agora o `webhook-handle-status` relata um incidente quando uma
-- mensagem REAL de conversa vira `failed`. O componente carrega o codigo do
-- provedor e a instancia entre parenteses:
--
--     envio:rejeitado-131042 (pele-10)
--     envio:bloqueado-131047 (meta-488512407686498)
--
-- Duas consequencias desse formato, ambas de proposito:
--   1. incidente e deduplicado por componente, entao N mensagens perdidas pelo
--      MESMO motivo na MESMA instancia acumulam em UM incidente. Supressao na
--      origem, nunca na porta.
--   2. a instancia entre parenteses e lida pela mesma cadeia que o `alert-notify`
--      ja usa para descobrir o cliente, entao o campo "Cliente" do titulo
--      resolve sem codigo novo.
--
-- Por que DUAS familias e nao uma: o primeiro respondente e diferente.
--   - `bloqueado` = aquele destinatario nao pode receber aquela mensagem
--     (numero sem WhatsApp, janela de 24h fechada, limite por usuario da Meta).
--     Nao ha o que consertar no codigo; ha o que consertar no fluxo.
--   - `rejeitado` = qualquer outro motivo: saude da conta, template pausado,
--     limite de envio estourado, codigo desconhecido. Isso e defeito nosso.

insert into public.incident_component_catalog
    (component, match_tipo, natureza, severidade_padrao, somente_painel, descricao, acao_padrao)
values

('envio:rejeitado-', 'prefixo', 'detector', 'alta', false,
 'Mensagem que o provedor ACEITOU no envio (respondeu 200 com identificador real) e derrubou depois, por recibo assincrono, por motivo que e responsabilidade NOSSA: saude da conta, template pausado ou reprovado, limite de envio estourado, ou codigo que ainda nao foi classificado. O numero no fim do componente e o codigo do provedor e a instancia esta entre parenteses. Quem enviou nao viu erro nenhum: a tela disse que a mensagem saiu.',
 'O destinatario NAO recebeu. Abra a conversa citada: a mensagem esta la marcada como falha. Confira a qualidade e o limite do numero em Campanhas e, se o codigo apontar para template, o estado dele no Gerenciador da Meta. Se varias instancias aparecerem com o mesmo codigo ao mesmo tempo, o problema e da plataforma, nao do cliente.'),

('envio:bloqueado-', 'prefixo', 'detector', 'media', false,
 'Mensagem aceita no envio e recusada depois porque AQUELE destinatario nao podia receber AQUELA mensagem: numero sem WhatsApp, janela de 24 horas fechada (131047), limite por usuario da Meta, tipo de mensagem nao suportado. Nao e defeito de codigo — mas a mensagem nao chegou, e isso continua sendo um fato que o dono da conta precisa saber.',
 'O destinatario NAO recebeu. Em 131047 a janela de 24h fechou e so um template aprovado passa — se isso estiver acontecendo em resposta de atendente, o atendente precisa ser avisado na hora, porque a tela dele disse que a mensagem saiu. Volume alto de 131026 costuma ser lista de contatos com numero errado.')

on conflict (component) do update set
    match_tipo        = excluded.match_tipo,
    natureza          = excluded.natureza,
    severidade_padrao = excluded.severidade_padrao,
    somente_painel    = excluded.somente_painel,
    descricao         = excluded.descricao,
    acao_padrao       = excluded.acao_padrao,
    is_active         = true,
    updated_at        = now();
