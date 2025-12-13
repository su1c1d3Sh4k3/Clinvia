SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE table_name IN ('professionals', 'products_services', 'contacts', 'crm_deals', 'crm_stages', 'crm_funnels', 'appointments')
ORDER BY table_name, ordinal_position;
