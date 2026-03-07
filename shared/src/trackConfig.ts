/**
 * BonkRace Track Configuration (GDD §3.3, §4)
 *
 * Defines the complete configuration for a track, including physics,
 * obstacles, surfaces, checkpoints, and medal thresholds.
 * Served by GET /api/track-of-day and GET /api/tracks/:id.
 */

// ─── Surface types (GDD §4.2) ──────────────────────────────────────────────

export const SURFACE_NORMAL = 0;
export const SURFACE_SLOW = 1;    // слайм/грязь — linearDragK × 3
export const SURFACE_BOOST = 2;   // гладкая — linearDragK × 0.3 + instant boost
export const SURFACE_ICE = 3;     // ледяная — linearDragK × 0.05, no boost

export type SurfaceType =
    | typeof SURFACE_NORMAL
    | typeof SURFACE_SLOW
    | typeof SURFACE_BOOST
    | typeof SURFACE_ICE;

// ─── Wall / obstacle types ──────────────────────────────────────────────────

export const WALL_SAFE = 0;       // bonk-стена: отскок + wall-thrust
export const WALL_DANGEROUS = 1;  // опасная стена: мгновенная смерть

// ─── Pickup types (GDD §4.2) ───────────────────────────────────────────────

export const PICKUP_NITRO = 0;     // мгновенный рывок вперёд
export const PICKUP_TELEPORT = 1;  // перемещение на несколько секций вперёд

export type PickupType = typeof PICKUP_NITRO | typeof PICKUP_TELEPORT;

// ─── Ghost replay format (GDD §5) ──────────────────────────────────────────

export interface GhostFrame {
    tick: number;
    posX: number;
    posY: number;
    angle: number;
}

export type GhostReplay = GhostFrame[];

// ─── Medal thresholds (GDD §6) ─────────────────────────────────────────────

export interface MedalTimesMs {
    bronze: number;
    silver: number;
    gold: number;
    author: number;
}

// ─── Track geometry elements ────────────────────────────────────────────────

export interface TrackCheckpoint {
    x: number;
    y: number;
    radius: number;
    index: number;
}

export interface TrackObstacle {
    x: number;
    y: number;
    radius: number;
    isDangerous: boolean;
}

export interface TrackSurface {
    x: number;
    y: number;
    radius: number;
    type: SurfaceType;
}

export interface TrackPickup {
    x: number;
    y: number;
    type: PickupType;
}

export interface TrackWall {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    isDangerous: boolean;
}

// ─── Main TrackConfig (GDD §3.3) ───────────────────────────────────────────

export interface TrackPhysicsConfig {
    thrustForwardN: number;
    thrustLateralN: number;
    turnTorqueNm: number;
    linearDragK: number;
    comfortableBrakingTimeS: number;
    wallThrustCoeff: number;       // default 0.3
    tickRate: number;              // 30 or 60 Hz
}

export interface TrackConfig {
    id: string;
    name: string;
    seed: number;

    physics: TrackPhysicsConfig;

    /** World bounds */
    width: number;
    height: number;

    /** Track elements */
    checkpoints: TrackCheckpoint[];
    obstacles: TrackObstacle[];
    surfaces: TrackSurface[];
    pickups: TrackPickup[];
    walls: TrackWall[];

    /** Medal thresholds (static until enough finishes for dynamic) */
    medalTimesMs: MedalTimesMs;

    /** Max session duration in seconds (anti-abuse) */
    maxSessionSec: number;

    /** Inactivity threshold in ticks (anti-abuse) */
    inactivityThresholdTicks: number;
}
