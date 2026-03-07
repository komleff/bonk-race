/**
 * Leaderboard API routes
 *
 * GET /api/v1/leaderboard - Get leaderboard entries
 */

import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { getPostgresPool } from '../../db/pool';
import { verifyAccessToken, AccessTokenPayload } from '../utils/jwtUtils';
import { LeaderboardEntry } from '../models/Leaderboard';
import { isValidSprite } from '@bonk-race/shared';

const router = express.Router();

// Lazy pool initialization
let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) {
    pool = getPostgresPool();
  }
  return pool;
}

type LeaderboardMode = 'total' | 'best';

interface LeaderboardResponse {
  mode: LeaderboardMode;
  entries: LeaderboardEntry[];
  myPosition?: number;
  myValue?: number;
  myMatchesPlayed?: number; // LB-005: только для mode=total
}

/**
 * Extract user from optional authorization header
 * Returns null if no auth or invalid token
 */
function extractUser(req: Request): AccessTokenPayload | null {
  const authHeader = req.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7);
  return verifyAccessToken(token);
}

/**
 * GET /api/v1/leaderboard
 *
 * Query params:
 * - mode: 'total' | 'best' (required)
 * - limit: number (default 100, max 100)
 * - offset: number (default 0)
 *
 * Returns:
 * - entries: top players sorted by mass DESC
 * - myPosition: current user's position (if authenticated and not anonymous)
 * - myValue: current user's value (if authenticated and not anonymous)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const mode = req.query.mode as string;

    if (!mode || (mode !== 'total' && mode !== 'best')) {
      return res.status(400).json({
        error: 'invalid_parameters',
        message: 'mode is required and must be "total" or "best"',
      });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 100, 100);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const db = getPool();

    // Get leaderboard entries
    const entries = await getLeaderboardEntries(db, mode as LeaderboardMode, limit, offset);

    // Build response
    const response: LeaderboardResponse = {
      mode: mode as LeaderboardMode,
      entries,
    };

    // Check for authenticated user position
    const user = extractUser(req);
    if (user && !user.isAnonymous) {
      const userPosition = await getUserPosition(db, mode as LeaderboardMode, user.sub);
      if (userPosition) {
        response.myPosition = userPosition.position;
        response.myValue = userPosition.value;
        // LB-005: myMatchesPlayed только для mode=total
        if (userPosition.matchesPlayed !== undefined) {
          response.myMatchesPlayed = userPosition.matchesPlayed;
        }
      }
    }

    res.json(response);
  } catch (error: any) {
    console.error('[Leaderboard] Error:', error);
    res.status(500).json({
      error: 'leaderboard_error',
      message: 'Failed to fetch leaderboard',
    });
  }
});

/**
 * Fetch leaderboard entries from database
 */
async function getLeaderboardEntries(
  db: Pool,
  mode: LeaderboardMode,
  limit: number,
  offset: number
): Promise<LeaderboardEntry[]> {
  const table = mode === 'total' ? 'leaderboard_total_mass' : 'leaderboard_best_mass';
  const valueColumn = mode === 'total' ? 'total_mass' : 'best_mass';

  // matches_played доступно только в таблице leaderboard_total_mass
  const matchesPlayedColumn = mode === 'total' ? ', lb.matches_played' : '';

  // LB-006: Вторичная сортировка по updated_at для стабильности при равных значениях
  const result = await db.query(
    `SELECT
       ROW_NUMBER() OVER (ORDER BY lb.${valueColumn} DESC, lb.updated_at DESC) as position,
       lb.user_id,
       u.nickname,
       COALESCE(p.selected_skin_id, 'slime-base.webp') as skin_id,
       lb.${valueColumn} as value
       ${matchesPlayedColumn}
     FROM ${table} lb
     INNER JOIN users u ON u.id = lb.user_id
     LEFT JOIN profiles p ON p.user_id = lb.user_id
     WHERE u.is_banned = FALSE
     ORDER BY lb.${valueColumn} DESC, lb.updated_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return result.rows.map((row) => {
    const entry: LeaderboardEntry = {
      position: parseInt(row.position, 10),
      userId: row.user_id,
      nickname: row.nickname,
      skinId: isValidSprite(row.skin_id) ? row.skin_id : 'slime-base.webp',
      value: row.value,
    };

    // matchesPlayed только для mode=total
    if (mode === 'total' && row.matches_played !== undefined) {
      entry.matchesPlayed = row.matches_played;
    }

    return entry;
  });
}

/**
 * Get user's position in leaderboard
 * LB-005: Возвращает matchesPlayed для mode=total
 */
async function getUserPosition(
  db: Pool,
  mode: LeaderboardMode,
  userId: string
): Promise<{ position: number; value: number; matchesPlayed?: number } | null> {
  const table = mode === 'total' ? 'leaderboard_total_mass' : 'leaderboard_best_mass';
  const valueColumn = mode === 'total' ? 'total_mass' : 'best_mass';

  // LB-005: Для mode=total также получаем matches_played
  const matchesPlayedSelect = mode === 'total' ? ', matches_played' : '';

  // Get user's value (и matchesPlayed для mode=total)
  // LB-006: Достаем updated_at для точного расчета позиции (вторичная сортировка)
  const userResult = await db.query(
    `SELECT ${valueColumn} as value, updated_at${matchesPlayedSelect} FROM ${table} WHERE user_id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    return null;
  }

  const userValue = userResult.rows[0].value;
  const userUpdatedAt = userResult.rows[0].updated_at;
  const matchesPlayed = mode === 'total' ? userResult.rows[0].matches_played : undefined;

  // Count users with higher value
  // LB-006: Совмещаем логику с getLeaderboardEntries (ORDER BY mass DESC, updated_at DESC)
  const positionResult = await db.query(
    `SELECT COUNT(*) + 1 as position
     FROM ${table} lb
     INNER JOIN users u ON u.id = lb.user_id
     WHERE u.is_banned = FALSE
       AND (lb.${valueColumn} > $1 OR (lb.${valueColumn} = $1 AND lb.updated_at > $2))`,
    [userValue, userUpdatedAt]
  );

  const result: { position: number; value: number; matchesPlayed?: number } = {
    position: parseInt(positionResult.rows[0].position, 10),
    value: userValue,
  };

  // LB-005: Добавляем matchesPlayed для mode=total
  if (matchesPlayed !== undefined) {
    result.matchesPlayed = matchesPlayed;
  }

  return result;
}

export default router;
