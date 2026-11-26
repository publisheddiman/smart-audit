CREATE TABLE IF NOT EXISTS workspace (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload))
);

INSERT OR IGNORE INTO workspace (id, revision, payload)
VALUES (1, 0, '{"companies":[],"regs":null}');

CREATE TABLE IF NOT EXISTS login_attempts (
  client TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS login_attempts_expiry ON login_attempts(expires_at);
