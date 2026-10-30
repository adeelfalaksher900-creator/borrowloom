PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Member',
  recovery_hash TEXT UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS circles (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  rules TEXT NOT NULL DEFAULT '',
  care_days INTEGER NOT NULL CHECK(care_days BETWEEN 0 AND 3),
  invite_hash TEXT NOT NULL,
  is_example INTEGER NOT NULL DEFAULT 0 CHECK(is_example IN (0,1)),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS members (
  circle_id TEXT NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (circle_id, user_id)
);
CREATE INDEX IF NOT EXISTS members_user ON members(user_id,circle_id);
CREATE TABLE IF NOT EXISTS garments (
  id TEXT PRIMARY KEY,
  circle_id TEXT NOT NULL REFERENCES circles(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('full_body','upper_body','outer')),
  size_label TEXT NOT NULL,
  colour TEXT NOT NULL DEFAULT '',
  measurements TEXT NOT NULL DEFAULT '',
  condition_note TEXT NOT NULL DEFAULT '',
  care_note TEXT NOT NULL DEFAULT '',
  photo BLOB,
  photo_type TEXT,
  asset TEXT,
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  CHECK(photo IS NOT NULL OR asset IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS garments_circle ON garments(circle_id,archived);
CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  circle_id TEXT NOT NULL REFERENCES circles(id),
  garment_id TEXT NOT NULL REFERENCES garments(id),
  borrower_id TEXT NOT NULL REFERENCES users(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','collected','returned','declined','cancelled')),
  borrower_note TEXT NOT NULL DEFAULT '',
  owner_note TEXT NOT NULL DEFAULT '',
  actual_return_date TEXT,
  client_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(borrower_id,client_key),
  CHECK(start_date <= end_date)
);
CREATE INDEX IF NOT EXISTS loans_garment ON loans(garment_id,status,start_date,end_date);
CREATE INDEX IF NOT EXISTS loans_borrower ON loans(borrower_id,created_at);
CREATE INDEX IF NOT EXISTS loans_circle ON loans(circle_id,created_at);
CREATE TABLE IF NOT EXISTS loan_events (
  id TEXT PRIMARY KEY,
  loan_id TEXT NOT NULL REFERENCES loans(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_loan ON loan_events(loan_id,created_at);

CREATE VIEW IF NOT EXISTS blocking_loans AS
SELECT l.id, l.garment_id, l.start_date, l.status,
  CASE
    WHEN l.status = 'collected' AND l.end_date < date('now') THEN '9999-12-31'
    WHEN l.status = 'returned' THEN date(l.actual_return_date,'+' || c.care_days || ' days')
    ELSE date(l.end_date,'+' || c.care_days || ' days')
  END AS blocked_to
FROM loans l JOIN circles c ON c.id=l.circle_id
WHERE l.status IN ('approved','collected','returned');

CREATE TRIGGER IF NOT EXISTS loan_circle_guard BEFORE INSERT ON loans
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM garments WHERE id=NEW.garment_id AND circle_id=NEW.circle_id AND archived=0)
 THEN RAISE(ABORT,'GARMENT_UNAVAILABLE') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM members WHERE circle_id=NEW.circle_id AND user_id=NEW.borrower_id)
 THEN RAISE(ABORT,'MEMBERSHIP_REQUIRED') END;
END;
CREATE TRIGGER IF NOT EXISTS loan_conflict_insert BEFORE INSERT ON loans
WHEN NEW.status IN ('approved','collected')
BEGIN
 SELECT CASE WHEN EXISTS(
  SELECT 1 FROM blocking_loans b JOIN circles c ON c.id=NEW.circle_id
  WHERE b.garment_id=NEW.garment_id AND NEW.start_date<=b.blocked_to
  AND date(NEW.end_date,'+' || c.care_days || ' days')>=b.start_date
 ) THEN RAISE(ABORT,'DATES_UNAVAILABLE') END;
END;
CREATE TRIGGER IF NOT EXISTS loan_conflict_update BEFORE UPDATE OF status ON loans
WHEN NEW.status IN ('approved','collected') AND NEW.status<>OLD.status
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM garments WHERE id=NEW.garment_id AND circle_id=NEW.circle_id AND archived=0)
 THEN RAISE(ABORT,'GARMENT_UNAVAILABLE') END;
 SELECT CASE WHEN EXISTS(
  SELECT 1 FROM blocking_loans b JOIN circles c ON c.id=NEW.circle_id
  WHERE b.garment_id=NEW.garment_id AND b.id<>NEW.id AND NEW.start_date<=b.blocked_to
  AND date(NEW.end_date,'+' || c.care_days || ' days')>=b.start_date
 ) THEN RAISE(ABORT,'DATES_UNAVAILABLE') END;
 SELECT CASE WHEN NEW.status='collected' AND EXISTS(
  SELECT 1 FROM loans WHERE garment_id=NEW.garment_id AND id<>NEW.id AND status='collected'
 ) THEN RAISE(ABORT,'AWAITING_RETURN') END;
END;

CREATE TABLE IF NOT EXISTS budgets (
  key TEXT PRIMARY KEY,
  units INTEGER NOT NULL DEFAULT 0 CHECK(units>=0)
);
CREATE TABLE IF NOT EXISTS tryon_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  garment_id TEXT NOT NULL REFERENCES garments(id),
  garment_version INTEGER NOT NULL,
  garment_title TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  provider_id TEXT,
  status TEXT NOT NULL,
  cost INTEGER NOT NULL,
  error_code TEXT,
  result_type TEXT,
  result_size INTEGER,
  last_polled_at INTEGER NOT NULL DEFAULT 0,
  poll_lease_until INTEGER NOT NULL DEFAULT 0,
  next_poll_at INTEGER NOT NULL DEFAULT 0,
  poll_failures INTEGER NOT NULL DEFAULT 0,
  cleanup_pending INTEGER NOT NULL DEFAULT 0,
  cleanup_attempts INTEGER NOT NULL DEFAULT 0,
  last_cleanup_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE(user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS jobs_user ON tryon_jobs(user_id,created_at);
CREATE INDEX IF NOT EXISTS jobs_expiry ON tryon_jobs(expires_at,cleanup_pending);
CREATE TABLE IF NOT EXISTS result_chunks (
  job_id TEXT NOT NULL REFERENCES tryon_jobs(id) ON DELETE CASCADE,
  part INTEGER NOT NULL,
  bytes BLOB NOT NULL,
  PRIMARY KEY(job_id,part)
);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
