-- BonkRace: Race leaderboard table
-- Stores best finish time per user per track

CREATE TABLE IF NOT EXISTS race_leaderboard (
    user_id   UUID NOT NULL REFERENCES users(id),
    track_id  TEXT NOT NULL,
    best_finish_ms INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_race_leaderboard_track_time
    ON race_leaderboard (track_id, best_finish_ms ASC);
