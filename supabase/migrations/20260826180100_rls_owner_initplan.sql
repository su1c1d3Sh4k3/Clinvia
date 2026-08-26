-- RLS: get_owner_id() por LINHA era o gargalo do CRM (e de qualquer varredura grande).
-- `user_id = get_owner_id()` não é constant-folded: a função plpgsql (2 SELECTs em
-- team_members) roda uma vez POR LINHA avaliada. No funil do tenant maior são ~8.1k
-- linhas => ~16k queries só para checar a RLS, e o board estourava statement_timeout
-- quando não paginado.
-- `user_id = (SELECT get_owner_id())` vira InitPlan: avaliado UMA vez por statement.
-- Mesmo padrão já usado em my_agent_scope_*(). Semântica idêntica (função sem args).

SET lock_timeout = '5s';

ALTER POLICY "Team manage crm_client" ON public.crm_client
    USING (user_id = (SELECT get_owner_id()))
    WITH CHECK (user_id = (SELECT get_owner_id()));

ALTER POLICY "contacts_all" ON public.contacts
    USING (user_id = (SELECT get_owner_id()))
    WITH CHECK (user_id = (SELECT get_owner_id()));

ALTER POLICY "Team manage crm_client_services" ON public.crm_client_services
    USING (EXISTS (
        SELECT 1 FROM crm_client cc
        WHERE cc.id = crm_client_services.crm_client_id
          AND cc.user_id = (SELECT get_owner_id())))
    WITH CHECK (EXISTS (
        SELECT 1 FROM crm_client cc
        WHERE cc.id = crm_client_services.crm_client_id
          AND cc.user_id = (SELECT get_owner_id())));

ALTER POLICY "Team manage client services" ON public.services_client
    USING (user_id = (SELECT get_owner_id()))
    WITH CHECK (user_id = (SELECT get_owner_id()));

ALTER POLICY "Read template and team service names" ON public.service_name
    USING (user_id IS NULL OR user_id = (SELECT get_owner_id()));

ALTER POLICY "Team delete service names" ON public.service_name
    USING (user_id = (SELECT get_owner_id()));

ALTER POLICY "Team insert service names" ON public.service_name
    WITH CHECK (user_id = (SELECT get_owner_id()));

ALTER POLICY "Team update service names" ON public.service_name
    USING (user_id = (SELECT get_owner_id()));

ALTER POLICY "Team can manage appointments" ON public.appointments
    USING (user_id = (SELECT get_owner_id()))
    WITH CHECK (user_id = (SELECT get_owner_id()));

ALTER POLICY "appointments_all" ON public.appointments
    USING (user_id = (SELECT get_owner_id()))
    WITH CHECK (user_id = (SELECT get_owner_id()));
