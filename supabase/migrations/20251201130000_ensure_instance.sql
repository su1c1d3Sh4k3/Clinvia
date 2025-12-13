INSERT INTO instances (instance_name, server_url, apikey, status)
VALUES (
  'Minha_instancia_2',
  'https://evolution-api.com', -- Placeholder, user can update if needed
  'global-key',                -- Placeholder
  'connected'
)
ON CONFLICT (instance_name) DO UPDATE
SET status = 'connected'; -- Ensure it's connected
