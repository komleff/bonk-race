export interface Vector2 {
    x: number;
    y: number;
}

// GDD v3.3: 3 фазы матча (Growth, Hunt, Final) — SlimeArena legacy
export const MATCH_PHASES = ["Growth", "Hunt", "Final", "Results"] as const;
export type MatchPhaseId = typeof MATCH_PHASES[number];

export interface InputCommand {
    seq: number;
    moveX: number;
    moveY: number;
    abilitySlot?: number;
    talentChoice?: number;
}

/**
 * Match result interfaces for MatchServer → MetaServer integration
 * (SlimeArena legacy — kept for ArenaRoom backward compat)
 */
export interface PlayerResult {
    userId?: string;
    /** P0-2: guestSubjectId для идентификации гостей в playerResults */
    guestSubjectId?: string;
    sessionId: string;
    placement: number;
    finalMass: number;
    killCount: number;
    deathCount: number;
    level: number;
    classId: number;
    isDead: boolean;
}

export interface MatchStats {
    totalKills: number;
    totalBubblesCollected: number;
    matchDurationMs: number;
}

export interface MatchSummary {
    matchId: string;
    mode: string;
    startedAt: string;
    endedAt: string;
    configVersion: string;
    buildVersion: string;
    playerResults: PlayerResult[];
    matchStats?: MatchStats;
    /** Guest subject ID for claim ownership verification (set by MatchServer for guest players) */
    guestSubjectId?: string;
}

// ─── BonkRace types ──────────────────────────────────────────────────────────

/** Result of a single race run (client → POST /api/submit-run) */
export interface RunResult {
    trackId: string;
    finishMs: number;
    coinsCollected: number;
    replayData: number[];  // packed GhostFrame[] as flat array [tick,x,y,angle,...]
    inputHash: string;     // determinism check hash
}

/** Ghost info returned by GET /api/ghosts */
export interface GhostInfo {
    userId: string;
    nickname: string;
    spriteId: string;
    finishMs: number;
    replayData: number[];
}

/** Medal tier (GDD §6) */
export type MedalTier = "bronze" | "silver" | "gold" | "author";

/** Daily streak info (GDD §8) */
export interface StreakInfo {
    currentStreak: number;
    lastFinishDate: string;  // ISO date YYYY-MM-DD
    freezesRemaining: number;
}
