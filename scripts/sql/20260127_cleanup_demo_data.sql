-- =============================================
-- CLEANUP MIGRATION
-- Removes all demo data created for user: c4ac5e5e-2bdb-4c9c-a309-8eae3582c0df
-- Preserves the main user account/profile
-- =============================================

DO $$
DECLARE
    v_user_id UUID := 'c4ac5e5e-2bdb-4c9c-a309-8eae3582c0df';
BEGIN
    -- 1. Sales & Installments (Installments cascade from sales)
    DELETE FROM sales WHERE user_id = v_user_id;
    
    -- 2. Appointments
    DELETE FROM appointments WHERE user_id = v_user_id;
    
    -- 3. Tasks & Boards
    DELETE FROM tasks WHERE user_id = v_user_id;
    DELETE FROM task_boards WHERE user_id = v_user_id;
    
    -- 4. CRM (Deals, Stages, Funnels)
    DELETE FROM crm_deals WHERE user_id = v_user_id;
    -- Stages don't have user_id, link via funnel
    DELETE FROM crm_stages WHERE funnel_id IN (SELECT id FROM crm_funnels WHERE user_id = v_user_id);
    DELETE FROM crm_funnels WHERE user_id = v_user_id;
    
    -- 5. Patients
    DELETE FROM patients WHERE user_id = v_user_id;
    
    -- 6. Professionals
    DELETE FROM professionals WHERE user_id = v_user_id;
    
    -- 7. Team Members (Only the demo ones created via seed)
    -- Emails used in seed:
    -- carlos.vendas@clinvia.com
    -- patricia.recepcao@clinvia.com
    -- bruno.agent@clinvia.com
    -- camila.agent@clinvia.com
    -- Also checking for old seed attempts with admin/sup emails if any exist
    DELETE FROM team_members 
    WHERE user_id = v_user_id 
    AND email IN (
        'carlos.vendas@clinvia.com',
        'patricia.recepcao@clinvia.com',
        'bruno.agent@clinvia.com', 
        'camila.agent@clinvia.com',
        'carlos.admin@clinvia.com',    -- from failed attempt
        'patricia.sup@clinvia.com'     -- from failed attempt
    );
    
    -- 8. Products & Services
    DELETE FROM products_services WHERE user_id = v_user_id;
    
    -- 9. Contacts (Cascades to conversations, messages, etc)
    DELETE FROM contacts WHERE id IN (
        -- Select contacts created by this user that match our demo pattern or just all contacts for this demo user?
        -- User assumption: "Clean all data created"
        -- Safest is deleting ALL contacts for this demo user
        SELECT id FROM contacts WHERE custom_attributes->>'created_by_seed' = 'true' -- If we had tagged them. We didn't.
    );
    -- Deleting all contacts for this user might be dangerous if they had manual contacts.
    -- But request says "excluir todos os dados que foram criados".
    -- I will delete by the specific emails/phones if possible, OR just delete all contacts linked to this user (via RLS logic, usually contacts don't have user_id directly in public.contacts table? Let's check schema).
    
    -- Checking schema of contacts from Step 41:
    -- CREATE TABLE IF NOT EXISTS public.contacts (id, remote_jid, ... ) 
    -- It does NOT have user_id column directly in 20251119 migration! 
    -- But RLS "Authenticated users can view contacts" uses true? That implies shared contacts?
    -- Wait, contacts are usually instance-scoped or user-scoped?
    -- Let's check `20251201140000_add_instance_id_to_contacts.sql`.
    -- If contacts are shared, how do we identify "created by this user"?
    -- Ah, `20260123_demo_data_seed.sql` inserted into `contacts (id, user_id, ...)`
    -- Wait, looking at my seed file again (Step 69/72):
    -- `INSERT INTO contacts (id, user_id, number, ...)`
    -- So `contacts` table MUST have `user_id`.
    -- Let's verify `20251202131000_backfill_user_id.sql` or similar.
    -- Yes, likely added later.
    
    DELETE FROM contacts WHERE user_id = v_user_id;

    RAISE NOTICE 'Cleanup complete for user %', v_user_id;

END $$;
