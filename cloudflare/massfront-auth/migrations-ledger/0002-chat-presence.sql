-- ============================================================================
-- MIGRATION 0002 — disabled-by-default friend chat + ephemeral presence
-- ----------------------------------------------------------------------------
-- Safe to re-run: this migration contains only CREATE ... IF NOT EXISTS.
-- Wrangler applies it after 0001-production-baseline.sql and records the
-- result in d1_migrations.
--
-- Applying this migration does NOT enable chat or presence. The Worker keeps
-- both capabilities false until the corresponding explicit environment flag
-- is set. See wrangler.toml for the operator contract.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_messages_from
  ON messages(from_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_messages_to_page
  ON messages(to_id, created_at, id);

CREATE TABLE IF NOT EXISTS presence (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state      TEXT NOT NULL CHECK (state IN ('online','away')),
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_presence_expires ON presence(expires_at);
