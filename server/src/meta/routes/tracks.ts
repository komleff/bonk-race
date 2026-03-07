/**
 * Tracks API routes (GDD §4.1)
 *
 * GET /api/v1/tracks/today    — Track of the day config
 * GET /api/v1/tracks/:id      — Specific track config
 */

import express, { Request, Response } from 'express';
import { Rng } from '@bonk-race/shared';
import type { TrackConfig, TrackPhysicsConfig, TrackCheckpoint, TrackObstacle } from '@bonk-race/shared';

const router = express.Router();

/**
 * Generate a seed from a date string (YYYY-MM-DD).
 * Same date = same seed = same track for all players.
 */
function dateSeed(dateStr: string): number {
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) {
        const ch = dateStr.charCodeAt(i);
        hash = ((hash << 5) - hash + ch) | 0;
    }
    return hash >>> 0;
}

/**
 * Generate a minimal track config from a seed.
 * TODO: Replace with real track presets/level design.
 */
function generateTrackFromSeed(seed: number, id: string): TrackConfig {
    const rng = new Rng(seed);

    const width = 800;
    const height = 600;
    const hw = width / 2;
    const hh = height / 2;

    // Generate checkpoints in a roughly linear corridor
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

    // Generate obstacles
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

    const physics: TrackPhysicsConfig = {
        thrustForwardN: 9000,
        thrustLateralN: 8500,
        turnTorqueNm: 175,
        linearDragK: 0.10,
        comfortableBrakingTimeS: 3.5,
        wallThrustCoeff: 0.3,
        tickRate: 60,
    };

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
        inactivityThresholdTicks: 60 * 30, // 30 seconds at 60Hz
    };
}

/**
 * GET /api/v1/tracks/today
 * Returns the track-of-the-day config.
 */
router.get('/today', (req: Request, res: Response) => {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const seed = dateSeed(today);
    const track = generateTrackFromSeed(seed, `daily-${today}`);
    res.json(track);
});

/**
 * GET /api/v1/tracks/:id
 * Returns a specific track config (for training tracks).
 */
router.get('/:id', (req: Request, res: Response) => {
    const { id } = req.params;
    // For now, generate from ID hash. Replace with DB lookup later.
    const seed = dateSeed(id);
    const track = generateTrackFromSeed(seed, id);
    res.json(track);
});

export default router;
