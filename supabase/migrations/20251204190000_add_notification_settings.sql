-- Add notification settings to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS group_notifications_enabled BOOLEAN DEFAULT true;
