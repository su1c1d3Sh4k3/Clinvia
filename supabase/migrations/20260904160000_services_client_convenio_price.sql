-- Valor cobrado quando o atendimento é por convênio.
--
-- Regra do user: o valor é UM SÓ por aplicação, não importa quantos convênios
-- cobrem o serviço. NULL = herda `price` (o valor particular) — assim reajustar
-- a tabela normal carrega o convênio junto até alguém digitar um valor próprio.
--
-- A coluna só é exibida/editada no front quando a aplicação está em
-- `convenio_servicos`; não existe trigger amarrando isso porque desmarcar o
-- serviço do convênio e remarcar depois deve preservar o valor já digitado.
alter table public.services_client
    add column if not exists convenio_price numeric;

comment on column public.services_client.convenio_price is
    'Valor por convênio. NULL = usa price. Único para todos os convênios da conta.';
