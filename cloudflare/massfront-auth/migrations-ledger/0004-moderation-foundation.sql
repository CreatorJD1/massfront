-- Additive, disabled-by-default moderation operations foundation.
--
-- Player identities are separated from retained moderation evidence through a
-- random subject_ref. Account deletion removes the user_id -> subject_ref map,
-- while cases, sanctions, appeals and the append-only action ledger retain only
-- the opaque reference and the evidence snapshot required for review.

CREATE TABLE IF NOT EXISTS moderation_subjects (
  user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  subject_ref TEXT NOT NULL UNIQUE,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS moderation_cases (
  id                TEXT PRIMARY KEY,
  report_id         INTEGER UNIQUE,
  reporter_ref      TEXT NOT NULL,
  subject_ref       TEXT NOT NULL,
  evidence_snapshot TEXT NOT NULL,
  state             TEXT NOT NULL DEFAULT 'open'
                    CHECK(state IN ('open','claimed','resolved')),
  claimed_by        TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  resolved_at       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_moderation_cases_queue
  ON moderation_cases(state,created_at,id);
CREATE INDEX IF NOT EXISTS idx_moderation_cases_subject
  ON moderation_cases(subject_ref,created_at);

CREATE TABLE IF NOT EXISTS moderation_sanctions (
  id            TEXT PRIMARY KEY,
  case_id       TEXT,
  subject_ref   TEXT NOT NULL,
  user_id       INTEGER,
  kind          TEXT NOT NULL CHECK(kind IN ('warning','suspend','ban')),
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK(status IN ('active','revoked','expired')),
  reason        TEXT NOT NULL,
  actor_ref     TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER,
  revoked_at    INTEGER,
  revoked_by    TEXT,
  revoke_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_moderation_sanctions_active_user
  ON moderation_sanctions(user_id,status,expires_at);
CREATE INDEX IF NOT EXISTS idx_moderation_sanctions_subject
  ON moderation_sanctions(subject_ref,created_at);

CREATE TABLE IF NOT EXISTS moderation_appeals (
  id                TEXT PRIMARY KEY,
  sanction_id       TEXT NOT NULL,
  appellant_ref     TEXT NOT NULL,
  state             TEXT NOT NULL DEFAULT 'open'
                    CHECK(state IN ('open','accepted','denied')),
  reason            TEXT NOT NULL,
  created_at        INTEGER NOT NULL,
  resolved_at       INTEGER,
  resolver_ref      TEXT,
  resolution_reason TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_moderation_appeals_one_open
  ON moderation_appeals(sanction_id,appellant_ref) WHERE state='open';
CREATE INDEX IF NOT EXISTS idx_moderation_appeals_queue
  ON moderation_appeals(state,created_at,id);

CREATE TABLE IF NOT EXISTS moderation_events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id      TEXT,
  subject_ref  TEXT NOT NULL,
  actor_kind   TEXT NOT NULL CHECK(actor_kind IN ('player','operator','system')),
  actor_ref    TEXT NOT NULL,
  action       TEXT NOT NULL,
  reason       TEXT NOT NULL,
  details_json TEXT,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_moderation_events_case
  ON moderation_events(case_id,created_at,id);
CREATE INDEX IF NOT EXISTS idx_moderation_events_subject
  ON moderation_events(subject_ref,created_at,id);

-- The event ledger is application-write-only. Even an accidental UPDATE or
-- DELETE in a future handler fails at the database boundary.
CREATE TRIGGER IF NOT EXISTS moderation_events_no_update
BEFORE UPDATE ON moderation_events
BEGIN
  SELECT RAISE(ABORT,'moderation_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS moderation_events_no_delete
BEFORE DELETE ON moderation_events
BEGIN
  SELECT RAISE(ABORT,'moderation_events is append-only');
END;
