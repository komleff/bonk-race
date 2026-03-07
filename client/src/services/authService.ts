/**
 * AuthService — управление авторизацией на клиенте.
 *
 * SECURITY NOTE: Токены хранятся в localStorage.
 * Это осознанный компромисс для игрового SPA-клиента:
 * - HttpOnly cookies не работают с WebSocket
 * - Токен нужен в JavaScript для API-вызовов
 * - XSS-защита обеспечивается на уровне CSP и санитизации входных данных
 * - Срок жизни токенов ограничен (24ч access, 7д guest)
 */

import { metaServerClient } from '../api/metaServerClient';
import { platformManager } from '../platform';
import {
  setAuthState,
  clearAuthState,
  setAuthError,
  setAuthenticating,
  cachedJoinToken,
  type User,
  type Profile,
} from '../ui/signals/gameState';
import balanceConfig from '../../../config/balance.json';
import { GUEST_DEFAULT_NICKNAME, SPRITE_NAMES } from '@bonk-race/shared';

/**
 * Ответ сервера на /auth/guest
 */
interface GuestAuthResponse {
  guestToken: string;
  expiresAt: string;
}

/**
 * Ответ сервера на /auth/telegram
 * Контракт: server/src/meta/routes/auth.ts:159-168
 */
interface TelegramAuthResponse {
  accessToken: string;
  userId: string;
  profile: {
    nickname: string;
    locale?: string;
  };
  isNewUser: boolean;
  isAnonymous: boolean;
}

/**
 * Ответ сервера на /auth/verify
 * Контракт: server/src/meta/routes/auth.ts:212-219
 */
interface PlatformAuthResponse {
  accessToken: string;
  userId: string;
  profile: {
    nickname: string;
    locale?: string;
  };
}

/**
 * Ответ сервера на /profile (ProfileSummary)
 */
interface ProfileSummary {
  userId: string;
  nickname: string;
  level: number;
  xp: number;
  selectedSkinId?: string;
  gamesPlayed?: number;
  totalKills?: number;
  highestMass?: number;
  wallet: {
    coins: number;
    gems: number;
  };
}

/**
 * Создаёт объект Profile с дефолтными значениями.
 * FIX-007: Принимает ProfileSummary для заполнения статистики с сервера
 */
function createDefaultProfile(level = 1, xp = 0, summary?: Partial<ProfileSummary>): Profile {
  return {
    rating: balanceConfig.initialProfile.rating,
    ratingDeviation: balanceConfig.initialProfile.ratingDeviation,
    gamesPlayed: summary?.gamesPlayed || 0,
    gamesWon: 0,
    totalKills: summary?.totalKills || 0,
    highestMass: summary?.highestMass || 0,
    level,
    xp,
  };
}

/**
 * Создаёт объект User с заданными параметрами.
 */
function createUser(
  userId: string,
  nickname: string,
  platformType: string
): User {
  return {
    id: userId,
    platformType,
    platformId: userId,
    nickname,
    createdAt: new Date().toISOString(),
  };
}

class AuthService {
  private initialized = false;
  private initializationPromise: Promise<boolean> | null = null;

  /**
   * slime-arena-yij: Обновляет кэшированный joinToken из localStorage.
   * Вызывается после установки/удаления токенов.
   * P2-2: Проверяет expires_at перед кэшированием — истёкшие токены не используются.
   */
  private updateCachedJoinToken(): void {
    const expiresAt = localStorage.getItem('token_expires_at');
    if (expiresAt) {
      const expirationTime = new Date(expiresAt).getTime();
      if (Date.now() > expirationTime) {
        // Токен истёк — очищаем
        console.log('[AuthService] Token expired, clearing');
        localStorage.removeItem('access_token');
        localStorage.removeItem('guest_token');
        localStorage.removeItem('token_expires_at');
        cachedJoinToken.value = null;
        return;
      }
    }
    cachedJoinToken.value = localStorage.getItem('access_token') || localStorage.getItem('guest_token');
  }

  /**
   * Инициализация сервиса.
   * Пытается восстановить сессию из localStorage.
   *
   * FIX-006: setOnUnauthorized устанавливается ПОСЛЕ успешного восстановления сессии,
   * чтобы избежать Auth Loop: 401 → logout() → очистка всех токенов.
   *
   * FIX-001: Если есть guest_token, восстанавливаем гостевую сессию из localStorage
   * БЕЗ вызова login(), чтобы сохранить связь с registration_claim_token.
   *
   * P1-3: Promise memoization предотвращает race condition при параллельных вызовах.
   */
  async initialize(): Promise<boolean> {
    // P1-3: Если уже есть pending инициализация — возвращаем тот же Promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    if (this.initialized) {
      return true;
    }

    // P1-3: Мемоизируем Promise инициализации
    this.initializationPromise = this.doInitialize();
    try {
      return await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  /**
   * Внутренняя реализация инициализации.
   * Вынесена для Promise memoization.
   */
  private async doInitialize(): Promise<boolean> {
    // FIX-006: НЕ устанавливаем setOnUnauthorized в начале!
    // Это предотвращает Auth Loop при истёкшем access_token.

    // Инициализируем PlatformManager
    platformManager.initialize();

    const accessToken = localStorage.getItem('access_token');
    const guestToken = localStorage.getItem('guest_token');

    // Случай 1: Есть access_token — пытаемся восстановить сессию зарегистрированного
    if (accessToken) {
      try {
        setAuthenticating(true);
        metaServerClient.setToken(accessToken);
        const profileSummary = await this.fetchProfile();
        if (profileSummary) {
          // Конвертируем ProfileSummary в User и Profile для signals
          const user = createUser(
            profileSummary.userId,
            profileSummary.nickname,
            platformManager.getPlatformType()
          );
          // FIX-007: Передаём статистику из ProfileSummary
          const profile = createDefaultProfile(profileSummary.level, profileSummary.xp, profileSummary);
          setAuthState(user, profile, accessToken);
          this.initialized = true;
          console.log('[AuthService] Session restored for registered user');

          // FIX-006: Устанавливаем interceptor ПОСЛЕ успешного восстановления
          metaServerClient.setOnUnauthorized(() => this.logout());
          setAuthenticating(false);
          return true;
        }
      } catch (err) {
        console.log('[AuthService] Session restore failed:', err);
        // FIX-006: При ошибке 401 удаляем ТОЛЬКО access_token, НЕ вызываем logout()
        // Это сохраняет guest_token и registration_claim_token для OAuth flow
        localStorage.removeItem('access_token');
        this.updateCachedJoinToken();
        metaServerClient.clearToken();
      } finally {
        setAuthenticating(false);
      }
    }

    // FIX-001: Случай 2: Есть guest_token (но нет access_token) —
    // восстанавливаем гостевую сессию из localStorage БЕЗ вызова login()
    if (guestToken) {
      // fix(slime-arena-boea): Проверяем срок действия ДО восстановления сессии.
      // Если токен истёк — очищаем его и переходим к новому loginAsGuest().
      // Без этой проверки: metaServerClient получает просроченный токен → 401 → logout loop
      // (и isAnonymous() возвращает false после logout → "Сохранить прогресс" не показывается).
      const expiresAt = localStorage.getItem('token_expires_at');
      const isGuestTokenExpired = expiresAt ? Date.now() > new Date(expiresAt).getTime() : false;

      if (!isGuestTokenExpired) {
        console.log('[AuthService] Restoring guest session from localStorage');

        const nickname = localStorage.getItem('guest_nickname') || this.generateGuestNickname();
        const skinId = localStorage.getItem('guest_skin_id') || this.generateGuestSkinId();

        // Сохраняем если были сгенерированы
        if (!localStorage.getItem('guest_nickname')) {
          localStorage.setItem('guest_nickname', nickname);
        }
        if (!localStorage.getItem('guest_skin_id')) {
          localStorage.setItem('guest_skin_id', skinId);
        }

        // Устанавливаем токен в HTTP-клиент
        metaServerClient.setToken(guestToken);

        // P2-3: Синхронизируем кэш после восстановления сессии
        this.updateCachedJoinToken();

        // Создаём User для UI
        const user = createUser('guest', nickname, platformManager.getPlatformType());
        const profile = createDefaultProfile();
        setAuthState(user, profile, guestToken);

        this.initialized = true;
        console.log('[AuthService] Guest session restored, claim token preserved');

        // FIX-006: Устанавливаем interceptor после восстановления
        metaServerClient.setOnUnauthorized(() => this.logout());
        return true;
      }

      // Токен истёк — очищаем и переходим к новому login flow (loginAsGuest)
      console.log('[AuthService] Guest token expired, starting new guest session');
      localStorage.removeItem('guest_token');
      localStorage.removeItem('token_expires_at');
    }

    // Случай 3: Нет токенов — запускаем login flow
    console.log('[AuthService] No existing session, starting login flow');

    // FIX-006: Устанавливаем interceptor перед login (для новых сессий это безопасно)
    metaServerClient.setOnUnauthorized(() => this.logout());

    const loginSuccess = await this.login();
    if (loginSuccess) {
      this.initialized = true;
    }
    setAuthenticating(false);
    return loginSuccess;
  }

  /**
   * Авторизация через платформу.
   * Автоматически выбирает метод в зависимости от платформы.
   */
  async login(): Promise<boolean> {
    const adapter = platformManager.getAdapter();
    const platformType = adapter.getPlatformType();

    switch (platformType) {
      case 'telegram':
        return this.loginViaTelegram();
      case 'yandex':
      case 'poki':
      case 'crazygames':
      case 'gamedistribution':
        return this.loginViaPlatform(platformType);
      default:
        // Standalone и неизвестные платформы — гостевой режим
        return this.loginAsGuest();
    }
  }

  /**
   * Универсальная авторизация через платформу (Yandex, Poki, CrazyGames, GameDistribution).
   * Вызывает /auth/verify с credentials от адаптера.
   */
  private async loginViaPlatform(platformType: string): Promise<boolean> {
    try {
      setAuthenticating(true);
      setAuthError(null);

      const adapter = platformManager.getAdapter();
      const credentials = await adapter.getCredentials();

      if (!credentials?.platformData) {
        console.warn(`[AuthService] No credentials for ${platformType}, falling back to guest`);
        return this.loginAsGuest();
      }

      console.log(`[AuthService] Logging in via ${platformType}`);

      const response = await metaServerClient.post<PlatformAuthResponse>('/api/v1/auth/verify', {
        platformType: credentials.platformType,
        platformAuthToken: credentials.platformData,
      });

      // SECURITY: localStorage chosen intentionally - see file header comment
      localStorage.setItem('access_token', response.accessToken);
      this.updateCachedJoinToken();
      localStorage.setItem('user_id', response.userId);
      localStorage.setItem('user_nickname', response.profile.nickname);
      localStorage.setItem('is_anonymous', 'false');

      // Очищаем гостевые данные
      this.clearGuestData();

      // Создаём User для UI
      const user = createUser(
        response.userId,
        response.profile.nickname,
        platformType
      );
      const profile = createDefaultProfile();

      // Устанавливаем токен в metaServerClient
      metaServerClient.setToken(response.accessToken);
      setAuthState(user, profile, response.accessToken);

      console.log(`[AuthService] ${platformType} login successful`);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : `Ошибка авторизации ${platformType}`;
      console.error(`[AuthService] ${platformType} login failed:`, message);

      // При ошибке авторизации платформы — fallback на гостевой режим
      console.log(`[AuthService] Falling back to guest login`);
      return this.loginAsGuest();
    } finally {
      setAuthenticating(false);
    }
  }

  /**
   * Создаёт гостевую сессию для Standalone-пользователей.
   *
   * MVP DESIGN NOTE: Никнейм и скин генерируются на клиенте, а не на сервере.
   * Причины:
   * 1. Гостевые данные нужны только для UI до регистрации
   * 2. Сервер не хранит гостевые никнеймы — они временные
   * 3. При регистрации (auth/upgrade) сервер выдаёт настоящий никнейм
   * 4. Упрощает API и снижает нагрузку (меньше запросов к БД)
   *
   * See slime-arena-o4y for potential server-side generation improvements.
   */
  async loginAsGuest(): Promise<boolean> {
    try {
      setAuthenticating(true);
      setAuthError(null);

      console.log('[AuthService] Logging in as guest');

      const response = await metaServerClient.post<GuestAuthResponse>('/api/v1/auth/guest', {});

      // SECURITY: localStorage chosen intentionally - see file header comment
      localStorage.setItem('guest_token', response.guestToken);
      this.updateCachedJoinToken();
      localStorage.setItem('token_expires_at', response.expiresAt);

      // Генерируем локальный никнейм и скин для UI
      const nickname = this.generateGuestNickname();
      const skinId = this.generateGuestSkinId();
      localStorage.setItem('guest_nickname', nickname);
      localStorage.setItem('guest_skin_id', skinId);

      // Создаём локальный User для UI (без полноценной серверной сессии)
      const user = createUser('guest', nickname, platformManager.getPlatformType());
      const profile = createDefaultProfile();

      // Устанавливаем токен в metaServerClient для последующих запросов
      metaServerClient.setToken(response.guestToken);
      setAuthState(user, profile, response.guestToken);

      console.log('[AuthService] Guest login successful');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка гостевой авторизации';
      console.error('[AuthService] Guest login failed:', message);
      setAuthError(message);
      return false;
    } finally {
      // Copilot P1: Всегда сбрасываем флаг authenticating
      setAuthenticating(false);
    }
  }

  /**
   * Авторизация через Telegram (Silent Auth).
   */
  async loginViaTelegram(): Promise<boolean> {
    try {
      setAuthenticating(true);
      setAuthError(null);

      const adapter = platformManager.getAdapter();
      if (adapter.getPlatformType() !== 'telegram') {
        throw new Error('Not running in Telegram');
      }

      const credentials = await adapter.getCredentials();
      if (!credentials?.platformData) {
        throw new Error('No Telegram initData available');
      }

      console.log('[AuthService] Logging in via Telegram');

      const response = await metaServerClient.post<TelegramAuthResponse>('/api/v1/auth/telegram', {
        initData: credentials.platformData,
      });

      // Copilot P1: Очищаем guest данные при успешной Telegram авторизации
      // Иначе isAnonymous() будет возвращать неверное значение
      this.clearGuestData();

      // SECURITY: localStorage chosen intentionally - see file header comment
      // Codex P0: Исправлен контракт — сервер отдаёт userId/profile/isAnonymous, а не user.*
      localStorage.setItem('access_token', response.accessToken);
      this.updateCachedJoinToken();
      localStorage.setItem('user_id', response.userId);
      localStorage.setItem('user_nickname', response.profile.nickname);
      localStorage.setItem('is_anonymous', String(response.isAnonymous));

      // Создаём User для UI
      const user = createUser(
        response.userId,
        response.profile.nickname,
        'telegram'
      );
      const profile = createDefaultProfile();

      // Устанавливаем токен в metaServerClient
      metaServerClient.setToken(response.accessToken);
      setAuthState(user, profile, response.accessToken);

      console.log('[AuthService] Telegram login successful');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Ошибка авторизации Telegram';
      console.error('[AuthService] Telegram login failed:', message);
      setAuthError(message);
      return false;
    } finally {
      // Copilot P1: Всегда сбрасываем флаг authenticating
      setAuthenticating(false);
    }
  }

  /**
   * Дефолтный никнейм для гостя.
   * Случайное игровое имя генерируется в MainMenu через generateRandomName().
   */
  private generateGuestNickname(): string {
    return GUEST_DEFAULT_NICKNAME;
  }

  /**
   * Генерация спрайта для гостя — случайный из SPRITE_NAMES.
   */
  private generateGuestSkinId(): string {
    return SPRITE_NAMES[Math.floor(Math.random() * SPRITE_NAMES.length)];
  }

  /**
   * Очистить гостевые данные из localStorage.
   * Вызывается при успешной авторизации через Telegram или upgrade.
   */
  private clearGuestData(): void {
    localStorage.removeItem('guest_token');
    localStorage.removeItem('guest_nickname');
    localStorage.removeItem('guest_skin_id');
    // FIX-005: Очищаем claim токены при upgrade
    localStorage.removeItem('registration_claim_token');
    localStorage.removeItem('pending_claim_token');
    // Copilot P2: Также очищаем authToken от metaServerClient
    localStorage.removeItem('authToken');
    // slime-arena-yij: Обновляем кэш токена
    this.updateCachedJoinToken();
  }

  /**
   * Выход из аккаунта.
   */
  async logout(): Promise<void> {
    try {
      // Уведомляем сервер (fire and forget)
      await metaServerClient.post('/api/v1/auth/logout', {}).catch(() => {});
    } finally {
      metaServerClient.clearToken();
      // Очищаем все auth-данные из localStorage
      this.clearAllAuthData();
      clearAuthState();
      console.log('[AuthService] Logged out');
    }
  }

  /**
   * Полная очистка всех auth-данных из localStorage.
   * Вызывается при logout для сброса сессии.
   */
  private clearAllAuthData(): void {
    // Registered/Telegram user data
    localStorage.removeItem('access_token');
    localStorage.removeItem('token_expires_at');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_nickname');
    localStorage.removeItem('is_anonymous');
    // Guest data
    localStorage.removeItem('guest_token');
    localStorage.removeItem('guest_nickname');
    localStorage.removeItem('guest_skin_id');
    // FIX-005: Claim токены
    localStorage.removeItem('registration_claim_token');
    localStorage.removeItem('pending_claim_token');
    // metaServerClient token
    localStorage.removeItem('authToken');
    // slime-arena-yij: Обновляем кэш токена
    this.updateCachedJoinToken();
  }

  /**
   * Обновить никнейм.
   */
  async updateNickname(nickname: string): Promise<boolean> {
    try {
      const profileSummary = await metaServerClient.postIdempotent<ProfileSummary>('/api/v1/profile/nickname', {
        nickname,
      });

      // Обновляем состояние
      const token = metaServerClient.getToken();
      if (token && profileSummary) {
        const user = createUser(
          profileSummary.userId,
          profileSummary.nickname,
          platformManager.getPlatformType()
        );
        // FIX-007: Передаём статистику из ProfileSummary
        const profile = createDefaultProfile(profileSummary.level, profileSummary.xp, profileSummary);
        setAuthState(user, profile, token);
      }

      // Для Standalone также сохраняем локально
      const standaloneAdapter = platformManager.getStandaloneAdapter();
      if (standaloneAdapter) {
        standaloneAdapter.setNickname(nickname);
      }

      return true;
    } catch (err) {
      console.error('[AuthService] Failed to update nickname:', err);
      return false;
    }
  }

  /**
   * Получить профиль текущего пользователя.
   */
  async fetchProfile(): Promise<ProfileSummary | null> {
    try {
      return await metaServerClient.get<ProfileSummary>('/api/v1/profile');
    } catch (err) {
      console.error('[AuthService] Failed to fetch profile:', err);
      return null;
    }
  }

  /**
   * Проверить, авторизован ли пользователь.
   */
  isLoggedIn(): boolean {
    return metaServerClient.getToken() !== null;
  }

  /**
   * Получить текущий токен.
   */
  getToken(): string | null {
    return metaServerClient.getToken();
  }

  /**
   * Получить токен для подключения к матчу.
   * Возвращает access_token (для зарегистрированных/Telegram) или guest_token.
   * slime-arena-yij: Используем кэшированный сигнал для оптимизации.
   */
  getJoinToken(): string | null {
    return cachedJoinToken.value;
  }

  /**
   * Проверить, авторизован ли пользователь (есть любой токен).
   */
  isAuthenticated(): boolean {
    return !!this.getJoinToken();
  }

  /**
   * Проверить, является ли пользователь анонимным (гость или анонимный Telegram).
   * Copilot P1: Учитываем приоритет access_token над guest_token
   */
  isAnonymous(): boolean {
    const hasAccessToken = !!localStorage.getItem('access_token');
    const hasGuestToken = !!localStorage.getItem('guest_token');
    const isAnonymousFlag = localStorage.getItem('is_anonymous') === 'true';

    // Если есть access_token, проверяем флаг is_anonymous
    if (hasAccessToken) {
      return isAnonymousFlag;
    }

    // Если только guest_token — пользователь анонимный
    return hasGuestToken;
  }

  /**
   * Получить никнейм пользователя.
   */
  getNickname(): string {
    return localStorage.getItem('user_nickname') || localStorage.getItem('guest_nickname') || 'Игрок';
  }

  /**
   * Получить ID выбранного спрайта.
   */
  getSkinId(): string {
    return localStorage.getItem('selected_skin_id') || localStorage.getItem('guest_skin_id') || SPRITE_NAMES[0];
  }

  /**
   * Получить joinToken для подключения к игровой комнате.
   * joinToken включает guestSubjectId для верификации claim на сервере.
   * @param nickname - Никнейм игрока
   * @returns joinToken или null при ошибке
   */
  async getRoomJoinToken(nickname: string): Promise<string | null> {
    try {
      const skinId = this.getSkinId();
      const response = await metaServerClient.post<{ joinToken: string; expiresIn: number }>(
        '/api/v1/auth/join-token',
        { nickname, skinId }
      );
      console.log('[AuthService] Room join token obtained');
      return response.joinToken;
    } catch (error) {
      console.error('[AuthService] Failed to get room join token:', error);
      return null;
    }
  }

  /**
   * Завершить upgrade гостя в зарегистрированного пользователя.
   * Очищает гостевые данные и обновляет UI состояние.
   * Вызывается из RegistrationPromptModal после успешного /auth/upgrade.
   *
   * FIX-010: Загружаем профиль с сервера для получения актуальных данных
   */
  async finishUpgrade(accessToken: string, nickname?: string): Promise<void> {
    // Сохраняем гостевой скин в selected_skin_id перед очисткой
    // чтобы не потерять выбор пользователя после OAuth upgrade
    const guestSkinId = localStorage.getItem('guest_skin_id');
    if (guestSkinId && !localStorage.getItem('selected_skin_id')) {
      localStorage.setItem('selected_skin_id', guestSkinId);
    }

    // Очищаем гостевые данные
    this.clearGuestData();

    // FIX-009: Сохраняем access_token в localStorage для персистентности
    // БЕЗ этого токен терялся при перезагрузке страницы
    localStorage.setItem('access_token', accessToken);
    this.updateCachedJoinToken();
    localStorage.setItem('is_anonymous', 'false');
    if (nickname) {
      localStorage.setItem('user_nickname', nickname);
    }

    // P1-3: Устанавливаем токен в HTTP-клиент для последующих запросов.
    metaServerClient.setToken(accessToken);

    // FIX-010: Загружаем профиль с сервера для получения актуальных данных
    // (userId, nickname, статистика и т.д.)
    try {
      const profileSummary = await this.fetchProfile();
      if (profileSummary) {
        const user = createUser(
          profileSummary.userId,
          profileSummary.nickname,
          platformManager.getPlatformType()
        );
        const profile = createDefaultProfile(profileSummary.level, profileSummary.xp, profileSummary);
        setAuthState(user, profile, accessToken);
        console.log('[AuthService] Upgrade finished, profile loaded from server');
        return;
      }
    } catch (err) {
      console.warn('[AuthService] Failed to fetch profile after upgrade:', err);
    }

    // Fallback: если fetchProfile не удался, используем переданные данные
    const user = createUser(
      '',
      nickname || this.getNickname(),
      platformManager.getPlatformType()
    );
    const profile = createDefaultProfile();
    setAuthState(user, profile, accessToken);

    console.log('[AuthService] Upgrade finished (fallback), access_token saved to localStorage');
  }
}

// Экземпляр-синглтон
export const authService = new AuthService();
