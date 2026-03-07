import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { AuthService, User } from '../services/AuthService';
import { verifyAccessToken, verifyGuestToken } from '../utils/jwtUtils';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
      userId?: string;
    }
  }
}

const authService = new AuthService();

// Admin user IDs (from environment or hardcoded for dev)
const ADMIN_USER_IDS = new Set(
  (process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean)
);

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Missing or invalid authorization header',
      });
    }

    const token = authHeader.substring(7);

    // Try JWT accessToken first (new flow)
    const jwtPayload = verifyAccessToken(token);
    if (jwtPayload) {
      // JWT is valid - get user by ID from payload.sub
      const user = await authService.getUserById(jwtPayload.sub);
      if (user) {
        req.user = user;
        req.userId = user.id;
        return next();
      }
      // User not found by JWT sub - token is stale or user deleted
      return res.status(401).json({
        error: 'unauthorized',
        message: 'User not found',
      });
    }

    // Try guest token (BonkRace guest flow)
    const guestPayload = verifyGuestToken(token);
    if (guestPayload) {
      // Guest-токен валиден — sub содержит guestSubjectId
      // Для BonkRace гость может сохранять результаты по своему sub ID
      req.userId = guestPayload.sub;
      req.user = {
        id: guestPayload.sub,
        platformId: guestPayload.sub,
        platformType: 'guest',
        nickname: 'Guest',
      } as User;
      return next();
    }

    // Fallback: try session-based token (legacy flow)
    const user = await authService.verifySession(token);

    if (!user) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid or expired session',
      });
    }

    req.user = user;
    req.userId = user.id;
    next();
  } catch (error: any) {
    console.error('[Auth Middleware] Error:', error);
    res.status(500).json({
      error: 'auth_error',
      message: 'Authentication verification failed',
    });
  }
}

/**
 * Require admin role
 * Must be used after requireAuth
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Authentication required',
      });
    }

    // Check if user is admin
    const isAdmin = ADMIN_USER_IDS.has(req.user.id) || 
                    ADMIN_USER_IDS.has(req.user.platformId) ||
                    // Dev mode: allow all in development
                    (process.env.NODE_ENV === 'development' && req.user.platformType === 'dev');

    if (!isAdmin) {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Admin access required',
      });
    }

    next();
  } catch (error: any) {
    console.error('[Admin Middleware] Error:', error);
    res.status(500).json({
      error: 'auth_error',
      message: 'Admin verification failed',
    });
  }
}

// Alias for backward compatibility
export const authMiddleware = requireAuth;

/**
 * Require Server Token auth for server-to-server communication
 * Uses shared secret from MATCH_SERVER_TOKEN environment variable
 */
export function requireServerToken(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.get('authorization');

    if (!authHeader || !authHeader.startsWith('ServerToken ')) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Missing or invalid server token',
      });
    }

    const token = authHeader.substring(12);
    const expectedToken = process.env.MATCH_SERVER_TOKEN;

    if (!expectedToken) {
      console.error('[ServerToken] MATCH_SERVER_TOKEN not configured');
      return res.status(500).json({
        error: 'server_error',
        message: 'Server token not configured',
      });
    }

    // Use timing-safe comparison to prevent timing attacks
    const tokenBuffer = Buffer.from(token, 'utf8');
    const expectedBuffer = Buffer.from(expectedToken, 'utf8');

    // timingSafeEqual requires same-length buffers
    const tokensMatch = tokenBuffer.length === expectedBuffer.length &&
                        timingSafeEqual(tokenBuffer, expectedBuffer);

    if (!tokensMatch) {
      console.warn('[ServerToken] Invalid token received');
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid server token',
      });
    }

    next();
  } catch (error: any) {
    console.error('[ServerToken Middleware] Error:', error);
    res.status(500).json({
      error: 'auth_error',
      message: 'Server token verification failed',
    });
  }
}

