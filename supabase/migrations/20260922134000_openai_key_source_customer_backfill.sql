-- Etapa "projeto e chave OpenAI por conta": marca como 'customer' as contas que
-- JA tinham chave OpenAI propria antes do provisionamento pela plataforma.
--
-- Essas contas continuam com markup 0 e billable = false (a fatura da OpenAI e do
-- cliente, nao nossa). Sem esta linha elas ficariam com openai_key_source NULL e
-- seriam tratadas como "conta na chave compartilhada" — cobrando estimativa por
-- cima de um consumo que nao pagamos.
--
-- ORDEM DE APLICACAO (decisao do user, 22/09/2026): aplicar SO DEPOIS que ele
-- terminar a exclusao de clientes — o conjunto de contas com token muda.
-- Em 22/09/2026 eram 4 contas.
--
-- Idempotente: o `and openai_key_source is null` protege quem ja foi classificado
-- (uma conta provisionada pela plataforma nasce 'platform' e nao e tocada aqui).

update public.profiles
set openai_key_source = 'customer'
where openai_token is not null
  and openai_key_source is null;
