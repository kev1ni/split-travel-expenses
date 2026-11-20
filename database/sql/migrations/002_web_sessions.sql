-- Apply once to an existing Supabase database using the server's secret/service-role key.
BEGIN;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
CREATE TABLE IF NOT EXISTS web_sessions (
    token_hash CHAR(64) PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE web_sessions ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS web_guest_members (
    token_hash CHAR(64) NOT NULL REFERENCES web_sessions(token_hash) ON DELETE CASCADE,
    trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE,
    PRIMARY KEY (token_hash, trip_id)
);
ALTER TABLE web_guest_members ENABLE ROW LEVEL SECURITY;
COMMIT;
