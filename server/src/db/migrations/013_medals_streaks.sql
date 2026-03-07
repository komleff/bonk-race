-- BonkRace: Medals and daily streaks (GDD §6, §8)

-- Medals earned by players per track
CREATE TABLE IF NOT EXISTS medals (
    user_id    UUID NOT NULL REFERENCES users(id),
    track_id   TEXT NOT NULL,
    tier       TEXT NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold', 'author')),
    finish_ms  INTEGER NOT NULL,
    earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, track_id, tier)
);

-- Daily streaks
CREATE TABLE IF NOT EXISTS daily_streaks (
    user_id              UUID PRIMARY KEY REFERENCES users(id),
    current_streak       INTEGER NOT NULL DEFAULT 0,
    longest_streak       INTEGER NOT NULL DEFAULT 0,
    last_finish_date     DATE,
    freezes_remaining    INTEGER NOT NULL DEFAULT 1,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
