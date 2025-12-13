-- Add profile_pic_url to instances table
ALTER TABLE public.instances 
ADD COLUMN IF NOT EXISTS profile_pic_url TEXT;