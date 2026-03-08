/**
 * Runs API routes (GDD §10)
 *
 * POST /api/v1/runs/submit  — Submit a race run result + ghost replay
 */

import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { getPostgresPool } from '../../db/pool';
import { requireAuth } from '../middleware/auth';
import { getTrackPreset, getTrackPresetIds } from '../data/trackPresets';

const router = express.Router();

// 60-секундный заезд при 60Hz = 3600 кадров × 4 floats = 14400 элементов
const MAX_REPLAY_ELEMENTS = 50_000;
// GDD §7.2: максимум монет за заезд
const MAX_COINS_PER_RUN = 50;

let pool: Pool | null = null;
function getPool(): Pool {
    if (!pool) pool = getPostgresPool();
    return pool;
}

/**
 * POST /api/v1/runs/submit
 *
 * Body: { trackId, finishMs, coinsCollected, replayData }
 *
 * L1 validation (GDD §10.3):
 * - finishMs > 0 and < maxSessionSec * 1000
 * - replayData is array with size limit and element validation
 * - trackId is non-empty string
 * - coinsCollected capped at MAX_COINS_PER_RUN
 */
router.post('/submit', requireAuth, async (req: Request, res: Response) => {
    const userId = req.userId;
    if (!userId) {
        return res.status(401).json({ error: 'auth_required' });
    }

    const { trackId, finishMs, coinsCollected, replayData } = req.body;

    // L1 basic validation
    if (!trackId || typeof trackId !== 'string') {
        return res.status(400).json({ error: 'validation_error', message: 'trackId required' });
    }
    // Только известные пресеты (защита от фарма через произвольные trackId)
    const knownTracks = new Set(getTrackPresetIds());
    if (!knownTracks.has(trackId)) {
        return res.status(400).json({ error: 'validation_error', message: 'unknown trackId' });
    }
    if (typeof finishMs !== 'number' || finishMs <= 0 || finishMs > 600_000) {
        return res.status(400).json({ error: 'validation_error', message: 'invalid finishMs' });
    }
    if (!Array.isArray(replayData)) {
        return res.status(400).json({ error: 'validation_error', message: 'replayData must be array' });
    }
    // Лимит размера replay (DoS-защита)
    if (replayData.length > MAX_REPLAY_ELEMENTS) {
        return res.status(400).json({ error: 'validation_error', message: `replayData too large (max ${MAX_REPLAY_ELEMENTS})` });
    }
    // Кратность 4 (tick, x, y, angle per frame)
    if (replayData.length % 4 !== 0) {
        return res.status(400).json({ error: 'validation_error', message: 'replayData length must be multiple of 4' });
    }

    // Cap монет на сервере (GDD §7.2: 5-15 за заезд)
    const safeCoinCount = (typeof coinsCollected === 'number' && coinsCollected > 0)
        ? Math.min(Math.round(coinsCollected), MAX_COINS_PER_RUN)
        : 0;

    const db = getPool();

    try {
        await db.query('BEGIN');

        // Проверяем текущий рекорд до обновления (для начисления монет только при улучшении)
        const prevResult = await db.query(
            `SELECT best_finish_ms FROM race_leaderboard WHERE user_id = $1 AND track_id = $2`,
            [userId, trackId],
        );
        const prevBestMs = prevResult.rows[0]?.best_finish_ms ?? Infinity;
        const isNewRecord = Math.round(finishMs) < prevBestMs;

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
                           replay_data = CASE WHEN $3 <= ghost_replays.finish_ms THEN $4 ELSE ghost_replays.replay_data END,
                           created_at = NOW()`,
            [userId, trackId, Math.round(finishMs), JSON.stringify(replayData)],
        );

        // TODO: начисление монет отложено до медальной системы (GDD §7.2)
        // MVP: монеты за медали, не за каждый заезд

        // Позиция в лидерборде по трассе
        const posResult = await db.query(
            `SELECT COUNT(*) + 1 AS position
             FROM race_leaderboard
             WHERE track_id = $1 AND best_finish_ms < $2`,
            [trackId, Math.round(finishMs)],
        );
        const position = parseInt(posResult.rows[0]?.position ?? '1', 10);

        await db.query('COMMIT');

        res.json({
            success: true,
            finishMs: Math.round(finishMs),
            coinsCollected: safeCoinCount,
            position,
        });
    } catch (err) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('[Runs] Submit error:', err);
        res.status(500).json({ error: 'internal_error' });
    }
});

export default router;
