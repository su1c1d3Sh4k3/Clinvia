-- =============================================
-- FIX: Permitir exclusão de usuários via cascade
-- Data: 2025-12-14 21:31
-- =============================================
-- O erro "Failed to delete user" ocorre por foreign keys
-- que não têm ON DELETE CASCADE
-- =============================================

-- 1. team_members.user_id -> precisa de cascade
ALTER TABLE public.team_members 
DROP CONSTRAINT IF EXISTS team_members_user_id_fkey;

ALTER TABLE public.team_members 
ADD CONSTRAINT team_members_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. team_members.auth_user_id -> precisa de cascade
ALTER TABLE public.team_members 
DROP CONSTRAINT IF EXISTS team_members_auth_user_id_fkey;

ALTER TABLE public.team_members 
ADD CONSTRAINT team_members_auth_user_id_fkey 
FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. queues.user_id -> precisa de cascade
ALTER TABLE public.queues 
DROP CONSTRAINT IF EXISTS queues_user_id_fkey;

ALTER TABLE public.queues 
ADD CONSTRAINT queues_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 4. instances.user_id -> precisa de cascade
ALTER TABLE public.instances 
DROP CONSTRAINT IF EXISTS instances_user_id_fkey;

ALTER TABLE public.instances 
ADD CONSTRAINT instances_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 5. contacts.user_id -> precisa de cascade
ALTER TABLE public.contacts 
DROP CONSTRAINT IF EXISTS contacts_user_id_fkey;

ALTER TABLE public.contacts 
ADD CONSTRAINT contacts_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 6. conversations.user_id -> precisa de cascade
ALTER TABLE public.conversations 
DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;

ALTER TABLE public.conversations 
ADD CONSTRAINT conversations_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 7. messages.user_id -> precisa de cascade
ALTER TABLE public.messages 
DROP CONSTRAINT IF EXISTS messages_user_id_fkey;

ALTER TABLE public.messages 
ADD CONSTRAINT messages_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 8. tags.user_id -> precisa de cascade
ALTER TABLE public.tags 
DROP CONSTRAINT IF EXISTS tags_user_id_fkey;

ALTER TABLE public.tags 
ADD CONSTRAINT tags_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 9. expenses.user_id -> precisa de cascade
ALTER TABLE public.expenses 
DROP CONSTRAINT IF EXISTS expenses_user_id_fkey;

ALTER TABLE public.expenses 
ADD CONSTRAINT expenses_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 10. revenues.user_id -> precisa de cascade
ALTER TABLE public.revenues 
DROP CONSTRAINT IF EXISTS revenues_user_id_fkey;

ALTER TABLE public.revenues 
ADD CONSTRAINT revenues_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 11. marketing_campaigns.user_id -> precisa de cascade
ALTER TABLE public.marketing_campaigns 
DROP CONSTRAINT IF EXISTS marketing_campaigns_user_id_fkey;

ALTER TABLE public.marketing_campaigns 
ADD CONSTRAINT marketing_campaigns_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 12. team_costs.user_id -> precisa de cascade
ALTER TABLE public.team_costs 
DROP CONSTRAINT IF EXISTS team_costs_user_id_fkey;

ALTER TABLE public.team_costs 
ADD CONSTRAINT team_costs_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 13. Outras tabelas que podem ter user_id
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT tc.table_name, tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'user_id'
        AND tc.table_schema = 'public'
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.constraint_name);
            EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE', r.table_name, r.constraint_name);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not update constraint % on table %: %', r.constraint_name, r.table_name, SQLERRM;
        END;
    END LOOP;
END $$;
