/**
 * Ghosts API routes (GDD §5)
 *
 * GET /api/v1/ghosts?trackId=X  — Get ghost replays (PB + opponent)
 */

import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { getPostgresPool } from '../../db/pool';
import { verifyAccessToken } from '../utils/jwtUtils';

const router = express.Router();

let pool: Pool | null = null;
function getPool(): Pool {
    if (!pool) pool = getPostgresPool();
    return pool;
}

/**
 * GET /api/v1/ghosts?trackId=X
 *
 * Returns up to 2 ghosts:
 * 1. Personal Best — user's own best replay (if authenticated)
 * 2. Opponent — player 1-3 positions above in leaderboard
 */
router.get('/', async (req: Request, res: Response) => {
    const { trackId } = req.query;
    if (!trackId || typeof trackId !== 'string') {
        return res.status(400).json({ error: 'validation_error', message: 'trackId required' });
    }

    const ghosts: any[] = [];

    // Extract user from optional auth header
    const authHeader = req.get('authorization');
    let userId: string | null = null;
    if (authHeader?.startsWith('Bearer ')) {
        const payload = verifyAccessToken(authHeader.substring(7));
        if (payload) userId = payload.sub;
    }

    try {
        const db = getPool();

        // Personal Best ghost
        if (userId) {
            const pbResult = await db.query(
                `SELECT user_id, finish_ms, replay_data
                 FROM ghost_replays
                 WHERE user_id = $1 AND track_id = $2
                 ORDER BY finish_ms ASC LIMIT 1`,
                [userId, trackId],
            );
            if (pbResult.rows.length > 0) {
                const row = pbResult.rows[0];
                ghosts.push({
                    type: 'personal_best',
                    userId: row.user_id,
                    nickname: 'Your PB',
                    spriteId: '',
                    finishMs: row.finish_ms,
                    replayData: row.replay_data,
                });
            }
        }

        // Opponent ghost: find a player just above user in leaderboard
        const opponentResult = await db.query(
            `SELECT gr.user_id, gr.finish_ms, gr.replay_data, p.nickname
             FROM ghost_replays gr
             JOIN profiles p ON p.user_id = gr.user_id
             WHERE gr.track_id = $1
               AND ($2::text IS NULL OR gr.user_id != $2)
             ORDER BY gr.finish_ms ASC
             LIMIT 1`,
            [trackId, userId],
        );
        if (opponentResult.rows.length > 0) {
            const row = opponentResult.rows[0];
            ghosts.push({
                type: 'opponent',
                userId: row.user_id,
                nickname: row.nickname || 'Rival',
                spriteId: '',
                finishMs: row.finish_ms,
                replayData: row.replay_data,
            });
        }
    } catch (err) {
        console.error('[Ghosts] Error fetching ghosts:', err);
        // Return empty ghosts on error (non-critical feature)
    }

    res.json({ ghosts });
});

export default router;
