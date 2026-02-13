-- Check total deals
SELECT count(*) as total_deals FROM crm_deals;

-- Check deals for a specific contact (or latest deals)
SELECT 
    d.id, 
    d.title, 
    d.contact_id, 
    c.push_name as contact_name, 
    d.user_id as deal_user_id,
    auth.uid() as current_auth_uid
FROM crm_deals d
LEFT JOIN contacts c ON d.contact_id = c.id
ORDER BY d.created_at DESC
LIMIT 5;

-- Check what get_owner_id() returns
SELECT get_owner_id() as owner_id;

-- Check valid contacts with deals
SELECT 
    c.id as contact_id,
    c.push_name,
    count(d.id) as deal_count
FROM contacts c
JOIN crm_deals d ON d.contact_id = c.id
GROUP BY c.id, c.push_name
HAVING count(d.id) > 0
LIMIT 5;
