/**
 * Глобальное состояние игры через Preact Signals
 * Обеспечивает реактивные обновления UI без лишних рендеров
 */

import { signal, computed, batch } from '@preact/signals';
import { FLAG_IS_DEAD, DEFAULT_BALANCE_CONFIG } from '@bonk-race/shared';
import type { OAuthConflictResponse, OAuthPrepareResponse } from '../../oauth/types';

// ========== Типы ==========

export type GamePhase = 'boot' | 'menu' | 'connecting' | 'waiting' | 'playing' | 'results';

// Состояние загрузки (для BootScreen)
export type BootStage = 'initializing' | 'authenticating' | 'loadingConfig' | 'ready' | 'error';

export interface BootState {
  stage: BootStage;
  progress: number; // 0-100
  error?: string;
}
export type ScreenType = 'main-menu' | 'lobby' | 'game' | 'results' | 'settings' | 'shop' | 'profile';
export type ModalType = 'talent' | 'pause' | 'confirm-exit' | 'settings';

export interface PlayerStats {
  name: string;
  mass: number;
  kills: number;
  maxMass: number;
  level: number;
  xp: number;
  classId: number;
  flags: number;
}

export interface LeaderboardEntry {
  name: string;
  mass: number;
  kills: number;
  isLocal: boolean;
  place: number;
  classId?: number;
}

export interface TalentChoice {
  id: string;
  name: string;
  icon: string;
  description: string;
  rarity: number;
}

export interface AbilityCooldown {
  slot: number;
  remaining: number;
  total: number;
  ready: boolean;
}

export interface MatchTimerState {
  phase: string;
  timeLeft: number;
  totalTime: number;
}

export interface BoostState {
  active: boolean;
  type: string;
  icon: string;
  color: string;
  timeLeft: number;
  isChargeBased?: boolean; // true для guard/greed (заряды вместо секунд)
}

// ========== Auth типы ==========

export interface User {
  id: string;
  platformType: string;
  platformId: string;
  nickname: string;
  createdAt: string;
}

export interface Profile {
  rating: number;
  ratingDeviation: number;
  gamesPlayed: number;
  gamesWon: number;
  totalKills: number;
  highestMass: number;
  level: number;
  xp: number;
  avatarUrl?: string;
}

export interface MatchAssignment {
  matchId: string;
  roomId: string;
  roomHost: string;
  roomPort: number;
  joinToken: string;
}

export type MatchmakingStatus = 'idle' | 'searching' | 'found' | 'connecting' | 'error';

// ========== Сигналы состояния ==========

// Фаза игры
export const gamePhase = signal<GamePhase>('boot');

// Состояние загрузки
export const bootState = signal<BootState>({
  stage: 'initializing',
  progress: 0,
});

// Текущий экран и модальное окно
export const currentScreen = signal<ScreenType>('main-menu');
export const activeModal = signal<ModalType | null>(null);
export const screenStack = signal<ScreenType[]>(['main-menu']);

// Подключение
export const isConnected = signal(false);
export const isConnecting = signal(false);
export const connectionError = signal<string | null>(null);
export const serverUrl = signal('');

// slime-arena-yij: Кэшированный joinToken для оптимизации
// Инициализируется при загрузке из localStorage, обновляется через AuthService
export const cachedJoinToken = signal<string | null>(
  localStorage.getItem('access_token') || localStorage.getItem('guest_token')
);

// Ожидание арены (когда подключились к арене в фазе Results)
// Если > 0, показываем сообщение "Арена не готова" с таймером
export const arenaWaitTime = signal(0);

// Константы
export const MAX_ABILITY_SLOTS = 3;

// Игрок
export const localPlayer = signal<PlayerStats | null>(null);
export const selectedClassId = signal(-1); // -1 = класс не выбран
export const playerName = signal('');

// Матч
export const matchTimer = signal<MatchTimerState>({ phase: '', timeLeft: 0, totalTime: 0 });
export const leaderboard = signal<LeaderboardEntry[]>([]);
export const playerCount = signal(0);

// Таланты
export const talentChoices = signal<TalentChoice[]>([]);
export const talentQueueSize = signal(0);
export const talentTimerSeconds = signal(0);
export const showTalentModal = signal(false);

// Способности
export const abilityCooldowns = signal<AbilityCooldown[]>([
  { slot: 0, remaining: 0, total: 0, ready: true },
  { slot: 1, remaining: 0, total: 0, ready: true },
  { slot: 2, remaining: 0, total: 0, ready: true },
]);

/**
 * Слоты умений игрока (abilityId для каждого слота).
 * null означает, что слот пуст.
 */
export interface AbilitySlots {
  slot0: string | null;
  slot1: string | null;
  slot2: string | null;
}

export const abilitySlots = signal<AbilitySlots>({
  slot0: null,
  slot1: null,
  slot2: null,
});

// Буст
export const activeBoost = signal<BoostState | null>(null);

// Результаты матча
export const matchResults = signal<{
  winner: string;
  finalLeaderboard: LeaderboardEntry[];
  personalStats: PlayerStats | null;
  nextMatchTimer: number;
} | null>(null);

// ID текущей комнаты (Colyseus room.id, используется как fallback)
export const currentRoomId = signal<string | null>(null);

// Codex P1: UUID матча из серверного состояния (state.matchId)
// Используется для /match-results/claim вместо roomId
export const currentMatchId = signal<string | null>(null);

// Таймер ожидания на экране результатов (клиентский, не серверный)
// Когда 0 — можно нажать "Играть ещё"
export const resultsWaitTime = signal<number>(0);

// Timestamp (ms) перезагрузки сервера. 0 = нет перезагрузки.
export const shutdownAt = signal<number>(0);

// UI состояние
export const hudVisible = signal(true);
export const isMobile = signal(false);
export const safeAreaInsets = signal({ top: 0, bottom: 0, left: 0, right: 0 });

// Пороги уровней для HUD (прогресс-бар)
// [minSlimeMass, порог_lvl2, порог_lvl3, ...] = [50, 180, 300, ...]
// 50 — масса смерти ("ноль" для прогресса)
// 100 — стартовая масса, уровень 1 (НЕ в массиве, это initialMass)
// 180 — порог уровня 2, и т.д.
export const levelThresholds = signal<number[]>([
  DEFAULT_BALANCE_CONFIG.physics.minSlimeMass,
  ...DEFAULT_BALANCE_CONFIG.slime.levelThresholds
]);

// Минимальная масса слайма (масса смерти, "ноль" для расчёта прогресса)
export const minSlimeMass = signal<number>(DEFAULT_BALANCE_CONFIG.physics.minSlimeMass);

// ========== Auth состояние ==========

export const authToken = signal<string | null>(null);
export const currentUser = signal<User | null>(null);
export const currentProfile = signal<Profile | null>(null);
export const isAuthenticated = signal(false);
export const isAuthenticating = signal(false);
export const authError = signal<string | null>(null);

// OAuth conflict — данные для показа AccountConflictModal
export const oauthConflict = signal<OAuthConflictResponse | null>(null);

// P1-4: OAuth nickname confirm — данные для показа NicknameConfirmModal
export const oauthNicknameConfirm = signal<OAuthPrepareResponse | null>(null);

// Глобальная таблица лидеров
export const showLeaderboard = signal<boolean>(false);

// ========== Matchmaking состояние ==========

export const matchmakingStatus = signal<MatchmakingStatus>('idle');
export const queuePosition = signal<number | null>(null);
export const matchAssignment = signal<MatchAssignment | null>(null);
export const matchmakingError = signal<string | null>(null);

// ========== Вычисляемые значения ==========

export const isInGame = computed(() => 
  gamePhase.value === 'playing' || gamePhase.value === 'waiting'
);

export const showHud = computed(() => 
  isInGame.value && hudVisible.value && localPlayer.value !== null
);

export const isPlayerDead = computed(() => {
  const player = localPlayer.value;
  if (!player) return false;
  return (player.flags & FLAG_IS_DEAD) !== 0;
});

export const hasTalentPending = computed(() =>
  talentChoices.value.length > 0 && talentQueueSize.value > 0
);

export const isMatchmaking = computed(() =>
  matchmakingStatus.value === 'searching' || matchmakingStatus.value === 'found'
);

export const canStartGame = computed(() =>
  isAuthenticated.value && matchmakingStatus.value === 'idle'
);

export const currentPlace = computed(() => {
  const player = localPlayer.value;
  if (!player) return 0;
  const entry = leaderboard.value.find(e => e.isLocal);
  return entry?.place ?? 0;
});

// ========== Действия ==========

// Максимальный достигнутый прогресс загрузки (не откатывается назад)
let maxBootProgress = 0;

export function setBootProgress(stage: BootStage, progress: number, error?: string) {
  // Прогресс может только расти, не откатываться
  maxBootProgress = Math.max(maxBootProgress, progress);
  bootState.value = { stage, progress: maxBootProgress, error };
}

export function resetBootProgress() {
  maxBootProgress = 0;
  bootState.value = { stage: 'initializing', progress: 0, error: undefined };
}

export function setGamePhase(phase: GamePhase) {
  batch(() => {
    gamePhase.value = phase;

    // Автоматически переключаем экраны при смене фазы
    switch (phase) {
      case 'boot':
        // BootScreen не использует currentScreen
        break;
      case 'menu':
        currentScreen.value = 'main-menu';
        screenStack.value = ['main-menu'];
        break;
      case 'connecting':
      case 'waiting':
        currentScreen.value = 'lobby';
        break;
      case 'playing':
        currentScreen.value = 'game';
        break;
      case 'results':
        currentScreen.value = 'results';
        break;
    }
  });
}

export function pushScreen(screen: ScreenType) {
  const stack = [...screenStack.value];
  if (stack[stack.length - 1] !== screen) {
    stack.push(screen);
    screenStack.value = stack;
    currentScreen.value = screen;
  }
}

export function popScreen(): ScreenType | null {
  const stack = [...screenStack.value];
  if (stack.length > 1) {
    stack.pop();
    screenStack.value = stack;
    currentScreen.value = stack[stack.length - 1];
    return currentScreen.value;
  }
  return null;
}

export function openModal(modal: ModalType) {
  activeModal.value = modal;
}

export function closeModal() {
  activeModal.value = null;
}

export function updateLocalPlayer(stats: Partial<PlayerStats>) {
  const current = localPlayer.value;
  if (current) {
    localPlayer.value = { ...current, ...stats };
  } else {
    localPlayer.value = {
      name: '',
      mass: 100,
      kills: 0,
      maxMass: 100,
      level: 1,
      xp: 0,
      classId: 0,
      flags: 0,
      ...stats,
    };
  }
}

export function updateLeaderboard(entries: LeaderboardEntry[]) {
  leaderboard.value = entries;
}

export function updateMatchTimer(timer: MatchTimerState) {
  matchTimer.value = timer;
}

export function setTalentChoices(choices: TalentChoice[], queueSize: number, timerSeconds: number) {
  batch(() => {
    talentChoices.value = choices;
    talentQueueSize.value = queueSize;
    talentTimerSeconds.value = timerSeconds;
    showTalentModal.value = choices.length > 0;
  });
}

export function clearTalentChoices() {
  batch(() => {
    talentChoices.value = [];
    talentQueueSize.value = 0;
    talentTimerSeconds.value = 0;
    showTalentModal.value = false;
  });
}

export function updateAbilityCooldown(slot: number, remaining: number, total: number) {
  const cooldowns = [...abilityCooldowns.value];
  const idx = cooldowns.findIndex(c => c.slot === slot);
  if (idx !== -1) {
    cooldowns[idx] = { slot, remaining, total, ready: remaining <= 0 };
    abilityCooldowns.value = cooldowns;
  }
}

export function updateAbilitySlots(slot0: string | null, slot1: string | null, slot2: string | null) {
  abilitySlots.value = { slot0, slot1, slot2 };
}

export function setMatchResults(results: typeof matchResults.value) {
  matchResults.value = results;
  if (results) {
    setGamePhase('results');
  }
}

/**
 * Установить таймер ожидания на экране результатов (в секундах)
 */
export function setResultsWaitTime(seconds: number) {
  resultsWaitTime.value = seconds;
}

/**
 * Установить таймер ожидания арены (когда подключились к завершённой арене)
 */
export function setArenaWaitTime(seconds: number) {
  arenaWaitTime.value = seconds;
}

export function resetGameState() {
  batch(() => {
    gamePhase.value = 'menu';
    currentScreen.value = 'main-menu';
    screenStack.value = ['main-menu'];
    activeModal.value = null;
    localPlayer.value = null;
    matchTimer.value = { phase: '', timeLeft: 0, totalTime: 0 };
    leaderboard.value = [];
    talentChoices.value = [];
    talentQueueSize.value = 0;
    abilityCooldowns.value = [
      { slot: 0, remaining: 0, total: 0, ready: true },
      { slot: 1, remaining: 0, total: 0, ready: true },
      { slot: 2, remaining: 0, total: 0, ready: true },
    ];
    abilitySlots.value = { slot0: null, slot1: null, slot2: null };
    activeBoost.value = null;
    matchResults.value = null;
    resultsWaitTime.value = 0; // Сброс таймера результатов
    arenaWaitTime.value = 0; // Сброс таймера ожидания арены
    // НЕ сбрасываем shutdownAt — перезагрузка серверное событие, живёт дольше матча
    // Сбрасываем matchmaking, но НЕ auth
    matchmakingStatus.value = 'idle';
    queuePosition.value = null;
    matchAssignment.value = null;
    matchmakingError.value = null;
  });
}

/**
 * Сбросить флаг смерти игрока (при старте нового матча)
 */
export function clearPlayerDeadFlag() {
  if (localPlayer.value) {
    localPlayer.value = {
      ...localPlayer.value,
      flags: localPlayer.value.flags & ~FLAG_IS_DEAD,
    };
  }
}

// ========== Auth действия ==========

export function setAuthState(user: User, profile: Profile, token: string) {
  batch(() => {
    currentUser.value = user;
    currentProfile.value = profile;
    authToken.value = token;
    isAuthenticated.value = true;
    isAuthenticating.value = false;
    authError.value = null;
    // Устанавливаем имя игрока из профиля
    playerName.value = user.nickname;
  });
}

export function clearAuthState() {
  batch(() => {
    currentUser.value = null;
    currentProfile.value = null;
    authToken.value = null;
    isAuthenticated.value = false;
    isAuthenticating.value = false;
    authError.value = null;
    oauthConflict.value = null;
  });
}

/**
 * Установить данные OAuth конфликта (для показа AccountConflictModal)
 */
export function setOAuthConflict(conflict: OAuthConflictResponse | null) {
  oauthConflict.value = conflict;
}

/**
 * Очистить OAuth конфликт
 */
export function clearOAuthConflict() {
  oauthConflict.value = null;
}

/**
 * P1-4: Установить данные для подтверждения никнейма (показ NicknameConfirmModal)
 */
export function setOAuthNicknameConfirm(prepare: OAuthPrepareResponse | null) {
  oauthNicknameConfirm.value = prepare;
}

/**
 * P1-4: Очистить данные подтверждения никнейма
 */
export function clearOAuthNicknameConfirm() {
  oauthNicknameConfirm.value = null;
}

/**
 * Открыть глобальную таблицу лидеров
 */
export function openLeaderboard() {
  showLeaderboard.value = true;
}

/**
 * Закрыть глобальную таблицу лидеров
 */
export function closeLeaderboard() {
  showLeaderboard.value = false;
}

export function setAuthError(error: string | null) {
  batch(() => {
    authError.value = error;
    if (error !== null) {
      isAuthenticating.value = false;
    }
  });
}

export function setAuthenticating(value: boolean) {
  isAuthenticating.value = value;
}

// ========== Matchmaking действия ==========

export function setMatchmakingSearching() {
  batch(() => {
    matchmakingStatus.value = 'searching';
    queuePosition.value = null;
    matchAssignment.value = null;
    matchmakingError.value = null;
  });
}

export function setMatchmakingPosition(position: number) {
  queuePosition.value = position;
}

export function setMatchFound(assignment: MatchAssignment) {
  batch(() => {
    matchmakingStatus.value = 'found';
    matchAssignment.value = assignment;
  });
}

export function setMatchmakingConnecting() {
  matchmakingStatus.value = 'connecting';
}

export function setMatchmakingError(error: string) {
  batch(() => {
    matchmakingStatus.value = 'error';
    matchmakingError.value = error;
  });
}

export function resetMatchmaking() {
  batch(() => {
    matchmakingStatus.value = 'idle';
    queuePosition.value = null;
    matchAssignment.value = null;
    matchmakingError.value = null;
  });
}

// ========== Конфигурация баланса ==========

/**
 * Обновить пороги уровней из runtime конфигурации.
 * Вызывается из main.ts при получении balanceConfig с сервера.
 *
 * @param thresholds - массив порогов массы для уровней 2, 3, 4, ...
 * @param minMass - минимальная масса слайма (начало уровня 1)
 *
 * Merge: сохраняем переданные пороги и дополняем недостающие из дефолтов.
 * Это обеспечивает согласованность client/server при коротком массиве.
 */
export function setLevelThresholds(thresholds: number[], minMass?: number) {
  const defaults = DEFAULT_BALANCE_CONFIG.slime.levelThresholds;
  // Merge: используем переданные значения, дополняем из defaults
  // Если thresholds длиннее defaults - сохраняем все значения из thresholds
  const merged = thresholds.length >= defaults.length
    ? thresholds
    : [...thresholds, ...defaults.slice(thresholds.length)];
  // Используем minMass из параметра или из дефолтов
  const startMass = minMass ?? DEFAULT_BALANCE_CONFIG.physics.minSlimeMass;
  minSlimeMass.value = startMass;
  // [minSlimeMass, порог_lvl2, порог_lvl3, ...] = [50, 180, 300, ...]
  levelThresholds.value = [startMass, ...merged];
}

// ========== Инициализация ==========

/**
 * Инициализирует детекцию мобильного устройства и safe area.
 * @returns Функция очистки для удаления event listeners
 */
export function initMobileDetection(): () => void {
  const mediaQuery = window.matchMedia('(pointer: coarse)');

  const checkMobile = () => {
    isMobile.value = mediaQuery.matches;
  };

  checkMobile();
  mediaQuery.addEventListener('change', checkMobile);

  // Safe area insets через visualViewport API
  const updateSafeArea = () => {
    const viewport = window.visualViewport;
    if (viewport) {
      const dpr = window.devicePixelRatio || 1;
      const top = viewport.offsetTop;
      const left = viewport.offsetLeft;
      const rightDiff = window.innerWidth - viewport.width - viewport.offsetLeft;
      const bottomDiff = window.innerHeight - viewport.height - viewport.offsetTop;
      const right = Math.max(0, Math.round(rightDiff * dpr) / dpr);
      const bottom = Math.max(0, Math.round(bottomDiff * dpr) / dpr);
      safeAreaInsets.value = { top, bottom, left, right };
    } else {
      safeAreaInsets.value = { top: 0, bottom: 0, left: 0, right: 0 };
    }
  };

  updateSafeArea();
  window.addEventListener('resize', updateSafeArea);

  // Возвращаем cleanup функцию
  return () => {
    mediaQuery.removeEventListener('change', checkMobile);
    window.removeEventListener('resize', updateSafeArea);
  };
}
