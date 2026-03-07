import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { getPostgresPool } from '../../db/pool';
import { requireServerToken } from '../middleware/auth';
import { MatchSummary, PlayerResult } from '@bonk-race/shared/src/types';
import {
  verifyAccessToken,
  verifyGuestToken,
  generateClaimToken,
  calculateExpiresAt,
  TOKEN_EXPIRATION,
} from '../utils/jwtUtils';
import { loadBalanceConfig } from '../../config/loadBalanceConfig';
import { ratingService } from '../services/RatingService';
import { authRateLimiter } from '../middleware/rateLimiter';
import { pickSpriteByName, isValidSprite } from '@bonk-race/shared';

const router = express.Router();

/**
 * Lazy pool accessor
 */
let _pool: Pool | null = null;
function getPool(): Pool {
  if (!_pool) {
    _pool = getPostgresPool();
  }
  return _pool;
}

/**
 * POST /api/v1/match-results/submit
 * Submit match results from MatchServer
 * Requires ServerToken authorization
 *
 * Schema: match_results table uses JSONB `summary` field for all player data
 * See: server/src/db/migrations/001_initial_schema.sql
 */
router.post('/submit', requireServerToken, async (req: Request, res: Response) => {
  try {
    const matchSummary = req.body as MatchSummary;

    // Validate required fields
    if (!matchSummary.matchId) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'matchId is required',
      });
    }

    if (!matchSummary.playerResults || matchSummary.playerResults.length === 0) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'playerResults is required and must not be empty',
      });
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Build summary JSONB with playerResults and matchStats
      const summary = {
        playerResults: matchSummary.playerResults,
        matchStats: matchSummary.matchStats || null,
      };

      // Use INSERT ... ON CONFLICT DO NOTHING for race-condition-safe idempotency
      // This handles concurrent requests atomically without SELECT→INSERT race
      const insertResult = await client.query(
        `INSERT INTO match_results
         (match_id, mode, started_at, ended_at, config_version, build_version, summary, guest_subject_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (match_id) DO NOTHING
         RETURNING match_id`,
        [
          matchSummary.matchId,
          matchSummary.mode,
          matchSummary.startedAt,
          matchSummary.endedAt,
          matchSummary.configVersion,
          matchSummary.buildVersion,
          JSON.stringify(summary),
          matchSummary.guestSubjectId || null,
        ]
      );

      // If no rows returned, match was already processed (idempotency)
      // Note: rowCount can be null in pg types, use falsy check
      if (!insertResult.rowCount) {
        await client.query('COMMIT');
        console.log(`[MatchResults] Match ${matchSummary.matchId} already processed (idempotency)`);
        return res.json({
          success: true,
          message: 'Match results already processed',
          matchId: matchSummary.matchId,
        });
      }

      // Update authenticated players' stats (XP, coins, and rating)
      const playersInMatch = matchSummary.playerResults.length;
      for (const playerResult of matchSummary.playerResults) {
        if (playerResult.userId) {
          await updatePlayerStats(client, playerResult);
        }
      }

      await client.query('COMMIT');

      // Award rating to registered players (after commit, non-blocking)
      // RatingService handles its own transaction and idempotency
      for (const playerResult of matchSummary.playerResults) {
        if (playerResult.userId) {
          ratingService.awardRating(
            playerResult.userId,
            matchSummary.matchId,
            playerResult.finalMass,
            playersInMatch
          ).then((result) => {
            // P0-3: Логируем результат для диагностики
            if (!result.success) {
              console.warn(
                `[MatchResults] Rating not awarded for user ${playerResult.userId?.slice(0, 8)}...: ${result.reason}`
              );
            }
          }).catch((error) => {
            console.error(`[MatchResults] Failed to award rating for user ${playerResult.userId?.slice(0, 8)}...:`, error);
          });
        }
      }

      console.log(`[MatchResults] Saved match ${matchSummary.matchId} with ${matchSummary.playerResults.length} players`);

      res.json({
        success: true,
        message: 'Match results saved',
        matchId: matchSummary.matchId,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('[MatchResults] Error submitting results:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to save match results',
    });
  }
});

/**
 * Update player profile stats after match
 *
 * Note: profiles table only has columns: user_id, level, xp, selected_skin_id
 * Stats like total_matches, total_kills are stored in match_results.summary JSONB
 * and can be computed via SQL aggregation when needed.
 */
async function updatePlayerStats(client: any, playerResult: PlayerResult): Promise<void> {
  // Grant XP based on placement and kills
  // profiles.xp column exists in schema
  const xpGain = calculateXpGain(playerResult);
  if (xpGain > 0) {
    await client.query(
      `UPDATE profiles SET xp = xp + $2, updated_at = NOW() WHERE user_id = $1`,
      [playerResult.userId, xpGain]
    );
  }

  // Grant coins based on placement
  // wallets.coins column exists in schema
  const coinsGain = calculateCoinsGain(playerResult);
  if (coinsGain > 0) {
    await client.query(
      `UPDATE wallets SET coins = coins + $2, updated_at = NOW() WHERE user_id = $1`,
      [playerResult.userId, coinsGain]
    );
  }
}

// Default rewards config (fallback if not in balance.json)
const DEFAULT_REWARDS = {
  xp: { base: 10, placement: { '1': 50, '2': 30, '3': 20, top5: 10 }, perKill: 5 },
  coins: { base: 5, placement: { '1': 25, '2': 15, '3': 10, top5: 5 }, perKill: 2 },
};

/**
 * Get rewards config from balance.json with fallback to defaults
 */
function getRewardsConfig() {
  try {
    const balance = loadBalanceConfig();
    return balance.rewards || DEFAULT_REWARDS;
  } catch (error) {
    console.error('[matchResults] Failed to load rewards config from balance.json, using defaults', error);
    return DEFAULT_REWARDS;
  }
}

/**
 * Calculate XP gain based on match performance
 * Values loaded from config/balance.json
 */
function calculateXpGain(playerResult: PlayerResult): number {
  const { xp } = getRewardsConfig();
  let result = xp.base;

  // Placement bonus
  if (playerResult.placement === 1) result += xp.placement['1'];
  else if (playerResult.placement === 2) result += xp.placement['2'];
  else if (playerResult.placement === 3) result += xp.placement['3'];
  else if (playerResult.placement <= 5) result += xp.placement.top5;

  // Kill bonus
  result += playerResult.killCount * xp.perKill;

  return result;
}

/**
 * Calculate coins gain based on match performance
 * Values loaded from config/balance.json
 */
function calculateCoinsGain(playerResult: PlayerResult): number {
  const { coins } = getRewardsConfig();
  let result = coins.base;

  // Placement bonus
  if (playerResult.placement === 1) result += coins.placement['1'];
  else if (playerResult.placement === 2) result += coins.placement['2'];
  else if (playerResult.placement === 3) result += coins.placement['3'];
  else if (playerResult.placement <= 5) result += coins.placement.top5;

  // Kill bonus
  result += playerResult.killCount * coins.perKill;

  return result;
}

/**
 * POST /api/v1/match-results/claim
 * Get claimToken for a match (used in auth/upgrade flow)
 *
 * Requires: Authorization: Bearer <accessToken or guestToken>
 *
 * Body: { matchId: string }
 *
 * Returns: { claimToken: string, expiresAt: string }
 */
router.post('/claim', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { matchId } = req.body;

    if (!matchId) {
      return res.status(400).json({
        error: 'validation_error',
        message: 'matchId is required',
      });
    }

    // Extract and verify token
    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Authorization header required',
      });
    }

    const token = authHeader.substring(7);

    // Try to verify as accessToken first, then as guestToken
    const accessPayload = verifyAccessToken(token);
    const guestPayload = verifyGuestToken(token);

    if (!accessPayload && !guestPayload) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid or expired token',
      });
    }

    // Determine subject ID based on token type
    const isGuest = !!guestPayload;
    const subjectId = isGuest ? guestPayload!.sub : accessPayload!.sub;

    const pool = getPool();

    // Fetch match result
    const matchResult = await pool.query(
      `SELECT
         match_id,
         summary,
         guest_subject_id,
         claim_consumed_at,
         ended_at
       FROM match_results
       WHERE match_id = $1`,
      [matchId]
    );

    if (matchResult.rows.length === 0) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Match not found',
      });
    }

    const match = matchResult.rows[0];

    // Check ownership — парсинг summary с защитой от corrupted JSON
    let summary: { playerResults?: PlayerResult[] } | null = null;
    try {
      summary = typeof match.summary === 'string' ? JSON.parse(match.summary) : match.summary;
    } catch (parseError) {
      console.error(`[MatchResults] Invalid JSON in summary for match ${matchId}`);
      return res.status(400).json({
        error: 'invalid_data',
        message: 'Corrupted match data',
      });
    }
    const playerResults = summary?.playerResults || [];

    let playerData: PlayerResult | undefined;

    if (isGuest) {
      // Для гостей: ищем в playerResults по guestSubjectId (fix: slime-arena-euy3)
      // Fallback: если playerResults пуст (legacy-записи), проверяем guest_subject_id
      playerData = playerResults.find((p: PlayerResult) => p.guestSubjectId === subjectId);
      if (!playerData) {
        // Fallback для legacy/partial записей: проверяем колонку guest_subject_id
        const isLegacyGuestMatch = match.guest_subject_id === subjectId;
        if (!isLegacyGuestMatch) {
          console.log(`[MatchResults] Guest ${subjectId.slice(0, 8)}... not found in match ${matchId.slice(0, 8)}...`);
          return res.status(403).json({
            error: 'forbidden',
            message: 'Match does not belong to this guest',
          });
        }
        console.log(`[MatchResults] Guest ${subjectId.slice(0, 8)}... authorized via legacy guest_subject_id`);
      }
    } else {
      // For registered user: check playerResults for matching userId
      playerData = playerResults.find((p: PlayerResult) => p.userId === subjectId);
      if (!playerData) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Match does not belong to this user',
        });
      }
    }

    // Check if already claimed
    if (match.claim_consumed_at) {
      return res.status(409).json({
        error: 'already_claimed',
        message: 'Match result has already been claimed',
      });
    }

    // Get final mass from player data
    const finalMass = playerData?.finalMass ?? 0;

    // Get skinId: for registered users fetch from profile, for guests use from request body
    let skinId: string | undefined;
    if (isGuest) {
      // Гости передают skinId (имя спрайта) из localStorage через request body
      if (req.body.skinId && typeof req.body.skinId === 'string'
          && req.body.skinId.length <= 64 && isValidSprite(req.body.skinId)) {
        skinId = req.body.skinId;
      }
    } else if (subjectId) {
      const profileResult = await pool.query(
        'SELECT selected_skin_id FROM profiles WHERE user_id = $1',
        [subjectId]
      );
      if (profileResult.rows.length > 0 && profileResult.rows[0].selected_skin_id
          && isValidSprite(profileResult.rows[0].selected_skin_id)) {
        skinId = profileResult.rows[0].selected_skin_id;
      }
    }

    // Fallback: хеш от subjectId (детерминированный выбор спрайта)
    if (!skinId) {
      skinId = pickSpriteByName(subjectId || 'unknown');
    }

    // Generate claimToken
    const claimToken = generateClaimToken({
      matchId,
      subjectId,
      finalMass,
      skinId,
    });

    const expiresAt = calculateExpiresAt(TOKEN_EXPIRATION.CLAIM_TOKEN);

    console.log(
      `[MatchResults] Claim token generated for ${isGuest ? 'guest' : 'user'} ` +
      `${subjectId.slice(0, 8)}..., match: ${matchId.slice(0, 8)}..., mass: ${finalMass}`
    );

    res.json({
      claimToken,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error('[MatchResults] Claim error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'Failed to generate claim token',
    });
  }
});

export default router;
