-- Create queues table
CREATE TABLE IF NOT EXISTS queues (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    assigned_users TEXT[] DEFAULT '{}',
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE queues ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own queues" ON queues
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own queues" ON queues
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own queues" ON queues
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own queues" ON queues
    FOR DELETE USING (auth.uid() = user_id);

-- Function to create default queues
CREATE OR REPLACE FUNCTION create_default_queues()
RETURNS TRIGGER AS $$
BEGIN
    -- Atendimento IA
    INSERT INTO queues (user_id, name, is_active, is_default)
    VALUES (NEW.id, 'Atendimento IA', true, true);

    -- Atendimento Humano
    INSERT INTO queues (user_id, name, is_active, is_default)
    VALUES (NEW.id, 'Atendimento Humano', true, true);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on profiles (assuming profiles are created on user signup)
-- If profiles table doesn't exist or isn't used for signup, this might need to be on auth.users but we can't easily add triggers there from here.
-- We will assume public.profiles exists as seen in types.ts
DROP TRIGGER IF EXISTS on_profile_created_queues ON profiles;

CREATE TRIGGER on_profile_created_queues
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION create_default_queues();

-- Backfill for existing profiles
DO $$
DECLARE
    profile_record RECORD;
BEGIN
    FOR profile_record IN SELECT id FROM profiles LOOP
        -- Check if defaults exist
        IF NOT EXISTS (SELECT 1 FROM queues WHERE user_id = profile_record.id AND name = 'Atendimento IA') THEN
            INSERT INTO queues (user_id, name, is_active, is_default)
            VALUES (profile_record.id, 'Atendimento IA', true, true);
        END IF;

        IF NOT EXISTS (SELECT 1 FROM queues WHERE user_id = profile_record.id AND name = 'Atendimento Humano') THEN
            INSERT INTO queues (user_id, name, is_active, is_default)
            VALUES (profile_record.id, 'Atendimento Humano', true, true);
        END IF;
    END LOOP;
END;
$$;
