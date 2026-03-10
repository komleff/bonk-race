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
export const ZONE_TYPE_MUD = 3;
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

// ─── Countdown / respawn timing ─────────────────────────────────────────────
export const COUNTDOWN_STEP_S = 0.7;
export const COUNTDOWN_STEPS = ["3", "2", "1", "Go!"] as const;
export const COUNTDOWN_TOTAL_S = COUNTDOWN_STEP_S * COUNTDOWN_STEPS.length; // 2.8с
export const DEATH_FREEZE_S = 0.8;
export const RESPAWN_GO_STEP_S = 0.4;
export const RESPAWN_GO_STEPS = 2;
export const RESPAWN_GO_TOTAL_S = RESPAWN_GO_STEP_S * RESPAWN_GO_STEPS; // 0.8с

// ─── Punch-in анимация (параметры countdown overlay) ────────────────────────
export interface PunchInResult {
    scale: number;
    alpha: number;
}

/**
 * Вычислить scale и alpha для punch-in анимации (Mario Kart стиль).
 * @param progress — прогресс внутри шага, 0..1
 * @param isGo — true для «Go!» (более крупный начальный масштаб)
 */
export function computePunchIn(progress: number, isGo: boolean): PunchInResult {
    const punchPhase = Math.min(progress / 0.6, 1);
    const eased = 1 - (1 - punchPhase) * (1 - punchPhase); // easeOutQuad
    const startScale = isGo ? 2.5 : 2.0;
    const scale = startScale - (startScale - 1.0) * eased;
    const alpha = progress < 0.85 ? 1.0 : Math.max(0, 1 - (progress - 0.85) / 0.15);
    return { scale, alpha };
}

// ─── Guest ───────────────────────────────────────────────────────────────────
export const GUEST_DEFAULT_NICKNAME = 'Гость';
