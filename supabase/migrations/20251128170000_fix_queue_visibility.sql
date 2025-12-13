-- Fix Queue Visibility for Agents
-- Drop the restrictive policy that only allows creators (admins) to view queues
DROP POLICY IF EXISTS "Users can view their own queues" ON public.queues;

-- Create a new policy allowing all authenticated users (Admins, Supervisors, Agents) to view queues
CREATE POLICY "Authenticated users can view queues"
ON public.queues FOR SELECT
TO authenticated
USING (true);

-- Ensure other operations remain restricted to the owner (Admin)
-- "Users can insert their own queues" -> Already exists, keeps it admin-only (effectively)
-- "Users can update their own queues" -> Already exists
-- "Users can delete their own queues" -> Already exists
