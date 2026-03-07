import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { MatchmakingService } from '../services/MatchmakingService';
import { verifyAccessToken, verifyGuestToken } from '../utils/jwtUtils';
import { pickSpriteByName, isValidSprite } from '@bonk-race/shared';
import { getPostgresPool } from '../../db/pool';

const router = Router();
const matchmakingService = new MatchmakingService();

// Extend Express Request type to include guest info
declare global {
  namespace Express {
    interface Request {
      /** Guest subject ID (for standalone guests) */
      guestSubjectId?: string;
      /** Effective nickname (from user or body for guests) */
      effectiveNickname?: string;
    }
  }
}

/**
 * Middleware that accepts both accessToken and guestToken
 * For guests: sets req.userId to guestSubjectId (unique guest identifier)
 * For registered users: delegates to authMiddleware
 */
async function authOrGuestMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Missing or invalid authorization header',
    });
  }

  const token = authHeader.substring(7);

  // Try to verify as guestToken first (type='guest')
  const guestPayload = verifyGuestToken(token);
  if (guestPayload) {
    // Guest token is valid
    // Use guestSubjectId as unique identifier for guests (fixes P1: guest conflicts in matchmaking)
    req.userId = guestPayload.sub;
    req.guestSubjectId = guestPayload.sub;
    // Guest nickname comes from request body
    req.effectiveNickname = req.body.nickname || `Guest_${guestPayload.sub.slice(0, 6)}`;
    return next();
  }

  // Try to verify as accessToken (type='user')
  const accessPayload = verifyAccessToken(token);
  if (accessPayload) {
    // Delegate to standard authMiddleware for user lookup
    return authMiddleware(req, res, next);
  }

  // Neither token type is valid
  return res.status(401).json({
    error: 'unauthorized',
    message: 'Invalid or expired token',
  });
}

/**
 * POST /api/v1/matchmaking/join
 * Join matchmaking queue
 *
 * Supports both registered users (accessToken) and guests (guestToken)
 * For guests: nickname should be provided in request body
 */
router.post('/join', authOrGuestMiddleware, async (req, res) => {
  try {
    const userId = req.userId!;
    const { rating } = req.body;

    // Determine nickname: from user profile or from request (guests)
    const nickname = req.user?.nickname || req.effectiveNickname || 'Guest';

    // Определяем spriteId: из профиля (зарег.) или из body (гость)
    let spriteId: string | undefined;
    if (req.guestSubjectId) {
      // Гость: skinId из body
      if (req.body.skinId && typeof req.body.skinId === 'string' && isValidSprite(req.body.skinId)) {
        spriteId = req.body.skinId;
      }
    } else {
      // Зарегистрированный: из профиля
      try {
        const pool = getPostgresPool();
        const profileResult = await pool.query(
          'SELECT selected_skin_id FROM profiles WHERE user_id = $1',
          [userId]
        );
        if (profileResult.rows.length > 0 && profileResult.rows[0].selected_skin_id
            && isValidSprite(profileResult.rows[0].selected_skin_id)) {
          spriteId = profileResult.rows[0].selected_skin_id;
        }
      } catch (err) {
        console.warn('[Matchmaking] Failed to fetch spriteId from profile:', err);
      }
    }
    // Fallback: хеш от никнейма
    if (!spriteId) {
      spriteId = pickSpriteByName(nickname);
    }

    // Pass guestSubjectId and spriteId for standalone guests
    await matchmakingService.joinQueue(userId, nickname, rating || 1500, req.guestSubjectId, spriteId);

    const position = await matchmakingService.getQueuePosition(userId);

    res.json({
      success: true,
      queuePosition: position,
      message: 'Joined matchmaking queue',
    });
  } catch (error: any) {
    console.error('[Matchmaking] Join error:', error);
    res.status(400).json({
      error: 'matchmaking_error',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/matchmaking/cancel
 * Leave matchmaking queue
 *
 * Supports both registered users and guests
 */
router.post('/cancel', authOrGuestMiddleware, async (req, res) => {
  try {
    const userId = req.userId!;

    const removed = await matchmakingService.leaveQueue(userId);

    res.json({
      success: removed,
      message: removed ? 'Left matchmaking queue' : 'Not in queue',
    });
  } catch (error: any) {
    console.error('[Matchmaking] Cancel error:', error);
    res.status(400).json({
      error: 'matchmaking_error',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/matchmaking/joined
 * Notify that user has successfully joined the match room
 * Clears the user's match assignment from Redis (no longer needed for polling)
 *
 * Supports both registered users and guests
 */
router.post('/joined', authOrGuestMiddleware, async (req, res) => {
  try {
    const userId = req.userId!;

    await matchmakingService.clearUserMatchAssignment(userId);

    res.json({
      success: true,
      message: 'Match assignment cleared',
    });
  } catch (error: any) {
    console.error('[Matchmaking] Joined notification error:', error);
    res.status(500).json({
      error: 'matchmaking_error',
      message: error.message,
    });
  }
});

/**
 * GET /api/v1/matchmaking/status
 * Get matchmaking status for current user
 *
 * Supports both registered users and guests
 */
router.get('/status', authOrGuestMiddleware, async (req, res) => {
  try {
    const userId = req.userId!;

    // First, check if user has been assigned to a match
    const matchId = await matchmakingService.getUserMatchId(userId);
    if (matchId) {
      // User has been assigned to a match - return assignment with joinToken
      const assignment = await matchmakingService.getPlayerAssignment(matchId, userId);
      if (assignment) {
        return res.json({
          inQueue: false,
          matched: true,
          assignment,
        });
      }
    }

    // Otherwise, check queue status
    const inQueue = await matchmakingService.isInQueue(userId);
    const position = inQueue ? await matchmakingService.getQueuePosition(userId) : -1;
    const stats = await matchmakingService.getQueueStats();

    res.json({
      inQueue,
      matched: false,
      queuePosition: position,
      queueStats: stats,
    });
  } catch (error: any) {
    console.error('[Matchmaking] Status error:', error);
    res.status(500).json({
      error: 'matchmaking_error',
      message: error.message,
    });
  }
});

export default router;
