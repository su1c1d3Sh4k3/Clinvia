-- Ensure RLS is enabled on contacts
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to view all contacts
CREATE POLICY "Allow authenticated to view contacts"
ON contacts
FOR SELECT
TO authenticated
USING (true);
