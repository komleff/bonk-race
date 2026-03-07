// ─── Player flags (bitfield) ─────────────────────────────────────────────────
// Kept from SlimeArena for ArenaRoom backward compat (live-race post-MVP)
export const FLAG_RESPAWN_SHIELD = 1 << 0;
export const FLAG_ABILITY_SHIELD = 1 << 1;
export const FLAG_LAST_BREATH = 1 << 2;
export const FLAG_IS_REBEL = 1 << 3;
export const FLAG_IS_DEAD = 1 << 4;
export const FLAG_DASHING = 1 << 5;
export const FLAG_MAGNETIZING = 1 << 6;
export const FLAG_SLOWED = 1 << 7;
export const FLAG_PUSHING = 1 << 8;
export const FLAG_STUNNED = 1 << 9;
export const FLAG_INVISIBLE = 1 << 10;
export const FLAG_LEVIATHAN = 1 << 11;

// BonkRace flags (bits 12+)
export const FLAG_HAS_NITRO = 1 << 12;
export const FLAG_SHIELD_ACTIVE = 1 << 13;

// ─── Zone types (SlimeArena legacy, kept for ArenaRoom) ──────────────────────
export const ZONE_TYPE_NECTAR = 1;
export const ZONE_TYPE_ICE = 2;
export const ZONE_TYPE_SLIME = 3;
export const ZONE_TYPE_LAVA = 4;
export const ZONE_TYPE_TURBO = 5;

// ─── Obstacle types ──────────────────────────────────────────────────────────
export const OBSTACLE_TYPE_PILLAR = 1;
export const OBSTACLE_TYPE_SPIKES = 2;

// ─── BonkRace match phases ───────────────────────────────────────────────────
export const RACE_PHASE_LOBBY = "lobby";
export const RACE_PHASE_COUNTDOWN = "countdown";
export const RACE_PHASE_RACING = "racing";
export const RACE_PHASE_RESULTS = "results";

export type RacePhase =
    | typeof RACE_PHASE_LOBBY
    | typeof RACE_PHASE_COUNTDOWN
    | typeof RACE_PHASE_RACING
    | typeof RACE_PHASE_RESULTS;

// ─── Guest ───────────────────────────────────────────────────────────────────
export const GUEST_DEFAULT_NICKNAME = 'Гость';
