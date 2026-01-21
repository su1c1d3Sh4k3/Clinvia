-- Migration: Add function to append NPS entry to contacts
-- This uses SECURITY DEFINER to bypass RLS for the specific update

CREATE OR REPLACE FUNCTION add_nps_entry(
    p_contact_id UUID,
    p_nota INTEGER,
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
