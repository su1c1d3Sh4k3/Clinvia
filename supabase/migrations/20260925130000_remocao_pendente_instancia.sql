-- Remoção pendente de instância — o fim do "force delete".
--
-- O QUE ESTAVA ERRADO
-- `uzapi-delete-instance` pedia a remoção à UAZAPI, e quando o provedor RECUSAVA
-- ela apagava a nossa linha do mesmo jeito. O comentário no código dizia isso com
-- todas as letras ("Let's assume we want to force delete from DB if user requested
-- it"). O efeito não é forçar a vontade do cliente: é perder a única coisa que nos
-- deixava saber que aquele número existe. O número segue na UAZAPI, segue recebendo
-- mensagem de paciente, provavelmente segue sendo cobrado — e nós deixamos de
-- conseguir nem olhar.
--
-- Medido em 25/09/2026: `GET /instance/all` na UAZAPI devolve 11 instâncias; a
-- nossa tabela tem 2 linhas `uzapi`. São 9 órfãs — 7 delas de clínicas reais que
-- chegaram a parear. (Todas `disconnected` hoje, o que é sorte, não desenho.)
--
-- O QUE PASSA A VALER
-- Provedor recusou ⇒ a linha NÃO é apagada. Ela fica marcada como remoção
-- pendente, o cliente lê uma mensagem clara, e abre incidente para alguém concluir.
-- Dado que a gente enxerga é sempre melhor que órfão invisível.
--
-- Rollback: 20260925130000_remocao_pendente_instancia_rollback.sql

alter table public.instances
    add column if not exists removal_pending_at    timestamptz,
    add column if not exists removal_error         text,
    add column if not exists removal_requested_by  uuid;

comment on column public.instances.removal_pending_at is
    'Quando o cliente pediu a exclusão e o provedor recusou. Não-nulo = a linha só '
    'continua aqui para não virar órfã invisível no provedor; o suporte precisa concluir.';
comment on column public.instances.removal_error is
    'Motivo cru que o provedor devolveu ao recusar a remoção. É o que o suporte lê para saber o que tentar.';
comment on column public.instances.removal_requested_by is
    'auth.users.id de quem clicou em excluir. Sem FK de propósito: se a pessoa sair da conta, '
    'a pendência continua valendo — apagar o rastro do pedido não apaga a instância no provedor.';

-- Índice parcial: a varredura do suporte é sempre "quais estão pendentes", nunca
-- "esta aqui está?". Parcial porque o esperado é zero linha.
create index if not exists idx_instances_removal_pending
    on public.instances (removal_pending_at)
    where removal_pending_at is not null;

-- Catálogo do incidente.
--
-- `media`, não `alta`: a pendência não derruba nada agora e não exige alguém de
-- madrugada. Mas não é `somente_painel`, porque sem alguém concluir ela nunca se
-- resolve sozinha — e o custo de esquecer é exatamente o órfão que este trabalho
-- existe para não criar de novo.
insert into public.incident_component_catalog
    (component, match_tipo, natureza, descricao, acao_padrao,
     is_active, somente_painel, severidade_padrao, severidade_teto)
values
    ('uazapi:remocao-pendente', 'exato', 'detector',
     'O cliente pediu a exclusao de uma instancia UAZAPI e o provedor recusou a remocao. '
     'A linha NAO foi apagada de proposito: apagar deixaria o numero rodando na UAZAPI sem '
     'nenhum controle nosso, recebendo mensagem de paciente e possivelmente com cobranca correndo.',
     'Concluir a remocao na UAZAPI (painel ou DELETE /instance com o token da instancia) e so '
     'entao apagar a linha. Se o numero na verdade deve continuar, limpar removal_pending_at.',
     true, false, 'media', null)
on conflict (component) do update
   set match_tipo        = excluded.match_tipo,
       natureza          = excluded.natureza,
       descricao         = excluded.descricao,
       acao_padrao       = excluded.acao_padrao,
       is_active         = excluded.is_active,
       somente_painel    = excluded.somente_painel,
       severidade_padrao = excluded.severidade_padrao,
       severidade_teto   = excluded.severidade_teto,
       updated_at        = now();
