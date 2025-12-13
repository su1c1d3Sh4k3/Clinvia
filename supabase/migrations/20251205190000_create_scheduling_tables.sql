DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_type') THEN
        CREATE TYPE appointment_type AS ENUM ('appointment', 'absence');
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.professionals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    role TEXT,
    service_ids UUID[] DEFAULT '{}',
    work_days INTEGER[] DEFAULT '{}', -- 0=Sunday, 1=Monday, etc.
    work_hours JSONB DEFAULT '{"start": "09:00", "end": "18:00", "break_start": "12:00", "break_end": "13:00"}',
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    professional_id UUID REFERENCES public.professionals(id) ON DELETE CASCADE NOT NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    service_id UUID REFERENCES public.products_services(id) ON DELETE SET NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    price NUMERIC DEFAULT 0,
    description TEXT,
    type appointment_type DEFAULT 'appointment',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT valid_time_range CHECK (end_time > start_time)
);

-- Enable RLS
ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own professionals"
    ON public.professionals
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own appointments"
    ON public.appointments
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Overlap Check Function
CREATE OR REPLACE FUNCTION check_appointment_overlap(
    p_professional_id UUID,
    p_start_time TIMESTAMPTZ,
    p_end_time TIMESTAMPTZ,
    p_exclude_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    overlap_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO overlap_count
    FROM public.appointments
    WHERE professional_id = p_professional_id
    AND (id != p_exclude_id OR p_exclude_id IS NULL)
    AND start_time < p_end_time
    AND end_time > p_start_time;

    RETURN overlap_count > 0;
END;
$$;

-- Storage Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('professional-avatars', 'professional-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
CREATE POLICY "Authenticated users can upload professional avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'professional-avatars' AND auth.uid() = owner);

CREATE POLICY "Authenticated users can update professional avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'professional-avatars' AND auth.uid() = owner);

CREATE POLICY "Anyone can view professional avatars"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'professional-avatars');

CREATE POLICY "Authenticated users can delete professional avatars"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'professional-avatars' AND auth.uid() = owner);
