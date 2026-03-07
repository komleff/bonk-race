// ─── Types (legacy SlimeArena + BonkRace) ────────────────────────────────────
export type { Vector2, MatchPhaseId, InputCommand } from "./types";
export { MATCH_PHASES } from "./types";
// BonkRace types
export type { RunResult, GhostInfo, MedalTier, StreakInfo } from "./types";

// ─── Config (legacy SlimeArena — kept for ArenaRoom backward compat) ─────────
export type {
    BalanceConfig,
    ResolvedBalanceConfig,
    FormulaConfig,
    MatchPhaseConfig,
    SlimeConfig,
    WorldPhysicsConfig,
    ClientNetSmoothingConfig,
    MassCurveConfig,
    TalentConfig,
    ClassTalentConfig,
    BoostConfig,
    BoostType,
    MapSizeConfig,
    ObstacleConfig,
    SafeZoneConfig,
    ZonesConfig,
} from "./config";
export { DEFAULT_BALANCE_CONFIG, resolveBalanceConfig } from "./config";

// ─── Formulas (legacy SlimeArena — kept for ArenaRoom) ───────────────────────
export {
    getSlimeDamage,
    getSlimeRadius,
    getOrbRadius,
    getSpeedMultiplier,
    getTurnRateDeg,
    getSlimeRadiusFromConfig,
    getSlimeInertia,
    scaleSlimeValue,
} from "./formulas";

// ─── Constants ───────────────────────────────────────────────────────────────
export {
    // Player flags
    FLAG_RESPAWN_SHIELD,
    FLAG_ABILITY_SHIELD,
    FLAG_LAST_BREATH,
    FLAG_IS_REBEL,
    FLAG_IS_DEAD,
    FLAG_DASHING,
    FLAG_MAGNETIZING,
    FLAG_SLOWED,
    FLAG_PUSHING,
    FLAG_STUNNED,
    FLAG_INVISIBLE,
    FLAG_LEVIATHAN,
    // BonkRace flags
    FLAG_HAS_NITRO,
    FLAG_SHIELD_ACTIVE,
    // Zone types (legacy)
    ZONE_TYPE_NECTAR,
    ZONE_TYPE_ICE,
    ZONE_TYPE_SLIME,
    ZONE_TYPE_LAVA,
    ZONE_TYPE_TURBO,
    // Obstacle types
    OBSTACLE_TYPE_PILLAR,
    OBSTACLE_TYPE_SPIKES,
    // BonkRace match phases
    RACE_PHASE_LOBBY,
    RACE_PHASE_COUNTDOWN,
    RACE_PHASE_RACING,
    RACE_PHASE_RESULTS,
    // Guest
    GUEST_DEFAULT_NICKNAME,
} from "./constants";
export type { RacePhase } from "./constants";

// ─── Sprites (legacy SlimeArena — kept for ArenaRoom/client compat) ──────────
export type { SlimeSprite } from "./sprites";
export {
    SPRITE_NAMES,
    hashString,
    pickSpriteByName,
    isValidSprite,
    SLIME_SPRITES,
    SPRITE_SIZE,
    SPRITE_CACHE,
    loadSprite,
    loadClassSprites,
    getPlayerSprite,
} from "./sprites";

// ─── Name generator ──────────────────────────────────────────────────────────
export {
    generateName,
    generateUniqueName,
    generateRandomName,
    getNameCombinationsCount,
} from "./nameGenerator";

// ─── Math utils ──────────────────────────────────────────────────────────────
export {
    clamp,
    lerp,
    wrapAngle,
    normalizeAngle,
    degToRad,
    radToDeg,
    distance,
    distanceSq,
} from "./mathUtils";

// ─── RNG (deterministic, seed-based — GDD §4.1) ─────────────────────────────
export { Rng } from "./rng";

// ─── Track config (BonkRace — GDD §3.3, §4) ─────────────────────────────────
export type {
    TrackConfig,
    TrackPhysicsConfig,
    TrackCheckpoint,
    TrackObstacle,
    TrackSurface,
    TrackPickup,
    TrackWall,
    MedalTimesMs,
    GhostFrame,
    GhostReplay,
} from "./trackConfig";
export {
    SURFACE_NORMAL,
    SURFACE_SLOW,
    SURFACE_BOOST,
    SURFACE_ICE,
    WALL_SAFE,
    WALL_DANGEROUS,
    PICKUP_NITRO,
    PICKUP_TELEPORT,
} from "./trackConfig";
export type { SurfaceType, PickupType } from "./trackConfig";
