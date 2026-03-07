import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';
import { AuthService } from '../services/AuthService';
import { TelegramAuthProvider } from '../platform/TelegramAuthProvider';
import { getGoogleOAuthProvider } from '../platform/GoogleOAuthProvider';
import { getYandexOAuthProvider, YandexOAuthProvider } from '../platform/YandexOAuthProvider';
import { getOAuthProviderFactory } from '../platform/OAuthProviderFactory';
import { getGeoIPService } from '../services/GeoIPService';
import { AuthProvider } from '../models/OAuth';
import {
  generateGuestToken,
  generateAccessToken,
  verifyAccessToken,
  verifyGuestToken,
  verifyClaimToken,
  generatePendingAuthToken,
  verifyPendingAuthToken,
  generateUpgradePrepareToken,
  verifyUpgradePrepareToken,
  calculateExpiresAt,
  TOKEN_EXPIRATION,
} from '../utils/jwtUtils';
import { ratingService } from '../services/RatingService';
import { getPostgresPool } from '../../db/pool';
import { getRedisClient } from '../../db/redis';
import { authRateLimiter, oauthRateLimiter } from '../middleware/rateLimiter';
import { validateAndNormalize, normalizeNickname, NICKNAME_MAX_LENGTH } from '../../utils/generators/nicknameValidator';
import { GUEST_DEFAULT_NICKNAME, pickSpriteByName, isValidSprite } from '@bonk-race/shared';

const router = express.Router();

// Rate limiting для всех auth endpoints (10 запросов/минуту)
// Защита от брутфорса и DoS-атак (slime-arena-3ed)
router.use(authRateLimiter);

// P2: Более строгий rate limit для OAuth endpoints (5 запросов/минуту)
// OAuth коды одноразовые — частые запросы подозрительны
router.use('/oauth', oauthRateLimiter);
const authService = new AuthService();

// Copilot P3: Удалена локальная обёртка getPool(), используем getPostgresPool() напрямую

/**
 * Создаёт Redis ключ для pendingAuthToken с использованием sha256 хэша
 * для предотвращения коллизий (Copilot P3)
 */
function getPendingAuthRedisKey(token: string): string {
  const hash = crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
  return `pending_auth:${hash}`;
}

/**
 * Get match result info for claim validation
 * Returns players count and claim_consumed_at status
 */
async function getMatchResultInfo(matchId: string): Promise<{
  playersCount: number;
  claimConsumedAt: Date | null;
} | null> {
  const pool = getPostgresPool();
  const result = await pool.query(
    `SELECT summary, claim_consumed_at FROM match_results WHERE match_id = $1`,
    [matchId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const summary = typeof row.summary === 'string' ? JSON.parse(row.summary) : row.summary;

  // Проверяем наличие playerResults - это обязательное поле для корректных матчей
  if (!summary || !Array.isArray(summary.playerResults)) {
    throw new Error(`Invalid match summary for match_id=${matchId}: playerResults is missing or invalid`);
  }

  const playersCount = summary.playerResults.length;

  return {
    playersCount,
    claimConsumedAt: row.claim_consumed_at,
  };
}

// Telegram auth provider (lazy init to avoid startup errors if not configured)
let telegramProvider: TelegramAuthProvider | null = null;
function getTelegramProvider(): TelegramAuthProvider {
  if (!telegramProvider) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    }
    telegramProvider = new TelegramAuthProvider(botToken);
  }
  return telegramProvider;
}

/**
 * POST /api/v1/auth/guest
 * Generate guest token for Standalone/BonkRace platform.
 * Creates a guest user record in DB so race_leaderboard/ghost_replays FK constraints work.
 */
router.post('/guest', async (req: Request, res: Response) => {
  try {
    // Generate unique guest identifier
    const guestSubjectId = uuidv4();

    // Создаём гостевого пользователя в БД (для FK в race_leaderboard/ghost_replays)
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO users (id, platform_type, platform_id, nickname, created_at, updated_at)
       VALUES ($1, 'guest', $2, $3, NOW(), NOW())
       ON CONFLICT (platform_type, platform_id) DO NOTHING`,
      [guestSubjectId, guestSubjectId, `Guest_${guestSubjectId.slice(0, 6)}`],
    );

    // Generate JWT guest token (7 days)
    const guestToken = generateGuestToken(guestSubjectId);

    // Calculate expiration date
    const expiresAt = calculateExpiresAt(TOKEN_EXPIRATION.GUEST_TOKEN);

    console.log(`[Auth] Guest user + token created for ${guestSubjectId.slice(0, 8)}...`);

    res.json({
      guestToken,
      guestSubjectId,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error('[Auth] Guest token error:', error);
    res.status(500).json({
      error: 'guest_token_failed',
      message: 'Failed to create guest token',
    });
  }
});

/**
 * POST /api/v1/auth/join-token
 * Generate a joinToken for room connection (dev mode / quick play)
 * Requires guest token in Authorization header
 */
router.post('/join-token', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Missing or invalid Authorization header',
      });
    }

    const token = authHeader.slice(7);

    // Try guest token first
    const guestPayload = verifyGuestToken(token);
    if (guestPayload) {
      const { joinTokenService } = await import('../services/JoinTokenService');

      // Generate a simple joinToken for direct connection
      // matchId and roomId will be empty (not assigned via matchmaking)
      // slime-arena-2q0: Валидация никнейма
      let nickname = GUEST_DEFAULT_NICKNAME;
      if (req.body.nickname) {
        try {
          nickname = validateAndNormalize(req.body.nickname);
        } catch {
          // Невалидный nickname — используем fallback
        }
      }
      // spriteId из body (клиент передаёт guest_skin_id), валидация + fallback по хешу имени
      let spriteId: string | undefined;
      if (req.body.skinId && typeof req.body.skinId === 'string' && isValidSprite(req.body.skinId)) {
        spriteId = req.body.skinId;
      } else {
        spriteId = pickSpriteByName(nickname);
      }

      const joinToken = joinTokenService.generateToken(
        '', // userId (empty for guests)
        '', // matchId (not known yet)
        '', // roomId (not known yet)
        nickname,
        guestPayload.sub, // guestSubjectId for claim verification
        spriteId
      );

      return res.json({
        joinToken,
        expiresIn: joinTokenService.getExpiresInSeconds(),
      });
    }

    // Try access token for registered users
    const userPayload = verifyAccessToken(token);
    if (userPayload) {
      const { joinTokenService } = await import('../services/JoinTokenService');

      // slime-arena-2q0: Валидация никнейма
      let nickname = 'Игрок';
      if (req.body.nickname) {
        try {
          nickname = validateAndNormalize(req.body.nickname);
        } catch {
          // Невалидный nickname — используем fallback
        }
      }
      // Получаем spriteId из профиля зарегистрированного пользователя
      let spriteId: string | undefined;
      try {
        const pool = getPostgresPool();
        const profileResult = await pool.query(
          'SELECT selected_skin_id FROM profiles WHERE user_id = $1',
          [userPayload.sub]
        );
        if (profileResult.rows.length > 0 && profileResult.rows[0].selected_skin_id
            && isValidSprite(profileResult.rows[0].selected_skin_id)) {
          spriteId = profileResult.rows[0].selected_skin_id;
        }
      } catch (err) {
        console.warn('[Auth] Failed to fetch spriteId from profile:', err);
      }
      // Fallback: хеш от никнейма
      if (!spriteId) {
        spriteId = pickSpriteByName(nickname);
      }

      const joinToken = joinTokenService.generateToken(
        userPayload.sub, // userId
        '', // matchId
        '', // roomId
        nickname,
        undefined, // guestSubjectId
        spriteId
      );

      return res.json({
        joinToken,
        expiresIn: joinTokenService.getExpiresInSeconds(),
      });
    }

    return res.status(401).json({
      error: 'invalid_token',
      message: 'Invalid or expired token',
    });
  } catch (error: any) {
    console.error('[Auth] Join token error:', error);
    res.status(500).json({
      error: 'join_token_failed',
      message: 'Failed to create join token',
    });
  }
});

/**
 * GET /api/v1/auth/config
 * Returns available OAuth providers for the client's region
 *
 * @see docs/meta-min/TZ-StandaloneAdapter-OAuth-v1.9.md раздел 9.3
 */
router.get('/config', async (req: Request, res: Response) => {
  try {
    // Получаем IP клиента
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.ip
      || req.socket.remoteAddress
      || '127.0.0.1';

    const acceptLanguage = req.get('accept-language');

    // Определяем регион
    const geoService = getGeoIPService();
    const geoResult = await geoService.detectRegion(ip, acceptLanguage);

    // Получаем доступных провайдеров для региона
    const factory = getOAuthProviderFactory();
    const providers = factory.getProvidersForRegion(geoResult.region);

    console.log(`[Auth] Config: IP ${ip} → ${geoResult.region} (${geoResult.source}), providers: ${providers.map(p => p.name).join(', ') || 'none'}`);

    res.json({
      region: geoResult.region,
      providers,
    });
  } catch (error: any) {
    console.error('[Auth] Config error:', error);
    res.status(500).json({
      error: 'config_failed',
      message: 'Failed to get auth configuration',
    });
  }
});

/**
 * POST /api/v1/auth/telegram
 * Telegram silent auth - creates anonymous user or returns existing
 *
 * For new users: creates user with is_anonymous=true
 * For existing users: returns existing profile
 */
router.post('/telegram', async (req: Request, res: Response) => {
  try {
    const { initData } = req.body;

    if (!initData) {
      return res.status(400).json({
        error: 'missing_parameters',
        message: 'initData is required',
      });
    }

    // Verify Telegram initData
    const provider = getTelegramProvider();
    const platformUser = await provider.verifyToken(initData);
    const { platformUserId, nickname, avatarUrl, metadata } = platformUser;

    // Look up user by oauth_link
    let user = await authService.findUserByOAuthLink('telegram', platformUserId);
    let isNewUser = false;

    if (!user) {
      // Create new anonymous user
      const result = await authService.createTelegramAnonymousUser(
        platformUserId,
        nickname,
        avatarUrl,
        metadata
      );
      user = result.user;
      isNewUser = true;
      console.log(`[Auth] New Telegram user created: ${user.id.slice(0, 8)}... (anonymous)`);
    } else {
      // Update last login for existing user
      await authService.updateLastLogin(user.id);
      console.log(`[Auth] Telegram user logged in: ${user.id.slice(0, 8)}... (anonymous: ${user.isAnonymous})`);
    }

    // Generate JWT access token with isAnonymous flag
    const accessToken = generateAccessToken(user.id, user.isAnonymous);

    res.json({
      accessToken,
      userId: user.id,
      profile: {
        nickname: user.nickname,
        locale: user.locale,
      },
      isNewUser,
      isAnonymous: user.isAnonymous,
    });
  } catch (error: any) {
    console.error('[Auth] Telegram auth error:', error);

    // Specific error for misconfiguration
    if (error.message.includes('TELEGRAM_BOT_TOKEN')) {
      return res.status(500).json({
        error: 'configuration_error',
        message: 'Telegram auth not configured',
      });
    }

    res.status(401).json({
      error: 'telegram_auth_failed',
      message: 'Telegram authentication failed',
    });
  }
});

/**
 * POST /api/v1/auth/verify
 * Verify platform authentication and create session
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const { platformType, platformAuthToken } = req.body;

    if (!platformType || !platformAuthToken) {
      return res.status(400).json({
        error: 'missing_parameters',
        message: 'platformType and platformAuthToken are required',
      });
    }

    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.get('user-agent');

    const { user, session } = await authService.verifyAndCreateSession(
      platformType,
      platformAuthToken,
      ip,
      userAgent
    );

    res.json({
      accessToken: session.accessToken,
      userId: user.id,
      profile: {
        nickname: user.nickname,
        locale: user.locale,
      },
    });
  } catch (error: any) {
    console.error('[Auth] Verification error:', error);
    res.status(401).json({
      error: 'auth_failed',
      message: 'Authentication failed',
    });
  }
});

/**
 * POST /api/v1/auth/oauth
 * OAuth login (Google/Yandex)
 *
 * For existing accounts — returns accessToken.
 * For new users — creates account and returns accessToken (slime-arena-ias0).
 */
router.post('/oauth', async (req: Request, res: Response) => {
  try {
    const { provider, code } = req.body;

    if (!provider || !code) {
      return res.status(400).json({
        error: 'missing_parameters',
        message: 'provider and code are required',
      });
    }

    if (provider !== 'google' && provider !== 'yandex') {
      return res.status(400).json({
        error: 'invalid_provider',
        message: 'provider must be "google" or "yandex"',
      });
    }

    // P1 Security: Проверка региональной доступности провайдера
    // Предотвращает обход ограничений через прямой вызов /auth/oauth
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || req.ip
      || req.socket.remoteAddress
      || '127.0.0.1';
    const acceptLanguage = req.get('accept-language');

    const geoService = getGeoIPService();
    const geoResult = await geoService.detectRegion(ip, acceptLanguage);

    const providerFactory = getOAuthProviderFactory();
    if (!providerFactory.isProviderAvailable(provider, geoResult.region)) {
      console.log(`[Auth] OAuth blocked: ${provider} not available in region ${geoResult.region} (IP: ${ip})`);
      return res.status(403).json({
        error: 'provider_not_available',
        message: `Provider ${provider} is not available in your region`,
      });
    }

    let providerUserId: string;
    let displayName: string;
    let avatarUrl: string | undefined;

    // Exchange code for user info
    if (provider === 'google') {
      try {
        const googleProvider = getGoogleOAuthProvider();
        const userInfo = await googleProvider.exchangeCode(code);
        providerUserId = userInfo.id;
        displayName = userInfo.name || (userInfo.email ? userInfo.email.split('@')[0] : `User${Date.now() % 100000}`);
        avatarUrl = userInfo.picture;
      } catch (err: any) {
        if (err.message.includes('must be set')) {
          return res.status(500).json({
            error: 'configuration_error',
            message: 'Google OAuth not configured',
          });
        }
        throw err;
      }
    } else {
      try {
        const yandexProvider = getYandexOAuthProvider();
        const userInfo = await yandexProvider.exchangeCode(code);
        providerUserId = userInfo.id;
        displayName = userInfo.display_name || userInfo.login || `User${Date.now() % 100000}`;
        avatarUrl = YandexOAuthProvider.getAvatarUrl(userInfo.default_avatar_id);
      } catch (err: any) {
        if (err.message.includes('must be set')) {
          return res.status(500).json({
            error: 'configuration_error',
            message: 'Yandex OAuth not configured',
          });
        }
        throw err;
      }
    }

    // Look up user by oauth_link
    let user = await authService.findUserByOAuthLink(provider as AuthProvider, providerUserId);

    if (!user) {
      // Account not found — создаём нового пользователя (fix slime-arena-ias0)
      let nickname: string;
      try {
        nickname = validateAndNormalize(displayName);
      } catch {
        nickname = `User${Date.now() % 100000}`;
      }

      const skinId = pickSpriteByName(nickname);

      try {
        user = await authService.createUserFromOAuth(
          provider as AuthProvider,
          providerUserId,
          nickname,
          avatarUrl,
          skinId
        );
        console.log(`[Auth] OAuth new user: ${provider} ${providerUserId.slice(0, 8)}... → ${user.id.slice(0, 8)}... (${nickname})`);
      } catch (createError: any) {
        // Race condition: duplicate oauth_link (unique constraint 23505)
        if (createError.code === '23505') {
          user = await authService.findUserByOAuthLink(provider as AuthProvider, providerUserId);
          if (!user) throw createError;
          await authService.updateLastLogin(user.id);
          console.log(`[Auth] OAuth race resolved: ${provider} ${providerUserId.slice(0, 8)}... → ${user.id.slice(0, 8)}...`);
        } else {
          throw createError;
        }
      }
    } else {
      // Update last login for existing user
      await authService.updateLastLogin(user.id);
      console.log(`[Auth] OAuth login: ${provider} user ${providerUserId.slice(0, 8)}... -> ${user.id.slice(0, 8)}...`);
    }

    // Generate access token
    const accessToken = generateAccessToken(user.id, user.isAnonymous);

    res.json({
      accessToken,
      userId: user.id,
      profile: {
        nickname: user.nickname,
        locale: user.locale,
      },
      isAnonymous: user.isAnonymous,
    });
  } catch (error: any) {
    console.error('[Auth] OAuth error:', error);
    res.status(401).json({
      error: 'oauth_failed',
      message: 'OAuth authentication failed',
    });
  }
});

/**
 * P1-4: POST /api/v1/auth/oauth/prepare-upgrade
 * Prepare OAuth upgrade by exchanging code and returning displayName for confirmation
 *
 * Input:
 * - Authorization: Bearer <guestToken>
 * - Body: { provider, code, claimToken? (optional), redirectUri }
 *
 * Returns:
 * - { displayName, avatarUrl, prepareToken } - user confirms nickname, then calls /upgrade
 * - 409 if OAuth already linked to another account
 */
router.post('/oauth/prepare-upgrade', async (req: Request, res: Response) => {
  try {
    const { provider, code, claimToken, redirectUri } = req.body;

    if (!provider || !code) {
      return res.status(400).json({
        error: 'missing_parameters',
        message: 'provider and code are required',
      });
    }

    if (provider !== 'google' && provider !== 'yandex') {
      return res.status(400).json({
        error: 'invalid_provider',
        message: 'provider must be "google" or "yandex"',
      });
    }

    // Verify guestToken from Authorization header
    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Authorization header required',
      });
    }

    const token = authHeader.substring(7);
    const guestPayload = verifyGuestToken(token);
    if (!guestPayload) {
      return res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid or expired guest token',
      });
    }

    // Verify claimToken (optional — гость мог не сыграть матч, slime-arena-ias0)
    if (claimToken) {
      const claimPayload = verifyClaimToken(claimToken);
      if (!claimPayload) {
        return res.status(401).json({
          error: 'invalid_claim_token',
          message: 'Invalid or expired claim token',
        });
      }
    }

    // Exchange OAuth code for user info
    let providerUserId: string;
    let displayName: string;
    let avatarUrl: string | undefined;

    if (provider === 'google') {
      try {
        const googleProvider = getGoogleOAuthProvider();
        const userInfo = await googleProvider.exchangeCode(code);
        providerUserId = userInfo.id;
        displayName = userInfo.name || userInfo.email.split('@')[0];
        avatarUrl = userInfo.picture;
      } catch (err: any) {
        if (err.message.includes('must be set')) {
          return res.status(500).json({
            error: 'configuration_error',
            message: 'Google OAuth not configured',
          });
        }
        throw err;
      }
    } else {
      try {
        const yandexProvider = getYandexOAuthProvider();
        const userInfo = await yandexProvider.exchangeCode(code);
        providerUserId = userInfo.id;
        displayName = userInfo.display_name || userInfo.login;
        avatarUrl = YandexOAuthProvider.getAvatarUrl(userInfo.default_avatar_id);
      } catch (err: any) {
        if (err.message.includes('must be set')) {
          return res.status(500).json({
            error: 'configuration_error',
            message: 'Yandex OAuth not configured',
          });
        }
        throw err;
      }
    }

    // Check if OAuth already linked to another account
    const existingUser = await authService.findUserByOAuthLink(provider, providerUserId);
    if (existingUser) {
      // FIX-008: Проверяем Redis ДО генерации токена
      let redis;
      try {
        redis = getRedisClient();
      } catch (redisErr) {
        console.error('[Auth] Redis unavailable for prepare-upgrade conflict - returning 503:', redisErr);
        return res.status(503).json({
          error: 'service_unavailable',
          message: 'Authentication service temporarily unavailable. Please try again.',
        });
      }

      // 409 Conflict - return pendingAuthToken for login to existing account
      const pendingAuthToken = generatePendingAuthToken({
        provider,
        providerUserId,
        existingUserId: existingUser.id,
      });

      // FIX-008: Сохраняем токен в Redis для одноразовости (5 минут)
      // БЕЗ этого /oauth/resolve всегда возвращал 410 "Token not found"
      try {
        const tokenKey = getPendingAuthRedisKey(pendingAuthToken);
        await redis.set(tokenKey, 'valid', { EX: 300 }); // 5 минут
      } catch (redisErr) {
        console.error('[Auth] Redis set failed for pendingAuthToken in prepare-upgrade - returning 503:', redisErr);
        return res.status(503).json({
          error: 'service_unavailable',
          message: 'Authentication service temporarily unavailable. Please try again.',
        });
      }

      // Получаем totalMass существующего пользователя для отображения в UI
      let existingTotalMass = 0;
      try {
        const pool = getPostgresPool();
        const result = await pool.query(
          'SELECT total_mass FROM leaderboard_total_mass WHERE user_id = $1',
          [existingUser.id]
        );
        if (result.rows.length > 0) {
          existingTotalMass = result.rows[0].total_mass || 0;
        }
      } catch {
        // Игнорируем ошибку получения рейтинга
      }

      console.log(`[Auth] Prepare upgrade conflict: ${provider} user ${providerUserId.slice(0, 8)}... already linked to ${existingUser.id.slice(0, 8)}...`);

      return res.status(409).json({
        error: 'oauth_conflict',
        message: 'This OAuth account is already linked to another user',
        existingAccount: {
          nickname: existingUser.nickname,
          avatarUrl: existingUser.avatarUrl,
          totalMass: existingTotalMass,
        },
        pendingAuthToken,
      });
    }

    // Generate prepare token with all needed data
    const prepareToken = generateUpgradePrepareToken({
      provider,
      providerUserId,
      displayName,
      avatarUrl,
      guestSubjectId: guestPayload.sub,
      claimToken,
    });

    console.log(`[Auth] Prepare upgrade: guest ${guestPayload.sub.slice(0, 8)}... → ${provider} ${providerUserId.slice(0, 8)}... (displayName: ${displayName})`);

    res.json({
      displayName,
      avatarUrl,
      prepareToken,
    });
  } catch (error: any) {
    console.error('[Auth] Prepare upgrade error:', error);
    res.status(500).json({
      error: 'prepare_upgrade_failed',
      message: 'Failed to prepare upgrade',
    });
  }
});

/**
 * POST /api/v1/auth/upgrade
 * Upgrade guest/anonymous user to registered
 *
 * Two modes:
 * - convert_guest: guestToken + OAuth + claimToken → new registered user
 *   - Can use prepareToken (from /oauth/prepare-upgrade) instead of code
 * - complete_profile: accessToken (anonymous) + claimToken → complete existing user
 */
router.post('/upgrade', async (req: Request, res: Response) => {
  try {
    const { mode, claimToken, provider, code, prepareToken, nickname } = req.body;

    // P1-4: Support prepareToken flow (has all data including claimToken)
    if (prepareToken && nickname) {
      const preparePayload = verifyUpgradePrepareToken(prepareToken);
      if (!preparePayload) {
        return res.status(401).json({
          error: 'invalid_prepare_token',
          message: 'Invalid or expired prepare token',
        });
      }

      // Verify claimToken if present (optional — гость мог не сыграть матч, slime-arena-ias0)
      if (preparePayload.claimToken) {
        const claimPayload = verifyClaimToken(preparePayload.claimToken);
        if (!claimPayload) {
          return res.status(401).json({
            error: 'invalid_claim_token',
            message: 'Claim token in prepare token is invalid or expired',
          });
        }
        req.body.claimToken = preparePayload.claimToken;
      }

      // Process upgrade with prepareToken data
      req.body.mode = 'convert_guest';
      req.body.provider = preparePayload.provider;
      req.body._preparePayload = preparePayload; // Pass to later processing
    }

    // Re-read possibly modified body values
    const finalMode = req.body.mode;
    const finalClaimToken = req.body.claimToken;

    // claimToken optional при наличии preparePayload (slime-arena-ias0)
    const hasPreparePayload = !!req.body._preparePayload;
    if (!finalMode || (!finalClaimToken && !hasPreparePayload)) {
      return res.status(400).json({
        error: 'missing_parameters',
        message: 'mode is required; claimToken is required unless using prepareToken',
      });
    }

    if (finalMode !== 'convert_guest' && finalMode !== 'complete_profile') {
      return res.status(400).json({
        error: 'invalid_mode',
        message: 'mode must be "convert_guest" or "complete_profile"',
      });
    }

    // Verify claimToken (optional — гость мог не сыграть матч, slime-arena-ias0)
    let claimPayload: any = null;
    let matchId: string | null = null;
    let subjectId: string | null = null;
    let finalMass = 0;
    let skinId: string | null = null;

    if (finalClaimToken) {
      claimPayload = verifyClaimToken(finalClaimToken);
      if (!claimPayload) {
        return res.status(401).json({
          error: 'invalid_claim_token',
          message: 'Invalid or expired claim token',
        });
      }
      ({ matchId, subjectId, finalMass, skinId } = claimPayload);
    }

    // Get match info for player count (P1-4) — only if claimToken provided
    let playersInMatch = 0;
    if (matchId) {
      const matchInfo = await getMatchResultInfo(matchId);
      if (!matchInfo) {
        return res.status(404).json({
          error: 'match_not_found',
          message: 'Match not found',
        });
      }
      playersInMatch = matchInfo.playersCount;
    }

    // Extract auth header
    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Authorization header required',
      });
    }

    const token = authHeader.substring(7);

    if (finalMode === 'convert_guest') {
      // Mode: convert_guest
      // Auth: guestToken
      // Required: (provider + code) OR (prepareToken + nickname)

      const preparePayload = req.body._preparePayload;

      let providerUserId: string;
      let finalNickname: string;
      let avatarUrl: string | undefined;
      let finalProvider: string;

      if (preparePayload) {
        // P1-4: prepareToken flow — use cached OAuth data, user-provided nickname
        providerUserId = preparePayload.providerUserId;

        // slime-arena-2q0: Валидация никнейма от пользователя
        try {
          finalNickname = validateAndNormalize(req.body.nickname);
        } catch (err: any) {
          return res.status(400).json({
            error: 'invalid_nickname',
            message: err.message || 'Invalid nickname format',
          });
        }

        avatarUrl = preparePayload.avatarUrl;
        finalProvider = preparePayload.provider;

        // Verify guestToken matches prepareToken's guestSubjectId
        const guestPayload = verifyGuestToken(token);
        if (!guestPayload || guestPayload.sub !== preparePayload.guestSubjectId) {
          return res.status(401).json({
            error: 'invalid_token',
            message: 'Guest token does not match prepare token',
          });
        }

        // Verify claim belongs to this guest (only if claimToken provided)
        if (subjectId && preparePayload.guestSubjectId !== subjectId) {
          return res.status(403).json({
            error: 'forbidden',
            message: 'Claim token does not belong to this guest',
          });
        }
      } else {
        // Original flow: provider + code
        if (!provider || !code) {
          return res.status(400).json({
            error: 'missing_parameters',
            message: 'provider and code are required for convert_guest mode',
          });
        }

        if (provider !== 'google' && provider !== 'yandex') {
          return res.status(400).json({
            error: 'invalid_provider',
            message: 'provider must be "google" or "yandex"',
          });
        }

        finalProvider = provider;

        // P1-4 Security: Проверка региональной доступности провайдера для convert_guest.
        // Предотвращает обход ограничений через прямой вызов /auth/upgrade.
        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
          || req.ip
          || req.socket.remoteAddress
          || '127.0.0.1';
        const acceptLanguage = req.get('accept-language');

        const geoService = getGeoIPService();
        const geoResult = await geoService.detectRegion(ip, acceptLanguage);

        const providerFactory = getOAuthProviderFactory();
        if (!providerFactory.isProviderAvailable(provider, geoResult.region)) {
          console.log(`[Auth] Upgrade blocked: ${provider} not available in region ${geoResult.region} (IP: ${ip})`);
          return res.status(403).json({
            error: 'provider_not_available',
            message: `Provider ${provider} is not available in your region`,
          });
        }

        // Verify guestToken
        const guestPayload = verifyGuestToken(token);
        if (!guestPayload) {
          return res.status(401).json({
            error: 'invalid_token',
            message: 'Invalid or expired guest token',
          });
        }

        // Verify claim belongs to this guest
        if (guestPayload.sub !== subjectId) {
          return res.status(403).json({
            error: 'forbidden',
            message: 'Claim token does not belong to this guest',
          });
        }

        // Exchange OAuth code
        if (provider === 'google') {
          try {
            const googleProvider = getGoogleOAuthProvider();
            const userInfo = await googleProvider.exchangeCode(code);
            providerUserId = userInfo.id;
            // slime-arena-2q0: Валидация никнейма из OAuth с fallback
            // P1-4: Null-check для userInfo.name и userInfo.email
            const rawNickname = userInfo.name || (userInfo.email ? userInfo.email.split('@')[0] : null);
            if (!rawNickname) {
              console.warn('[OAuth] Google userInfo missing name and email, using fallback');
              finalNickname = `User${Date.now() % 100000}`;
            } else {
              try {
                finalNickname = validateAndNormalize(rawNickname);
              } catch {
                // P2: Безопасный fallback — генерируем никнейм вместо normalizeNickname()
                // normalizeNickname() не валидирует паттерн, emoji и спецсимволы могут пройти
                console.warn(`[OAuth] Nickname validation failed for "${rawNickname}", using generated fallback`);
                finalNickname = `User${Date.now() % 100000}`;
              }
            }
            avatarUrl = userInfo.picture;
          } catch (err: any) {
            if (err.message.includes('must be set')) {
              // P3-3: Generic error message без деталей реализации
              return res.status(503).json({
                error: 'oauth_unavailable',
                message: 'OAuth temporarily unavailable',
              });
            }
            throw err;
          }
        } else {
          try {
            const yandexProvider = getYandexOAuthProvider();
            const userInfo = await yandexProvider.exchangeCode(code);
            providerUserId = userInfo.id;
            // slime-arena-2q0: Валидация никнейма из OAuth с fallback
            // P1-4: Null-check для userInfo.display_name и userInfo.login
            const rawNickname = userInfo.display_name || userInfo.login || null;
            if (!rawNickname) {
              console.warn('[OAuth] Yandex userInfo missing display_name and login, using fallback');
              finalNickname = `User${Date.now() % 100000}`;
            } else {
              try {
                finalNickname = validateAndNormalize(rawNickname);
              } catch {
                // P2: Безопасный fallback — генерируем никнейм вместо normalizeNickname()
                // normalizeNickname() не валидирует паттерн, emoji и спецсимволы могут пройти
                console.warn(`[OAuth] Nickname validation failed for "${rawNickname}", using generated fallback`);
                finalNickname = `User${Date.now() % 100000}`;
              }
            }
            avatarUrl = YandexOAuthProvider.getAvatarUrl(userInfo.default_avatar_id);
          } catch (err: any) {
            if (err.message.includes('must be set')) {
              // P3-3: Generic error message без деталей реализации
              return res.status(503).json({
                error: 'oauth_unavailable',
                message: 'OAuth temporarily unavailable',
              });
            }
            throw err;
          }
        }
      }

      // Check if OAuth link already exists (conflict)
      // P1-4: Skip for prepareToken flow since /oauth/prepare-upgrade already checked
      const existingUser = preparePayload ? null : await authService.findUserByOAuthLink(finalProvider as AuthProvider, providerUserId);
      if (existingUser) {
        // ТЗ раздел 10: OAuth уже привязан к другому аккаунту
        // Copilot P2: Проверяем Redis ДО генерации токена
        // Если Redis недоступен, нет смысла генерировать токен
        let redis;
        try {
          redis = getRedisClient();
        } catch (redisErr) {
          console.error('[Auth] Redis unavailable - returning 503:', redisErr);
          return res.status(503).json({
            error: 'service_unavailable',
            message: 'Authentication service temporarily unavailable. Please try again.',
          });
        }

        // Генерируем pendingAuthToken для возможности входа в существующий аккаунт
        const pendingAuthToken = generatePendingAuthToken({
          provider: finalProvider,
          providerUserId,
          existingUserId: existingUser.id,
        });

        // Сохраняем токен в Redis для одноразовости (5 минут)
        // ВАЖНО: Redis обязателен для безопасности — без него токен можно использовать многократно
        try {
          const tokenKey = getPendingAuthRedisKey(pendingAuthToken);
          await redis.set(tokenKey, 'valid', { EX: 300 }); // 5 минут
        } catch (redisErr) {
          console.error('[Auth] Redis set failed for pendingAuthToken - returning 503:', redisErr);
          return res.status(503).json({
            error: 'service_unavailable',
            message: 'Authentication service temporarily unavailable. Please try again.',
          });
        }

        // Получаем totalMass существующего пользователя из leaderboard_total_mass
        let existingTotalMass = 0;
        try {
          const pool = getPostgresPool();
          const result = await pool.query(
            'SELECT total_mass FROM leaderboard_total_mass WHERE user_id = $1',
            [existingUser.id]
          );
          if (result.rows.length > 0) {
            existingTotalMass = result.rows[0].total_mass || 0;
          }
        } catch {
          // Игнорируем ошибку получения рейтинга
        }

        console.log(`[Auth] OAuth conflict: ${finalProvider} user ${providerUserId.slice(0, 8)}... already linked to ${existingUser.id.slice(0, 8)}...`);

        return res.status(409).json({
          error: 'oauth_already_linked',
          pendingAuthToken,
          existingAccount: {
            userId: existingUser.id,
            nickname: existingUser.nickname,
            totalMass: existingTotalMass,
            avatarUrl: existingUser.avatarUrl,
          },
        });
      }

      let user;

      if (matchId && subjectId) {
        // Путь с claimToken — есть данные матча
        // RACE CONDITION PROTECTION (slime-arena-ww8):
        // All operations executed in a single DB transaction.
        // markClaimConsumed uses UPDATE ... WHERE claim_consumed_at IS NULL
        // to atomically check and set, preventing double-claim race conditions.
        const client = await authService.getClient();
        try {
          await client.query('BEGIN');

          // Atomically mark claim as consumed first to prevent race conditions (P1-5)
          const claimConsumed = await authService.markClaimConsumed(matchId, subjectId, client);
          if (!claimConsumed) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(409).json({
              error: 'claim_already_consumed',
              message: 'This claim token has already been used',
            });
          }

          // Create registered user
          user = await authService.createUserFromGuest(
            finalProvider as AuthProvider,
            providerUserId,
            finalNickname,
            avatarUrl,
            matchId,
            skinId!,
            client
          );

          // Initialize ratings with actual players count from match_results (P1-4)
          await ratingService.initializeRating(user.id, claimPayload, playersInMatch, client);

          await client.query('COMMIT');
        } catch (txError) {
          await client.query('ROLLBACK');
          throw txError;
        } finally {
          client.release();
        }
      } else {
        // Путь без claimToken — гость регистрируется без матча (slime-arena-ias0)
        const skinForUser = pickSpriteByName(finalNickname);
        user = await authService.createUserFromOAuth(
          finalProvider as AuthProvider,
          providerUserId,
          finalNickname,
          avatarUrl,
          skinForUser
        );
      }

      // Generate access token
      const accessTokenNew = generateAccessToken(user.id, false);

      const logSubject = subjectId ? subjectId.slice(0, 8) + '...' : 'no-match';
      console.log(`[Auth] Upgrade convert_guest: guest ${logSubject} -> user ${user.id.slice(0, 8)}... (${playersInMatch} players)`);

      res.json({
        accessToken: accessTokenNew,
        userId: user.id,
        profile: {
          nickname: user.nickname,
          locale: user.locale,
        },
        isAnonymous: false,
        rating: matchId ? {
          totalMass: finalMass,
          bestMass: finalMass,
          matchesPlayed: 1,
        } : undefined,
      });

    } else {
      // Mode: complete_profile
      // Auth: accessToken (for Telegram-anonymous user)
      // claimToken обязателен для complete_profile
      if (!matchId || !subjectId || !skinId) {
        return res.status(400).json({
          error: 'missing_parameters',
          message: 'claimToken is required for complete_profile mode',
        });
      }

      // Verify accessToken
      const accessPayload = verifyAccessToken(token);
      if (!accessPayload) {
        return res.status(401).json({
          error: 'invalid_token',
          message: 'Invalid or expired access token',
        });
      }

      // Check if user is anonymous
      if (!accessPayload.isAnonymous) {
        return res.status(400).json({
          error: 'not_anonymous',
          message: 'User is already registered (not anonymous)',
        });
      }

      // Verify claim belongs to this user
      if (accessPayload.sub !== subjectId) {
        return res.status(403).json({
          error: 'forbidden',
          message: 'Claim token does not belong to this user',
        });
      }

      // RACE CONDITION PROTECTION (slime-arena-ww8):
      // All operations executed in a single DB transaction.
      // markClaimConsumed uses UPDATE ... WHERE claim_consumed_at IS NULL
      // to atomically check and set, preventing double-claim race conditions.
      const client = await authService.getClient();
      let user;
      try {
        await client.query('BEGIN');

        // Atomically mark claim as consumed first to prevent race conditions (P1-5)
        const claimConsumed = await authService.markClaimConsumed(matchId, subjectId, client);
        if (!claimConsumed) {
          await client.query('ROLLBACK');
          client.release();
          return res.status(409).json({
            error: 'claim_already_consumed',
            message: 'This claim token has already been used',
          });
        }

        // Complete profile
        user = await authService.completeAnonymousProfile(
          accessPayload.sub,
          matchId,
          skinId,
          client
        );

        // Initialize ratings with actual players count from match_results (P1-4)
        await ratingService.initializeRating(user.id, claimPayload, playersInMatch, client);

        await client.query('COMMIT');
      } catch (txError) {
        await client.query('ROLLBACK');
        throw txError;
      } finally {
        client.release();
      }

      // Generate new access token (with isAnonymous = false)
      const accessTokenNew = generateAccessToken(user.id, false);

      console.log(`[Auth] Upgrade complete_profile: user ${user.id.slice(0, 8)}... completed profile (${playersInMatch} players)`);

      res.json({
        accessToken: accessTokenNew,
        userId: user.id,
        profile: {
          nickname: user.nickname,
          locale: user.locale,
        },
        isAnonymous: false,
        rating: {
          totalMass: finalMass,
          bestMass: finalMass,
          matchesPlayed: 1,
        },
      });
    }
  } catch (error: any) {
    console.error('[Auth] Upgrade error:', error);
    res.status(500).json({
      error: 'upgrade_failed',
      message: 'Upgrade failed',
    });
  }
});

/**
 * POST /api/v1/auth/oauth/resolve
 * Login to existing account using pendingAuthToken (after 409 conflict)
 *
 * @see docs/meta-min/TZ-StandaloneAdapter-OAuth-v1.9.md раздел 9.4, 10
 */
router.post('/oauth/resolve', async (req: Request, res: Response) => {
  try {
    const { pendingAuthToken } = req.body;

    if (!pendingAuthToken) {
      return res.status(400).json({
        error: 'missing_parameters',
        message: 'pendingAuthToken is required',
      });
    }

    // Verify pendingAuthToken
    const payload = verifyPendingAuthToken(pendingAuthToken);
    if (!payload) {
      return res.status(400).json({
        error: 'invalid_token',
        message: 'Invalid or expired pendingAuthToken',
      });
    }

    // Check one-time use via Redis
    // ВАЖНО: Redis обязателен — без него нельзя гарантировать одноразовость токена
    let redis;
    try {
      redis = getRedisClient();
    } catch (redisErr) {
      console.error('[Auth] Redis unavailable for pendingAuthToken check - returning 503:', redisErr);
      return res.status(503).json({
        error: 'service_unavailable',
        message: 'Authentication service temporarily unavailable. Please try again.',
      });
    }

    try {
      const tokenKey = getPendingAuthRedisKey(pendingAuthToken);
      const exists = await redis.get(tokenKey);

      if (!exists) {
        // Токен уже использован или истёк в Redis
        return res.status(410).json({
          error: 'token_already_used',
          message: 'This pendingAuthToken has already been used',
        });
      }

      // Удаляем токен из Redis (одноразовое использование)
      await redis.del(tokenKey);
    } catch (redisErr) {
      console.error('[Auth] Redis operation failed for pendingAuthToken - returning 503:', redisErr);
      return res.status(503).json({
        error: 'service_unavailable',
        message: 'Authentication service temporarily unavailable. Please try again.',
      });
    }

    // Get existing user
    const user = await authService.getUserById(payload.existingUserId);
    if (!user) {
      return res.status(404).json({
        error: 'user_not_found',
        message: 'User no longer exists',
      });
    }

    // Update last login
    await authService.updateLastLogin(user.id);

    // Generate access token
    const accessToken = generateAccessToken(user.id, user.isAnonymous);

    console.log(`[Auth] OAuth resolve: ${payload.provider} -> user ${user.id.slice(0, 8)}...`);

    res.json({
      accessToken,
      userId: user.id,
      profile: {
        nickname: user.nickname,
        locale: user.locale,
      },
      isAnonymous: user.isAnonymous,
    });
  } catch (error: any) {
    console.error('[Auth] OAuth resolve error:', error);
    res.status(500).json({
      error: 'resolve_failed',
      message: 'OAuth resolve failed',
    });
  }
});

/**
 * POST /api/v1/auth/logout
 * Revoke current session
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'unauthorized',
        message: 'Missing or invalid authorization header',
      });
    }

    const accessToken = authHeader.substring(7);
    await authService.revokeSession(accessToken);

    res.json({ success: true });
  } catch (error: any) {
    console.error('[Auth] Logout error:', error);
    res.status(500).json({
      error: 'logout_failed',
      message: 'Logout failed',
    });
  }
});

export default router;
