/**
 * Hand-crafted track presets (GDD §4.1)
 *
 * Vertical corridor tracks for BonkRace MVP.
 * Player drives from bottom (high Y) to top (low Y).
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

// ─── Track 1: "First Run" ──────────────────────────────────────────────────
//
//  Вертикальный коридор ~600×2400. Игрок едет снизу вверх.
//  Коридорная трасса A→B (GDD §4.1): основной путь очевиден,
//  оптимальный — требует скилла.
//
//  Layout (rough ASCII, top-down, Y increases downward):
//
//    y=-1100  ┌─ CP9 (FINISH) ─┐
//             │    BOOST pad    │
//    y=-900   │── CP8 ─────────│
//             │   ICE patch    │
//    y=-700   │── CP7 ─────────│   ← chicane (dangerous wall)
//             │                │
//    y=-500   │── CP6 ─────────│   ← obstacle cluster
//             │  SLOW zone     │
//    y=-300   │── CP5 ─────────│
//             │                │
//    y=-100   │── CP4 ─────────│   ← S-curve walls
//             │   BOOST pad    │
//    y=100    │── CP3 ─────────│
//             │  obstacles     │
//    y=300    │── CP2 ─────────│
//             │                │
//    y=500    │── CP1 ─────────│
//             │                │
//    y=700    │── CP0 (START) ─│
//    y=900    └────────────────┘
//
//  Features:
//  - Wide start area → narrows toward top
//  - Boost pads for speed, ICE for drift challenge
//  - Dangerous walls in chicane section
//  - Obstacles force weaving
//  - Wall-thrust corridors reward bonking

const TRACK_WIDTH = 600;
const TRACK_HEIGHT = 2400;

// Чекпоинты снизу вверх (от старта к финишу)
const checkpoints: TrackCheckpoint[] = [
    { x:   0, y:  700, radius: 50, index: 0 },   // START
    { x:   0, y:  500, radius: 40, index: 1 },
    { x:   0, y:  300, radius: 40, index: 2 },
    { x:   0, y:  100, radius: 40, index: 3 },
    { x:   0, y: -100, radius: 40, index: 4 },
    { x:   0, y: -300, radius: 40, index: 5 },
    { x:   0, y: -500, radius: 40, index: 6 },
    { x:   0, y: -700, radius: 40, index: 7 },
    { x:   0, y: -900, radius: 40, index: 8 },
    { x:   0, y: -1100, radius: 50, index: 9 },  // FINISH
];

const surfaces: TrackSurface[] = [
    // Буст перед финишем (быстрый спринт)
    { x: 0, y: -1000, radius: 80, type: SURFACE_BOOST },

    // Буст в середине (награда за чистый путь)
    { x: 0, y: 0, radius: 60, type: SURFACE_BOOST },

    // Ледяной участок (дрифт-зона, GDD §4.2)
    { x: 0, y: -800, radius: 100, type: SURFACE_ICE },

    // Замедляющая зона (заставляет искать обходной путь)
    { x: 0, y: -400, radius: 70, type: SURFACE_SLOW },
];

const obstacles: TrackObstacle[] = [
    // Нижняя секция — разогрев (безопасные бамперы)
    { x: -80, y: 600, radius: 15, isDangerous: false },
    { x:  80, y: 550, radius: 15, isDangerous: false },

    // Средняя секция — плотнее
    { x: -100, y: 200, radius: 18, isDangerous: false },
    { x:  100, y: 250, radius: 18, isDangerous: false },
    { x:    0, y: 150, radius: 12, isDangerous: false },

    // Верхняя секция — опасные препятствия
    { x: -60, y: -500, radius: 20, isDangerous: true },
    { x:  60, y: -550, radius: 20, isDangerous: true },

    // Финишный коридор — бамперы по бокам
    { x: -120, y: -950, radius: 14, isDangerous: false },
    { x:  120, y: -950, radius: 14, isDangerous: false },
];

const pickups: TrackPickup[] = [
    // Нитро в начале трассы (ускоряет старт)
    { x: 0, y: 400, type: PICKUP_NITRO },

    // Телепорт — shortcut мимо замедляющей зоны
    { x: 200, y: -350, type: PICKUP_TELEPORT },
];

const walls: TrackWall[] = [
    // ─── Наружные стены коридора (безопасные — wall-thrust работает) ───
    // Левая стена
    { x1: -250, y1: -1200, x2: -250, y2: 900, isDangerous: false },
    // Правая стена
    { x1:  250, y1: -1200, x2:  250, y2: 900, isDangerous: false },

    // Верхняя стена (за финишем)
    { x1: -250, y1: -1200, x2: 250, y2: -1200, isDangerous: false },
    // Нижняя стена (за стартом)
    { x1: -250, y1: 900, x2: 250, y2: 900, isDangerous: false },

    // ─── S-образный изгиб (создаёт нетривиальную оптимальную линию) ───
    // Выступ слева
    { x1: -250, y1: -50, x2: -100, y2: -50, isDangerous: false },
    // Выступ справа (чуть ниже)
    { x1:  250, y1: -150, x2:  100, y2: -150, isDangerous: false },

    // ─── Chicane: опасная стена (GDD §4.2 — красные стены) ───
    { x1: -80, y1: -680, x2:  80, y2: -720, isDangerous: true },
];

const TICK_RATE = 60;

export const TRACK_FIRST_RUN: TrackConfig = {
    id: 'first-run',
    name: 'First Run',
    seed: 42,

    // Тренировочная физика (GDD §3.3 — средний двигатель)
    physics: {
        thrustForwardN: 6000,
        thrustLateralN: 5500,
        turnTorqueNm: 2400,
        linearDragK: 0.15,
        comfortableBrakingTimeS: 2.5,
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
        bronze: 45000,   // 45s — просто финишировал
        silver: 30000,   // 30s — хороший заезд
        gold: 22000,     // 22s — чистый проезд с бустами
        author: 18000,   // 18s — оптимальная линия + wall-thrust
    },

    maxSessionSec: 300,
    inactivityThresholdTicks: TICK_RATE * 30,
};

// ─── Preset registry ─────────────────────────────────────────────────────────

export const TRACK_PRESETS: Record<string, TrackConfig> = {
    'first-run': TRACK_FIRST_RUN,
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
