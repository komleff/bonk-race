/**
 * UIBridge — мост между Canvas игрой и Preact UI
 * Обеспечивает синхронизацию состояния без изменения основного game loop
 */

import { render, Fragment } from 'preact';
import { batch } from '@preact/signals';
import {
  // State
  gamePhase,
  currentScreen,
  activeBoost,
  selectedClassId,
  playerName,
  isConnected,
  isConnecting,
  connectionError,
  hudVisible,
  MAX_ABILITY_SLOTS,
  oauthConflict,
  oauthNicknameConfirm,
  localPlayer,
  showLeaderboard,

  // Actions
  setGamePhase,
  setBootProgress,
  pushScreen,
  updateLocalPlayer,
  updateLeaderboard,
  updateMatchTimer,
  setTalentChoices,
  clearTalentChoices,
  updateAbilityCooldown,
  updateAbilitySlots,
  setMatchResults,
  resetGameState,
  clearPlayerDeadFlag,
  initMobileDetection,
  clearOAuthConflict,
  clearOAuthNicknameConfirm,
  closeLeaderboard,

  // Types
  type GamePhase,
  type PlayerStats,
  type LeaderboardEntry,
  type TalentChoice,
  type MatchTimerState,
  type BoostState,
} from './signals/gameState';

// Components
import { BootScreen } from './components/BootScreen';
import { MainScreen } from './components/MainScreen';
import { GameHUD } from './components/GameHUD';
import { ResultsScreen } from './components/ResultsScreen';
import { MainMenu } from './components/MainMenu';
import { AccountConflictModal } from './components/AccountConflictModal';
import { NicknameConfirmModal } from './components/NicknameConfirmModal';
import { LeaderboardScreen } from './components/LeaderboardScreen';
import { ConnectingScreen } from './components/ConnectingScreen';
import { ShutdownBanner } from './components/ShutdownBanner';

// ========== Типы для колбеков ==========

export interface UICallbacks {
  onArena: () => void; // Из MainScreen в LobbyScreen
  onBack: () => void; // Из LobbyScreen в MainScreen
  onPlay: (name: string, classId: number) => void;
  onSelectTalent: (talentId: string, index: number) => void;
  onBootRetry?: () => void;
  onActivateAbility: (slot: number, pointerId: number) => void;
  onPlayAgain: (classId: number) => void;
  onExit: () => void;
  onCancelMatchmaking?: () => void;
}

// ========== Контейнер UI ==========

let uiContainer: HTMLElement | null = null;
let callbacks: UICallbacks | null = null;
let cleanupMobileDetection: (() => void) | null = null;

function UIRoot() {
  // Кэшируем значения сигналов для предотвращения множественных чтений
  const phase = gamePhase.value;
  const screen = currentScreen.value;
  const connecting = isConnecting.value;
  const conflict = oauthConflict.value;
  const nicknameConfirm = oauthNicknameConfirm.value;
  const player = localPlayer.value;
  const leaderboardVisible = showLeaderboard.value;

  // Обработчики для AccountConflictModal
  const handleConflictSwitch = () => {
    clearOAuthConflict();
    // После успешного переключения перерендерим UI
    renderUI();
  };

  const handleConflictCancel = () => {
    clearOAuthConflict();
    renderUI();
  };

  // P1-4: Обработчики для NicknameConfirmModal
  const handleNicknameConfirm = () => {
    clearOAuthNicknameConfirm();
    renderUI();
  };

  const handleNicknameCancel = () => {
    clearOAuthNicknameConfirm();
    renderUI();
  };

  return (
    <Fragment>
      {/* Boot Screen */}
      {phase === 'boot' && (
        <BootScreen onRetry={callbacks?.onBootRetry} />
      )}

      {/* Connecting Screen (индикатор подключения к серверу) */}
      {phase === 'connecting' && (
        <ConnectingScreen />
      )}

      {/* Main Screen (главный экран с кнопкой Arena) */}
      {phase === 'menu' && screen === 'main-menu' && callbacks && (
        <MainScreen onArena={callbacks.onArena} />
      )}

      {/* Lobby Screen (выбор класса и имени) */}
      {phase === 'menu' && screen === 'lobby' && callbacks && (
        <MainMenu
          onPlay={callbacks.onPlay}
          onBack={callbacks.onBack}
          onCancelMatchmaking={callbacks.onCancelMatchmaking}
          isConnecting={connecting}
        />
      )}

      {/* Game HUD */}
      {(phase === 'playing' || phase === 'waiting') && (
        <GameHUD />
      )}

      {/* Results Screen */}
      {phase === 'results' && callbacks && (
        <ResultsScreen
          onPlayAgain={callbacks.onPlayAgain}
          onExit={callbacks.onExit}
        />
      )}

      {/* OAuth Conflict Modal (409 — аккаунт уже привязан) */}
      {conflict && (
        <AccountConflictModal
          conflict={conflict}
          currentNickname={player?.name}
          currentMass={player?.mass}
          onSwitch={handleConflictSwitch}
          onCancel={handleConflictCancel}
        />
      )}

      {/* P1-4: Nickname Confirm Modal (подтверждение никнейма после OAuth) */}
      {nicknameConfirm && (
        <NicknameConfirmModal
          prepare={nicknameConfirm}
          onConfirm={handleNicknameConfirm}
          onCancel={handleNicknameCancel}
        />
      )}

      {/* Глобальная таблица лидеров */}
      {leaderboardVisible && (
        <LeaderboardScreen onClose={closeLeaderboard} />
      )}

      {/* Баннер перезагрузки сервера (поверх всего) */}
      <ShutdownBanner />
    </Fragment>
  );
}

// ========== Публичный API ==========

/**
 * Инициализация UI системы
 */
export function initUI(container: HTMLElement, cbs: UICallbacks): void {
  uiContainer = container;
  callbacks = cbs;

  // Инициализируем детекцию мобильных и сохраняем cleanup
  cleanupMobileDetection = initMobileDetection();

  // Первый рендер
  renderUI();
}

/**
 * Рендер UI (вызывается при изменении состояния)
 */
export function renderUI(): void {
  if (!uiContainer) return;
  render(<UIRoot />, uiContainer);
}

/**
 * Размонтирование UI
 */
export function destroyUI(): void {
  // Очистка event listeners от mobile detection
  if (cleanupMobileDetection) {
    cleanupMobileDetection();
    cleanupMobileDetection = null;
  }

  if (uiContainer) {
    render(null, uiContainer);
    uiContainer = null;
  }
  callbacks = null;
}

// ========== Синхронизация состояния ==========

/**
 * Обновление состояния игрока из game loop
 * Вызывается из main.ts на каждом HUD-тике (10 Hz)
 */
export function syncPlayerState(stats: PlayerStats | null | undefined): void {
  if (stats == null || typeof stats !== 'object') return;
  updateLocalPlayer(stats);
}

/**
 * Обновление таблицы лидеров
 */
export function syncLeaderboard(entries: LeaderboardEntry[] | null | undefined): void {
  if (!entries || !Array.isArray(entries)) return;
  updateLeaderboard(entries);
}

/**
 * Обновление таймера матча
 */
export function syncMatchTimer(timer: MatchTimerState | null | undefined): void {
  if (!timer) return;
  updateMatchTimer(timer);
}

/**
 * Показать выбор талантов
 */
export function showTalentChoices(
  choices: TalentChoice[] | null | undefined,
  queueSize: number,
  timerSeconds: number
): void {
  if (!choices || !Array.isArray(choices)) return;
  setTalentChoices(choices, queueSize, timerSeconds);
}

/**
 * Скрыть выбор талантов
 */
export function hideTalentChoices(): void {
  clearTalentChoices();
}

/**
 * Обновить кулдаун способности
 */
export function syncAbilityCooldown(slot: number, remaining: number, total: number): void {
  if (typeof slot !== 'number' || slot < 0 || slot >= MAX_ABILITY_SLOTS) return;
  updateAbilityCooldown(slot, remaining, total);
}

/**
 * Обновить слоты способностей (abilityId для каждого слота)
 */
export function syncAbilitySlots(
  slot0: string | null | undefined,
  slot1: string | null | undefined,
  slot2: string | null | undefined
): void {
  updateAbilitySlots(slot0 ?? null, slot1 ?? null, slot2 ?? null);
}

/**
 * Установить активный буст
 */
export function syncBoost(boost: BoostState | null): void {
  activeBoost.value = boost;
}

/**
 * Установить фазу игры
 */
export function setPhase(phase: GamePhase): void {
  setGamePhase(phase);
  // Принудительный перерендер для обновления UI при смене фазы
  renderUI();
}

/**
 * Установить статус подключения
 */
export function setConnected(connected: boolean, error?: string): void {
  batch(() => {
    isConnected.value = connected;
    connectionError.value = error || null;
    isConnecting.value = false;
  });
}

/**
 * Установить статус "подключаемся"
 */
export function setConnecting(connecting: boolean): void {
  isConnecting.value = connecting;
  // Принудительный перерендер для обновления состояния подключения
  renderUI();
}

/**
 * Обновить прогресс загрузки (BootScreen)
 */
export function updateBootProgress(
  stage: 'initializing' | 'authenticating' | 'loadingConfig' | 'ready' | 'error',
  progress: number,
  error?: string
): void {
  setBootProgress(stage, progress, error);
  // Скрыть inline boot screen при переходе в ready или error
  if (stage === 'ready' || stage === 'error') {
    const inlineBoot = document.getElementById('inline-boot');
    if (inlineBoot) inlineBoot.classList.add('hidden');
  }
  renderUI();
}

/**
 * Показать результаты матча
 */
export function showResults(results: {
  winner: string;
  finalLeaderboard: LeaderboardEntry[];
  personalStats: PlayerStats | null;
  nextMatchTimer: number;
}): void {
  setMatchResults(results);
  // Принудительный перерендер для показа результатов
  renderUI();
}

/**
 * Скрыть/показать HUD
 */
export function setHudVisible(visible: boolean): void {
  hudVisible.value = visible;
}

/**
 * Сброс состояния игры
 */
export function resetUI(): void {
  resetGameState();
}

/**
 * Сбросить флаг смерти (при старте нового матча)
 */
export function clearDeadFlag(): void {
  clearPlayerDeadFlag();
}

/**
 * Получить выбранный класс
 */
export function getSelectedClass(): number {
  return selectedClassId.value;
}

/**
 * Получить имя игрока
 */
export function getPlayerName(): string {
  return playerName.value;
}

/**
 * Перейти в лобби (выбор класса)
 */
export function goToLobby(): void {
  pushScreen('lobby');
  renderUI();
}

/**
 * Вернуться на главный экран (MainScreen)
 */
export function goToMainScreen(): void {
  setGamePhase('menu'); // Это автоматически устанавливает currentScreen в 'main-menu'
  renderUI();
}

// ========== Экспорт типов ==========

export type {
  GamePhase,
  PlayerStats,
  LeaderboardEntry,
  TalentChoice,
  MatchTimerState,
  BoostState,
};
