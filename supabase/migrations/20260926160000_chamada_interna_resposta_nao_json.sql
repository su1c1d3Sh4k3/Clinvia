-- Chamada interna que responde 2xx com corpo ilegivel
-- =====================================================
-- `_shared/system-templates.ts` -> `callFunction` chama outra edge function com
-- service role e devolve `{ ok, result }`. Quando a resposta e 2xx mas o corpo
-- nao e JSON, `result` fica `null` e `ok` fica `true`: quem chamou trata
-- AUSENCIA DE DADO como sucesso e segue adiante.
--
-- E a forma mais traicoeira de falhar que existe nesta base — a mesma familia
-- do 401 do `alert-notify`, que passou semanas invisivel, e do `200 com lista
-- vazia` da UAZAPI de 26/09. Ate hoje so havia `console.error` no ponto, e log
-- que ninguem sabe que existe nao e monitoramento.
--
-- Severidade `media`, nao alta: quem responde 2xx esta NO AR — o que se perdeu
-- foi o conteudo de uma chamada interna, nao a entrada da mensagem do paciente.
-- Media cai no resumo de 2 em 2 horas, que e onde isto deve aparecer.

set lock_timeout = '5s';
set statement_timeout = '120s';

insert into public.incident_component_catalog
    (component, match_tipo, natureza, descricao, acao_padrao,
     severidade_padrao, severidade_teto, somente_painel, is_active)
values
    ('chamada-interna:resposta-nao-json', 'exato', 'servico',
     'uma edge function chamou outra com service role e recebeu 2xx com corpo que nao e JSON',
     'O chamador recebeu `ok: true` com `result: null` e seguiu como se tivesse dado — entao o '
     'efeito aparece longe daqui (template que nao foi criado, verificacao que "passou" sem medir). '
     'O campo `corpo` do contexto tem os primeiros 300 caracteres da resposta e costuma dizer o que '
     'e: HTML de gateway = 401/504 na frente da function; corpo vazio = a function morreu antes de '
     'escrever. Conferir o slug em `context.fn`, olhar o log dele na janela do incidente e, se for '
     'gateway, conferir a chave que o chamador apresenta (ha DUAS chaves de service em uso no '
     'projeto e o gateway aceita as duas, mas a function pode recusar).',
     'media', null, false, true)

on conflict (component) do update
   set match_tipo        = excluded.match_tipo,
       natureza          = excluded.natureza,
       descricao         = excluded.descricao,
       acao_padrao       = excluded.acao_padrao,
       severidade_padrao = excluded.severidade_padrao,
       severidade_teto   = excluded.severidade_teto,
       somente_painel    = excluded.somente_painel,
       is_active         = true,
       updated_at        = now();
