-- =====================================================
-- RPC function to get average sentiment score
-- =====================================================
-- Busca ai_analysis JOIN conversations e calcula média do sentiment_score
-- Filtrado pelo user_id do owner
-- =====================================================

CREATE OR REPLACE FUNCTION get_avg_sentiment_score(owner_id UUID)
RETURNS NUMERIC AS $$
DECLARE
    avg_score NUMERIC;
BEGIN
    SELECT AVG(aa.sentiment_score)
    INTO avg_score
    FROM ai_analysis aa
    JOIN conversations c ON aa.conversation_id = c.id
    WHERE c.user_id = owner_id
      AND aa.sentiment_score IS NOT NULL;
    
    RETURN COALESCE(avg_score, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
