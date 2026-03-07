-- BonkRace: Ghost replays table (GDD §5)
-- Stores best replay per user per track

CREATE TABLE IF NOT EXISTS ghost_replays (
    user_id      TEXT NOT NULL REFERENCES users(id),
    track_id     TEXT NOT NULL,
    finish_ms    INTEGER NOT NULL,
    replay_data  JSONB NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_ghost_replays_track_time
    ON ghost_replays (track_id, finish_ms ASC);
