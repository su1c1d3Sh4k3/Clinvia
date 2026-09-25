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
                         'token:cripto-ilegivel')
order by 1;
