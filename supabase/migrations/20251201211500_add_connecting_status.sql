-- Add 'connecting' status to instance_status enum
ALTER TYPE instance_status ADD VALUE IF NOT EXISTS 'connecting';
