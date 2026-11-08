CREATE TABLE submissions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, initials TEXT NOT NULL, quote TEXT NOT NULL, property TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), photo BLOB, photo_mime TEXT, withdrawal_hash TEXT NOT NULL, consent_version TEXT NOT NULL, consent_at TEXT NOT NULL, created_at TEXT NOT NULL, reviewed_at TEXT);
CREATE INDEX submissions_status ON submissions(status,id);
CREATE TABLE sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL, password_version TEXT NOT NULL);
CREATE INDEX sessions_expires ON sessions(expires);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX rate_limits_expires ON rate_limits(expires);
