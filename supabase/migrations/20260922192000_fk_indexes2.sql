-- Segundo lote de indices de FK. O primeiro lote (20260922191000) cobriu apenas
-- filhos com mais de 1000 linhas estimadas -- mas `reltuples = -1` significa
-- "nunca analisada", nao "pequena": `dados_atendimento.ticket_id -> conversations`
-- estava nessa situacao e, sendo NO ACTION sem indice, cada conversa apagada
-- varria a tabela inteira. Apagar as 16 mil conversas do maior tenant levava 46s
-- so por causa disso.
--
-- Aqui entram todos os filhos das tabelas quentes (conversations, contacts,
-- sales, appointments, crm_client, instances, professionals, services_client)
-- cuja coluna de FK nao tinha indice, independente do tamanho estimado.

create index if not exists idx_dados_atendimento_ticket_id
    on public.dados_atendimento (ticket_id);
create index if not exists idx_orcamentos_contact_id
    on public.orcamentos (contact_id);
create index if not exists idx_orcamento_itens_service_client_id
    on public.orcamento_itens (service_client_id);
create index if not exists idx_deliveries_appointment_id
    on public.deliveries (appointment_id);
create index if not exists idx_revenues_appointment_id
    on public.revenues (appointment_id);
create index if not exists idx_tasks_contact_id
    on public.tasks (contact_id);
create index if not exists idx_das_contact_id
    on public.delivery_automation_sessions (contact_id);
create index if not exists idx_das_instance_id
    on public.delivery_automation_sessions (instance_id);
create index if not exists idx_groups_instance_id
    on public.groups (instance_id);
create index if not exists idx_message_templates_instance_id
    on public.message_templates (instance_id);
create index if not exists idx_campaigns_instance_id
    on public.campaigns (instance_id);
create index if not exists idx_auto_messages_instance_id
    on public.auto_messages (instance_id);
create index if not exists idx_opportunities_professional_id
    on public.opportunities (professional_id);
create index if not exists idx_campaigns_recurrence_service_client_id
    on public.campaigns (recurrence_service_client_id);
create index if not exists idx_recurrence_tracking_service_client_id
    on public.recurrence_tracking (service_client_id);
