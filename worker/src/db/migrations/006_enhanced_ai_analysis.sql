-- Migration 006: Enhanced AI Analysis
-- Adds new columns for more detailed AI analysis sections

-- Key insights extracted from the note
ALTER TABLE notes ADD COLUMN ai_key_insights TEXT DEFAULT '[]';

-- Relationship signals (positive indicators about the relationship)
ALTER TABLE notes ADD COLUMN ai_relationship_signals TEXT DEFAULT '[]';

-- Follow-up recommendations (specific actionable suggestions)
ALTER TABLE notes ADD COLUMN ai_follow_up_recommendations TEXT DEFAULT '[]';

-- Communication style insights
ALTER TABLE notes ADD COLUMN ai_communication_style TEXT;
