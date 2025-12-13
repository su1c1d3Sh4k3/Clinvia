ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS instance_id UUID REFERENCES instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_instance_id ON contacts(instance_id);
