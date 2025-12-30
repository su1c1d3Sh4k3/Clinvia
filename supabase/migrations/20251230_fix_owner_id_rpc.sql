-- Fix quick_messages RLS to work properly with team members
-- The issue is that get_owner_id() might have issues with RLS recursion

-- First, let's create a debug function to test get_owner_id
CREATE OR REPLACE FUNCTION public.debug_get_owner_id()
RETURNS TABLE(
    auth_uid UUID,
    owner_id UUID,
    found_by_auth_user_id BOOLEAN,
    found_by_user_id BOOLEAN
) AS $$
DECLARE
    v_auth_uid UUID;
    v_owner_id UUID;
    v_found_by_auth BOOLEAN := FALSE;
    v_found_by_user BOOLEAN := FALSE;
BEGIN
    v_auth_uid := auth.uid();
    
    -- Try to find by auth_user_id
    SELECT tm.user_id INTO v_owner_id
    FROM public.team_members tm
    WHERE tm.auth_user_id = v_auth_uid;
    
    IF v_owner_id IS NOT NULL THEN
        v_found_by_auth := TRUE;
        RETURN QUERY SELECT v_auth_uid, v_owner_id, v_found_by_auth, v_found_by_user;
        RETURN;
    END IF;
    
    -- Try to find by user_id (admin)
    SELECT tm.user_id INTO v_owner_id
    FROM public.team_members tm
    WHERE tm.user_id = v_auth_uid AND tm.role = 'admin';
    
    IF v_owner_id IS NOT NULL THEN
        v_found_by_user := TRUE;
        RETURN QUERY SELECT v_auth_uid, v_owner_id, v_found_by_auth, v_found_by_user;
        RETURN;
    END IF;
    
    -- Fallback
    v_owner_id := v_auth_uid;
    RETURN QUERY SELECT v_auth_uid, v_owner_id, v_found_by_auth, v_found_by_user;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.debug_get_owner_id() TO authenticated;

-- Now let's recreate the quick_messages RLS policies to be more permissive
-- The policy should allow team members to access messages that belong to their owner

DROP POLICY IF EXISTS "Team can view quick_messages" ON public.quick_messages;
DROP POLICY IF EXISTS "Team can insert quick_messages" ON public.quick_messages;
DROP POLICY IF EXISTS "Team can update quick_messages" ON public.quick_messages;
DROP POLICY IF EXISTS "Team can delete quick_messages" ON public.quick_messages;
DROP POLICY IF EXISTS "Users can view their own quick messages" ON public.quick_messages;
DROP POLICY IF EXISTS "Users can insert their own quick messages" ON public.quick_messages;
DROP POLICY IF EXISTS "Users can update their own quick messages" ON public.quick_messages;
DROP POLICY IF EXISTS "Users can delete their own quick messages" ON public.quick_messages;

-- New simpler policies using EXISTS instead of get_owner_id()
-- This avoids any potential issues with the helper function

CREATE POLICY "quick_messages_select" ON public.quick_messages
    FOR SELECT TO authenticated
    USING (
        user_id IN (
            -- Get owner_id for current user
            SELECT COALESCE(
                (SELECT tm.user_id FROM public.team_members tm WHERE tm.auth_user_id = auth.uid() LIMIT 1),
                (SELECT tm.user_id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.role = 'admin' LIMIT 1),
                auth.uid()
            )
        )
    );

CREATE POLICY "quick_messages_insert" ON public.quick_messages
    FOR INSERT TO authenticated
    WITH CHECK (
        user_id IN (
            SELECT COALESCE(
                (SELECT tm.user_id FROM public.team_members tm WHERE tm.auth_user_id = auth.uid() LIMIT 1),
                (SELECT tm.user_id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.role = 'admin' LIMIT 1),
                auth.uid()
            )
        )
    );

CREATE POLICY "quick_messages_update" ON public.quick_messages
    FOR UPDATE TO authenticated
    USING (
        user_id IN (
            SELECT COALESCE(
                (SELECT tm.user_id FROM public.team_members tm WHERE tm.auth_user_id = auth.uid() LIMIT 1),
                (SELECT tm.user_id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.role = 'admin' LIMIT 1),
                auth.uid()
            )
        )
    );

CREATE POLICY "quick_messages_delete" ON public.quick_messages
    FOR DELETE TO authenticated
    USING (
        user_id IN (
            SELECT COALESCE(
                (SELECT tm.user_id FROM public.team_members tm WHERE tm.auth_user_id = auth.uid() LIMIT 1),
                (SELECT tm.user_id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.role = 'admin' LIMIT 1),
                auth.uid()
            )
        )
    );
