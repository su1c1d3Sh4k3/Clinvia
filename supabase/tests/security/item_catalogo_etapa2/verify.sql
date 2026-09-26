-- Prova do catalogo da Etapa 2: cada componente que o codigo novo pode gerar
-- resolve para uma severidade conhecida, e nenhum deles chega no telefone.
--
-- `incident_severidade_efetiva(component, null)` e exatamente a funcao que o
-- despacho usa. Testar o resultado dela, e nao a linha do catalogo, e o que
-- prova o comportamento: se amanha alguem trocar a regra de casamento, este
-- teste quebra; se eu testasse a linha, ele passaria mentindo.
with alvos(component, esperado) as (
    values
        -- provedores: o unico que pode acordar telefone e falta de credito
        ('openai:sem_credito',             'critica'),
        ('openai:limite_de_uso',           'media'),
        ('meta:credencial_recusada',       'media'),
        ('meta:fora_do_ar',                'media'),
        ('uazapi:timeout',                 'media'),
        ('google:credencial_recusada',     'media'),
        ('resend:fora_do_ar',              'media'),
        ('n8n:fora_do_ar',                 'media'),
        ('gemini:limite_de_uso',           'baixa'),
        -- functions de maior volume medido nos 7 dias
        ('webhook-handle-message',         'media'),
        ('ai-analyze-conversation',        'media'),
        ('transcribe-audio',               'media'),
        ('auto-close-worker',              'media'),
        ('api-crm',                        'media'),
        ('ia-workflow-webhook',            'media'),
        ('process-auto-follow-up',         'media'),
        -- linhas exatas ANTIGAS: a migration nao pode ter mudado nenhuma delas
        ('api-scheduling',                 'alta'),
        ('api-public-booking',             'alta'),
        ('meta-send-message',              'alta'),
        ('evolution-send-message',         'alta'),
        ('alert-notify',                   'critica'),
        ('campaign-dispatch',              'alta'),
        ('instagram-refresh-token',        'alta'),
        ('uzapi-manager',                  'alta'),
        -- teste continua sendo so-painel
        ('zz-teste:qualquer-coisa',        'baixa')
)
select format('%-6s %-30s esperado=%-8s obtido=%-8s catalogado=%s  painel=%s',
              case when public.incident_severidade_efetiva(a.component, null) = a.esperado
                   then 'ok' else 'FALHOU' end,
              a.component, a.esperado,
              public.incident_severidade_efetiva(a.component, null),
              -- catalogado = a linha EXISTE. A coluna homonima valia sempre
              -- `true` e sumiu na re-emissao de 20260924180000 (42703).
              exists (select 1 from public.incident_component_info(a.component)),
              coalesce((select c.somente_painel from public.incident_component_info(a.component) c), false)
       ) as linha
  from alvos a
union all
-- Gatilho de ROLLAGEM: componente `alta`/`critica` cadastrado na ultima hora,
-- isto e, pela migration que acabou de ser aplicada. Vale no instante do
-- rollout (que e quando a suite roda, por regra da casa) e fica inerte depois.
--
-- 25/09/2026: ele pegou os 8 componentes `alta` do catalogo de erro silencioso
-- (`20260925160000`) e REPROVOU a suite — trabalho dele, feito certo. Declarados
-- nominalmente abaixo com o motivo, em vez de afrouxar o gatilho: os 8 acordam
-- telefone DE PROPOSITO porque cada um deles ou perde mensagem de paciente na
-- entrada (`recebimento:banco-`, `instancia:*`, `n8n:repasse-*` deixam a
-- conversa muda na fila da IA) ou e incidente de seguranca/fatura
-- (`token:cripto-*` grava a chave do cliente em texto puro; `token:cripto-
-- ausente`/`-ilegivel` jogam o consumo dele na chave da plataforma).
--
-- 25/09/2026, segunda leva: os 4 de `20260925200000`, tambem por ordem nominal
-- dele. A recusa AVULSA da Meta ficou so-painel (`envio:rejeitado-`,
-- `envio:bloqueado-`) exatamente para que estes quatro signifiquem alguma coisa
-- quando tocarem: `envio:defeito-` e defeito NOSSO (131008/131009/131021/
-- 131045), `envio:conta-` e a conta inteira barrada (131031/131042),
-- `envio:pico-diario` e volume do dia acima de 3x a media de 7 dias com piso de
-- 10, e `recebimento:fila-parada` e payload de paciente represado ha mais de 10
-- minutos. Nenhum dispara por mensagem individual: ou e classe de falha nossa,
-- ou e a conta inteira, ou e agregado do dia.
-- 25/09/2026, terceira leva: os 2 da sentinela externa (`20260925230000`).
-- `sentinela:aplicacao-inacessivel` e critica mas SO-PAINEL — a propria sentinela
-- ja mandou o WhatsApp dela por fora, e deixar a plataforma avisar de novo faria
-- o mesmo fato chegar duas vezes no telefone. `sentinela:parou-de-reportar` e o
-- oposto e por isso toca: a sentinela esta muda por definicao quando ele dispara,
-- entao nao existe segunda via — se a plataforma nao falar, ninguem fala.
--
-- 26/09/2026: `banco:conexoes-saturadas` (`20260926130000`), por ordem nominal
-- dele — "conexoes em uso acima de 85% do maximo por 5 minutos = alta". Toca o
-- telefone e nao e supressao mal feita: quando o banco satura, o que para nao e
-- um detector, e a ENTRADA da mensagem do paciente — o webhook e os 40 jobs do
-- pg_cron disputam as mesmas 60 conexoes, e nesse estado nenhum outro alerta
-- consegue sair, porque todos precisam do mesmo banco. Nao dispara por leitura
-- avulsa: exige 5 amostras consecutivas de minuto acima de 85%, que e o que
-- separa pico de cron (dura um minuto) de saturacao de verdade.
-- 26/09/2026: `uzapi_admin_token_missing` (`20260926150000`). Nasceu junto com
-- a retirada do admintoken da UAZAPI do codigo. Ele so dispara num estado:
-- a function esta no ar e o secret nao esta no ambiente — e nesse estado
-- NENHUMA clinica consegue conectar WhatsApp nao-oficial, com a tela do
-- cliente dizendo apenas "fale com o suporte". Nao existe segunda via: se isto
-- nao tocar, o primeiro a saber e ele pelo telefone do cliente. Nao dispara por
-- erro de uso nem por falha do provedor — so por configuracao nossa ausente.
-- 26/09/2026: `instagram:renovacao-falhou` (`20260926180000`). Entra na mesma
-- migration que CALOU `instagram:token-vencido`, e e essa troca que o justifica:
-- token vencido e problema da conta do cliente e so ele resolve (reconectar por
-- OAuth), entao virou so-painel; ja a RENOVACAO que falha com o token ainda
-- valido e defeito NOSSO — a rotina existe justamente para o cliente nunca
-- precisar reconectar. Ele tem estopim de ~15 dias e e o unico componente de
-- Instagram que ainda toca: se ficar mudo, ninguem avisa a tempo e o cliente
-- descobre com o Direct parado.
-- Quem acrescentar um componente `alta` novo sem passar por aqui reprova.
select format('%-6s componentes novos que acordariam telefone: %s (tem que ser 0)',
              case when count(*) = 0 then 'ok' else 'FALHOU' end, count(*))
  from public.incident_component_catalog
 where created_at > now() - interval '1 hour'
   and severidade_padrao in ('critica', 'alta')
   and component not in ('recebimento:banco-',
                         'instancia:sem-dono',
                         'instancia:nao-encontrada',
                         'n8n:repasse-recusado',
                         'n8n:repasse-falhou',
                         'token:cripto-falhou',
                         'token:cripto-ausente',
                         'token:cripto-ilegivel',
                         'envio:defeito-',
                         'envio:conta-',
                         'envio:pico-diario',
                         'recebimento:fila-parada',
                         'sentinela:aplicacao-inacessivel',
                         'sentinela:parou-de-reportar',
                         'banco:conexoes-saturadas',
                         'uzapi_admin_token_missing',
                         'instagram:renovacao-falhou')
order by 1;
