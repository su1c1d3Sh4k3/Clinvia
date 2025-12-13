-- Create scheduling_settings table
CREATE TABLE IF NOT EXISTS public.scheduling_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    start_hour INTEGER NOT NULL DEFAULT 8,
    end_hour INTEGER NOT NULL DEFAULT 19,
    work_days INTEGER[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}', -- 0=Sun, 1=Mon, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.scheduling_settings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own scheduling settings"
    ON public.scheduling_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own scheduling settings"
    ON public.scheduling_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own scheduling settings"
    ON public.scheduling_settings FOR UPDATE
    USING (auth.uid() = user_id);

-- Create storage bucket for any future needs (optional, but good practice if we add logos etc)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('scheduling-assets', 'scheduling-assets', true) ON CONFLICT DO NOTHING;
