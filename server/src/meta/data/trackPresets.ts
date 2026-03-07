/**
 * Hand-crafted track presets (GDD §4.1)
 *
 * First manual track for BonkRace MVP: an oval circuit with
 * surface variety, walls, obstacles, and pickup placements.
 *
 * Coordinate system: (0,0) is center; +X right, +Y down.
 */

import type {
    TrackConfig,
    TrackCheckpoint,
    TrackObstacle,
    TrackSurface,
    TrackPickup,
    TrackWall,
} from '@bonk-race/shared';
import {
    SURFACE_SLOW,
    SURFACE_BOOST,
    SURFACE_ICE,
    PICKUP_NITRO,
    PICKUP_TELEPORT,
} from '@bonk-race/shared';

// ─── Track 1: "Starter Circuit" ─────────────────────────────────────────────
//
//  Oval loop, clockwise. Roughly 1200×800 world units.
//  Checkpoints placed around the oval in order (0..7), with #0 as start/finish.
//
//   Layout (rough ASCII):
//
//       CP1 ---- BOOST ---- CP2
//      /                        \
//    CP0(start)              CP3
//      \                        /
//       CP7 ---- ICE ------- CP4
//              \           /
//               CP6 -- CP5
//
//  Features:
//  - Boost zone on top straight
//  - Ice zone on bottom straight (low friction, tricky)
//  - Slow zone in hairpin at bottom
//  - Obstacle clusters near turns
//  - Nitro pickup mid-circuit, Teleport on hidden shortcut
//  - Walls along outer edges + one dangerous inner wall

const TRACK_WIDTH = 1200;
const TRACK_HEIGHT = 800;

const checkpoints: TrackCheckpoint[] = [
    { x: -400, y: -100, radius: 40, index: 0 },   // Start/finish (left side)
    { x: -200, y: -280, radius: 35, index: 1 },   // Top-left turn
    { x:  150, y: -280, radius: 35, index: 2 },   // Top-right
    { x:  400, y: -100, radius: 35, index: 3 },   // Right side
    { x:  400, y:  100, radius: 35, index: 4 },   // Right-bottom
    { x:  200, y:  280, radius: 35, index: 5 },   // Bottom-right
    { x: -100, y:  280, radius: 35, index: 6 },   // Bottom-left
    { x: -400, y:  100, radius: 35, index: 7 },   // Left-bottom (back to start)
];

const surfaces: TrackSurface[] = [
    // Boost strip on top straight (between CP1 and CP2)
    { x: -25, y: -280, radius: 120, type: SURFACE_BOOST },

    // Ice patch on bottom (between CP6 and CP5)
    { x:  50, y:  280, radius: 100, type: SURFACE_ICE },

    // Slow zone in bottom-left hairpin
    { x: -300, y:  200, radius: 60, type: SURFACE_SLOW },

    // Small boost pad near right turn
    { x:  420, y:  0, radius: 40, type: SURFACE_BOOST },
];

const obstacles: TrackObstacle[] = [
    // Top-left turn cluster (safe bouncy)
    { x: -300, y: -200, radius: 15, isDangerous: false },
    { x: -270, y: -250, radius: 12, isDangerous: false },

    // Top-right obstacles
    { x:  300, y: -230, radius: 18, isDangerous: false },

    // Center hazard (dangerous — forces players to steer around)
    { x:  0, y:  0, radius: 25, isDangerous: true },

    // Right turn pillars
    { x:  450, y: -50, radius: 14, isDangerous: false },
    { x:  450, y:  50, radius: 14, isDangerous: false },

    // Bottom cluster (inside hairpin)
    { x: -150, y:  230, radius: 16, isDangerous: false },
    { x:  100, y:  230, radius: 20, isDangerous: true },

    // Left side pillars
    { x: -450, y: -30, radius: 12, isDangerous: false },
    { x: -450, y:  30, radius: 12, isDangerous: false },
];

const pickups: TrackPickup[] = [
    // Nitro on back-straight (between CP7 and CP0)
    { x: -420, y: 0, type: PICKUP_NITRO },

    // Teleport off the main line (shortcut near bottom)
    { x: 0, y: 320, type: PICKUP_TELEPORT },
];

const walls: TrackWall[] = [
    // Outer boundary walls (safe — wall-thrust works on these)
    // Top wall
    { x1: -500, y1: -350, x2: 500, y2: -350, isDangerous: false },
    // Bottom wall
    { x1: -500, y1: 350, x2: 500, y2: 350, isDangerous: false },
    // Left wall
    { x1: -530, y1: -350, x2: -530, y2: 350, isDangerous: false },
    // Right wall
    { x1: 530, y1: -350, x2: 530, y2: 350, isDangerous: false },

    // Inner dangerous wall (center divider, forces choice of racing line)
    { x1: -50, y1: -50, x2: 50, y2: -50, isDangerous: true },

    // Chicane walls on top straight
    { x1: -80, y1: -250, x2: -80, y2: -310, isDangerous: false },
    { x1: 80, y1: -250, x2: 80, y2: -310, isDangerous: false },
];

const TICK_RATE = 60;

export const TRACK_STARTER_CIRCUIT: TrackConfig = {
    id: 'starter-circuit',
    name: 'Starter Circuit',
    seed: 42,

    physics: {
        thrustForwardN: 9000,
        thrustLateralN: 8500,
        turnTorqueNm: 175,
        linearDragK: 0.10,
        comfortableBrakingTimeS: 3.5,
        wallThrustCoeff: 0.3,
        tickRate: TICK_RATE,
    },

    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,

    checkpoints,
    obstacles,
    surfaces,
    pickups,
    walls,

    medalTimesMs: {
        bronze: 60000,   // 60s — just finish
        silver: 35000,   // 35s — decent run
        gold: 25000,     // 25s — clean run with boost usage
        author: 20000,   // 20s — optimal line + wall-thrust
    },

    maxSessionSec: 300,
    inactivityThresholdTicks: TICK_RATE * 30, // 30s
};

// ─── Preset registry ─────────────────────────────────────────────────────────

export const TRACK_PRESETS: Record<string, TrackConfig> = {
    'starter-circuit': TRACK_STARTER_CIRCUIT,
};

/**
 * Get a track preset by ID, or null if not found.
 */
export function getTrackPreset(id: string): TrackConfig | null {
    return TRACK_PRESETS[id] ?? null;
}

/**
 * Get all available preset IDs.
 */
export function getTrackPresetIds(): string[] {
    return Object.keys(TRACK_PRESETS);
}
