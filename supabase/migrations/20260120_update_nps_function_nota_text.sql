-- Migration: Update add_nps_entry function to accept nota as TEXT
-- This allows storing the display text like "Excelente" instead of numeric value

DROP FUNCTION IF EXISTS add_nps_entry(UUID, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION add_nps_entry(
    p_contact_id UUID,
    p_nota TEXT,
    p_feedback TEXT DEFAULT ''
) RETURNS VOID AS $$
BEGIN
    UPDATE contacts
    SET nps = COALESCE(nps, '[]'::jsonb) || jsonb_build_object(
        'dataPesquisa', NOW(),
        'nota', p_nota,
        'feedback', COALESCE(p_feedback, '')
    )
    WHERE id = p_contact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION add_nps_entry TO authenticated;
GRANT EXECUTE ON FUNCTION add_nps_entry TO service_role;
