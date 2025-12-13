-- Migration: Create default "IA" tag for all admin profiles
-- Date: 2025-12-08

-- Function to create default IA tag for a profile
CREATE OR REPLACE FUNCTION public.create_default_ia_tag()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create tag for admins (users in profiles table, not in team_members)
    -- Check if this user is NOT a team member (i.e., is an admin/owner)
    IF NOT EXISTS (SELECT 1 FROM public.team_members WHERE user_id = NEW.id) THEN
        -- Create the IA tag if it doesn't already exist for this user
        INSERT INTO public.tags (user_id, name, color, is_active)
        VALUES (NEW.id, 'IA', '#7C3AED', true)
        ON CONFLICT DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create IA tag when a new admin profile is created
DROP TRIGGER IF EXISTS on_profile_created_ia_tag ON public.profiles;
CREATE TRIGGER on_profile_created_ia_tag
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.create_default_ia_tag();

-- Backfill: Create IA tag for all existing admin profiles that don't have one yet
DO $$
DECLARE
    profile_record RECORD;
BEGIN
    FOR profile_record IN 
        SELECT p.id 
        FROM public.profiles p
        WHERE NOT EXISTS (
            SELECT 1 FROM public.team_members tm WHERE tm.user_id = p.id
        )
        AND NOT EXISTS (
            SELECT 1 FROM public.tags t WHERE t.user_id = p.id AND t.name = 'IA'
        )
    LOOP
        INSERT INTO public.tags (user_id, name, color, is_active)
        VALUES (profile_record.id, 'IA', '#7C3AED', true);
    END LOOP;
END $$;
