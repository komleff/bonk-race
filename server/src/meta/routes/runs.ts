/**
 * Runs API routes (GDD §10)
 *
 * POST /api/v1/runs/submit  — Submit a race run result + ghost replay
 */

import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { getPostgresPool } from '../../db/pool';
import { verifyAccessToken } from '../utils/jwtUtils';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

let pool: Pool | null = null;
function getPool(): Pool {
    if (!pool) pool = getPostgresPool();
    return pool;
}

/**
 * POST /api/v1/runs/submit
 *
 * Body: { trackId, finishMs, coinsCollected, replayData, inputHash }
 *
 * L1 validation (GDD §10.3):
 * - finishMs > 0 and < maxSessionSec * 1000
 * - replayData is an array
 * - trackId is non-empty
 */
router.post('/submit', requireAuth, async (req: Request, res: Response) => {
    const userId = (req as any).userId as string;
    if (!userId) {
        return res.status(401).json({ error: 'auth_required' });
    }

    const { trackId, finishMs, coinsCollected, replayData, inputHash } = req.body;

    // L1 basic validation
    if (!trackId || typeof trackId !== 'string') {
        return res.status(400).json({ error: 'validation_error', message: 'trackId required' });
    }
    if (typeof finishMs !== 'number' || finishMs <= 0 || finishMs > 600_000) {
        return res.status(400).json({ error: 'validation_error', message: 'invalid finishMs' });
    }
    if (!Array.isArray(replayData)) {
        return res.status(400).json({ error: 'validation_error', message: 'replayData must be array' });
    }

    const db = getPool();

    try {
        await db.query('BEGIN');

        // Save/update best time in race_leaderboard
        await db.query(
            `INSERT INTO race_leaderboard (user_id, track_id, best_finish_ms, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (user_id, track_id)
             DO UPDATE SET best_finish_ms = LEAST(race_leaderboard.best_finish_ms, $3),
                           updated_at = NOW()`,
            [userId, trackId, Math.round(finishMs)],
        );

        // Save ghost replay (keep only best per user per track)
        await db.query(
            `INSERT INTO ghost_replays (user_id, track_id, finish_ms, replay_data, created_at)
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT (user_id, track_id)
             DO UPDATE SET finish_ms = LEAST(ghost_replays.finish_ms, $3),
                           replay_data = CASE WHEN $3 < ghost_replays.finish_ms THEN $4 ELSE ghost_replays.replay_data END,
                           created_at = NOW()`,
            [userId, trackId, Math.round(finishMs), JSON.stringify(replayData)],
        );

        // Credit coins to wallet (if any)
        if (typeof coinsCollected === 'number' && coinsCollected > 0) {
            await db.query(
                `UPDATE wallets SET soft_currency = soft_currency + $1 WHERE user_id = $2`,
                [coinsCollected, userId],
            );
        }

        await db.query('COMMIT');

        res.json({
            success: true,
            finishMs: Math.round(finishMs),
            coinsCollected: coinsCollected ?? 0,
        });
    } catch (err) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('[Runs] Submit error:', err);
        res.status(500).json({ error: 'internal_error' });
    }
});

export default router;
