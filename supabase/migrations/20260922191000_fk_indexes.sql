-- Indices nas colunas de FK que nao tinham nenhum.
--
-- Quando o pai e apagado, o Postgres executa a regra da FK (SET NULL / NO
-- ACTION) uma vez POR LINHA apagada, com um `where <fk> = $1` no filho. Sem
-- indice nessa coluna, cada linha do pai custa uma varredura completa do filho:
-- apagar os 7 mil contatos de uma conta varria `sales` 7 mil vezes. Era o que
-- estourava o tempo da exclusao de conta -- e o mesmo custo aparece no uso
-- normal (excluir um contato, um agendamento ou uma venda pela tela).
--
-- Somente tabelas com mais de 1000 linhas; nas menores a varredura e irrelevante.
-- Todas cabem em CREATE INDEX comum (a maior tem 43 mil linhas, milissegundos);
-- o lock e de escrita, so na propria tabela.

create index if not exists idx_response_times_agent_id
    on public.response_times (agent_id);
create index if not exists idx_crm_client_history_user_id
    on public.crm_client_history (user_id);
create index if not exists idx_instagram_webhook_logs_instance_id
    on public.instagram_webhook_logs (instance_id);
create index if not exists idx_crm_client_professional_id
    on public.crm_client (professional_id);
create index if not exists idx_notifications_related_user_id
    on public.notifications (related_user_id);
create index if not exists idx_conversations_instagram_instance_id
    on public.conversations (instagram_instance_id);
create index if not exists idx_ai_analysis_user_id
    on public.ai_analysis (user_id);
create index if not exists idx_campaign_contacts_user_id
    on public.campaign_contacts (user_id);
create index if not exists idx_acs_instance_id
    on public.appointment_confirmation_sessions (instance_id);
create index if not exists idx_conversation_view_logs_team_member_id
    on public.conversation_view_logs (team_member_id);
create index if not exists idx_contacts_instagram_instance_id
    on public.contacts (instagram_instance_id);
create index if not exists idx_sales_responsavel_id
    on public.sales (responsavel_id);
create index if not exists idx_sales_contact_id
    on public.sales (contact_id);
create index if not exists idx_appointments_service_id
    on public.appointments (service_id);
create index if not exists idx_appointments_expected_sale_id
    on public.appointments (expected_sale_id);
create index if not exists idx_appointments_google_calendar_sync_id
    on public.appointments (google_calendar_sync_id);
create index if not exists idx_appointments_campaign_id
    on public.appointments (campaign_id);
create index if not exists idx_appointments_created_by
    on public.appointments (created_by);
create index if not exists idx_group_members_user_id
    on public.group_members (user_id);
create index if not exists idx_crm_client_services_service_client_id
    on public.crm_client_services (service_client_id);
