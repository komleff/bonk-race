/**
 * Tracks API routes (GDD §4.1)
 *
 * GET /api/v1/tracks/today    — Track of the day config
 * GET /api/v1/tracks/list     — Available track IDs
 * GET /api/v1/tracks/:id      — Specific track config
 */

import express, { Request, Response } from 'express';
import { Rng } from '@bonk-race/shared';
import type { TrackConfig, TrackPhysicsConfig, TrackCheckpoint, TrackObstacle } from '@bonk-race/shared';
import { getTrackPreset, getTrackPresetIds, TRACK_STARTER_CIRCUIT } from '../data/trackPresets';

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const router = express.Router();

/**
 * Generate a numeric hash from any string.
 * Used for date-based daily rotation and procedural track seeds.
 */
function stringHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        hash = ((hash << 5) - hash + ch) | 0;
    }
    return hash >>> 0;
}

/**
 * Procedural track generation from seed.
 * Fallback when no hand-crafted preset exists.
 */
function generateTrackFromSeed(seed: number, id: string): TrackConfig {
    const rng = new Rng(seed);

    const width = 800;
    const height = 600;
    const hw = width / 2;
    const hh = height / 2;

    const cpCount = 8;
    const checkpoints: TrackCheckpoint[] = [];
    for (let i = 0; i < cpCount; i++) {
        const t = (i + 1) / (cpCount + 1);
        checkpoints.push({
            x: -hw + width * t + rng.range(-40, 40),
            y: rng.range(-hh * 0.6, hh * 0.6),
            radius: 30,
            index: i,
        });
    }

    const obsCount = rng.int(8, 16);
    const obstacles: TrackObstacle[] = [];
    for (let i = 0; i < obsCount; i++) {
        obstacles.push({
            x: rng.range(-hw * 0.8, hw * 0.8),
            y: rng.range(-hh * 0.8, hh * 0.8),
            radius: rng.range(10, 25),
            isDangerous: rng.next() < 0.2,
        });
    }

    // Reuse physics from starter-circuit as default for procedural tracks
    const physics: TrackPhysicsConfig = { ...TRACK_STARTER_CIRCUIT.physics };

    return {
        id,
        name: `Track ${id}`,
        seed,
        physics,
        width,
        height,
        checkpoints,
        obstacles,
        surfaces: [],
        pickups: [],
        walls: [],
        medalTimesMs: {
            bronze: 90000,
            silver: 60000,
            gold: 45000,
            author: 35000,
        },
        maxSessionSec: 300,
        inactivityThresholdTicks: physics.tickRate * 30,
    };
}

/**
 * Resolve a track by ID: first check presets, then generate procedurally.
 */
function resolveTrack(id: string): TrackConfig {
    return getTrackPreset(id) ?? generateTrackFromSeed(stringHash(id), id);
}

/**
 * GET /api/v1/tracks/today
 * Returns the track-of-the-day config.
 * Rotates daily from the preset pool using a date seed.
 * Falls back to procedural generation if no presets exist.
 */
router.get('/today', (_req: Request, res: Response) => {
    // MVP: single track
    const presetIds = getTrackPresetIds();
    if (presetIds.length > 0) {
        // Rotate through presets by day
        const today = new Date().toISOString().slice(0, 10);
        const dayIndex = stringHash(today) % presetIds.length;
        const track = getTrackPreset(presetIds[dayIndex])!;
        return res.json(track);
    }
    // Fallback: procedural
    const today = new Date().toISOString().slice(0, 10);
    const seed = stringHash(today);
    res.json(generateTrackFromSeed(seed, `daily-${today}`));
});

/**
 * GET /api/v1/tracks/list
 * Returns available track preset IDs.
 */
router.get('/list', (_req: Request, res: Response) => {
    res.json({ tracks: getTrackPresetIds() });
});

/**
 * GET /api/v1/tracks/:id
 * Returns a specific track config (preset or procedural).
 */
router.get('/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    if (DANGEROUS_KEYS.has(id) || !/^[a-z0-9\-_.]+$/i.test(id) || id.length > 128) {
        return res.status(400).json({ error: 'invalid_track_id' });
    }
    res.json(resolveTrack(id));
});

export default router;
