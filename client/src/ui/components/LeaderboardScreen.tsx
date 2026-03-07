/**
 * LeaderboardScreen -- глобальная таблица лидеров
 * Показывает топ-100 игроков с двумя вкладками: total и best.
 */

// JSX runtime imported automatically via jsxImportSource
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { injectStyles } from '../utils/injectStyles';
import {
  leaderboardService,
  leaderboardMode,
  leaderboardEntries,
  leaderboardUserEntry,
  leaderboardLoadStatus,
  leaderboardError,
  type LeaderboardMode,
} from '../../services/leaderboardService';
import { RegistrationPromptModal } from './RegistrationPromptModal';
import { matchmakingStatus } from '../signals/gameState';
import { isValidSprite } from '@bonk-race/shared';

/**
 * LB-017: Резервный никнейм.
 * Если nickname пустой или отсутствует, возвращает "Игрок" + последние 4 символа userId.
 */
function getDisplayNickname(nickname?: string, userId?: string): string {
  if (nickname && nickname.trim()) {
    return nickname;
  }
  if (userId && userId.length >= 4) {
    return `Игрок ${userId.slice(-4)}`;
  }
  return 'Игрок';
}

// ========== Типы для гостя ==========

interface GuestEntry {
  nickname: string;
  skinId: string;
  mass: number;
}

/**
 * Декодирует JWT claim token и извлекает данные о матче.
 * Возвращает null при ошибке декодирования.
 */
function decodeClaimToken(token: string): { finalMass?: number; skinId?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return {
      finalMass: payload.finalMass,
      skinId: payload.skinId,
    };
  } catch {
    return null;
  }
}

/**
 * Получает данные гостя из localStorage.
 * Приоритет данных:
 * 1. claimToken.finalMass (если есть registration_claim_token)
 * 2. last_match_mass (fallback)
 */
function getGuestEntry(): GuestEntry | null {
  try {
    const nickname = localStorage.getItem('guest_nickname');
    const skinId = localStorage.getItem('guest_skin_id');
    const claimToken = localStorage.getItem('registration_claim_token');
    const lastMatchMass = localStorage.getItem('last_match_mass');

    // Если нет никнейма — гость не играл
    if (!nickname) {
      return null;
    }

    // Пытаемся получить массу из claimToken
    let mass: number | null = null;
    let skinFromToken: string | null = null;

    if (claimToken) {
      const decoded = decodeClaimToken(claimToken);
      if (decoded) {
        if (decoded.finalMass !== undefined && decoded.finalMass > 0) {
          mass = decoded.finalMass;
        }
        if (decoded.skinId) {
          skinFromToken = decoded.skinId;
        }
      }
    }

    // Fallback на last_match_mass
    if (mass === null && lastMatchMass) {
      const parsed = parseInt(lastMatchMass, 10);
      if (!isNaN(parsed) && parsed > 0) {
        mass = parsed;
      }
    }

    // Если нет массы — гость ещё не играл матч
    if (mass === null) {
      return null;
    }

    return {
      nickname,
      skinId: skinFromToken || skinId || 'default',
      mass,
    };
  } catch {
    return null;
  }
}

// ========== Styles ==========

const styles = `
  .leaderboard-overlay {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(10, 15, 30, 0.95);
    z-index: 1000;
    font-family: "IBM Plex Mono", monospace;
    color: #e6f3ff;
    animation: lbFadeIn 200ms ease-out;
    padding: 20px;
  }

  @keyframes lbFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .leaderboard-container {
    max-width: 500px;
    width: 100%;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    background: linear-gradient(145deg, #1a1a2e, #16213e);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .leaderboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .leaderboard-title {
    font-size: 20px;
    font-weight: 700;
    color: #ffc857;
    margin: 0;
  }

  .leaderboard-close {
    width: 32px;
    height: 32px;
    background: rgba(255, 255, 255, 0.1);
    border: none;
    border-radius: 8px;
    color: #8aa4c8;
    cursor: pointer;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 150ms, color 150ms;
  }

  .leaderboard-close:hover {
    background: rgba(255, 77, 77, 0.2);
    color: #ff6b6b;
  }

  .leaderboard-tabs {
    display: flex;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .leaderboard-tab {
    flex: 1;
    padding: 12px;
    background: transparent;
    border: none;
    color: #8aa4c8;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: color 150ms, background 150ms;
    position: relative;
  }

  .leaderboard-tab:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .leaderboard-tab.active {
    color: #ffc857;
  }

  .leaderboard-tab.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 20%;
    right: 20%;
    height: 2px;
    background: #ffc857;
    border-radius: 1px;
  }

  .leaderboard-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    min-height: 300px;
  }

  .leaderboard-loading,
  .leaderboard-error,
  .leaderboard-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    text-align: center;
    color: #8aa4c8;
    gap: 12px;
  }

  .leaderboard-error {
    color: #ff6b6b;
  }

  .leaderboard-loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 200, 87, 0.2);
    border-top-color: #ffc857;
    border-radius: 50%;
    animation: lbSpin 800ms linear infinite;
  }

  @keyframes lbSpin {
    to { transform: rotate(360deg); }
  }

  .leaderboard-retry {
    padding: 8px 16px;
    background: rgba(255, 77, 77, 0.2);
    border: 1px solid rgba(255, 77, 77, 0.4);
    border-radius: 6px;
    color: #ff6b6b;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    transition: background 150ms;
  }

  .leaderboard-retry:hover {
    background: rgba(255, 77, 77, 0.3);
  }

  .leaderboard-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .leaderboard-entry {
    display: flex;
    align-items: center;
    padding: 10px 12px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
    gap: 12px;
    transition: background 150ms;
  }

  .leaderboard-entry:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .leaderboard-entry.is-user {
    background: rgba(155, 224, 112, 0.1);
    border: 1px solid rgba(155, 224, 112, 0.3);
  }

  .leaderboard-entry.top-1 .leaderboard-place {
    background: linear-gradient(135deg, #ffd700, #ffb300);
    color: #1a1a2e;
  }

  .leaderboard-entry.top-2 .leaderboard-place {
    background: linear-gradient(135deg, #c0c0c0, #9e9e9e);
    color: #1a1a2e;
  }

  .leaderboard-entry.top-3 .leaderboard-place {
    background: linear-gradient(135deg, #cd7f32, #a0522d);
    color: #fff;
  }

  .leaderboard-place {
    width: 32px;
    height: 32px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 14px;
    flex-shrink: 0;
  }

  /* LB-013: Миниатюра скина */
  .leaderboard-skin {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3), inset 0 -2px 4px rgba(0, 0, 0, 0.2);
  }

  .leaderboard-info {
    flex: 1;
    min-width: 0;
  }

  .leaderboard-name {
    font-size: 14px;
    font-weight: 600;
    color: #e6f3ff;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .leaderboard-meta {
    font-size: 11px;
    color: #6b7a94;
    margin-top: 2px;
  }

  .leaderboard-score {
    font-size: 16px;
    font-weight: 700;
    color: #ffc857;
    flex-shrink: 0;
  }

  .leaderboard-user-position {
    padding: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(155, 224, 112, 0.05);
  }

  .leaderboard-user-position .leaderboard-entry {
    background: rgba(155, 224, 112, 0.15);
    border: 1px solid rgba(155, 224, 112, 0.4);
  }

  .leaderboard-user-label {
    font-size: 11px;
    color: #9be070;
    margin-bottom: 8px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Гибридная плашка: sticky сверху */
  .leaderboard-user-badge.position-top {
    position: sticky;
    top: 0;
    z-index: 10;
    margin: 0 0 8px 0;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  /* Гибридная плашка: sticky снизу */
  .leaderboard-user-badge.position-bottom {
    position: sticky;
    bottom: 0;
    z-index: 10;
    margin: 8px 0 0 0;
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
  }

  .leaderboard-user-badge {
    padding: 10px 12px;
    background: rgba(155, 224, 112, 0.15);
    border: 1px solid rgba(155, 224, 112, 0.4);
    border-radius: 8px;
  }

  .leaderboard-user-badge .leaderboard-user-badge-label {
    font-size: 10px;
    color: #9be070;
    margin-bottom: 6px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .leaderboard-user-badge .leaderboard-entry {
    background: transparent;
    padding: 0;
    margin: 0;
    border: none;
  }

  /* Подсветка строки текущего игрока когда плашка скрыта */
  .leaderboard-entry.is-user-highlighted {
    background: rgba(155, 224, 112, 0.2);
    border: 1px solid rgba(155, 224, 112, 0.5);
    animation: userRowPulse 2s ease-in-out infinite;
  }

  @keyframes userRowPulse {
    0%, 100% { background: rgba(155, 224, 112, 0.15); }
    50% { background: rgba(155, 224, 112, 0.25); }
  }

  /* Плашка гостя */
  .leaderboard-guest-badge {
    padding: 10px 12px;
    background: rgba(138, 164, 200, 0.1);
    border: 1px solid rgba(138, 164, 200, 0.3);
    border-radius: 8px;
    position: sticky;
    bottom: 0;
    z-index: 10;
    margin: 8px 0 0 0;
    box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
  }

  .leaderboard-guest-badge .leaderboard-guest-badge-label {
    font-size: 10px;
    color: #8aa4c8;
    margin-bottom: 6px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .leaderboard-guest-badge .leaderboard-entry {
    background: transparent;
    padding: 0;
    margin: 0;
    border: none;
  }

  .leaderboard-guest-badge .leaderboard-place {
    background: rgba(138, 164, 200, 0.2);
    color: #8aa4c8;
    font-size: 11px;
    width: 32px;
    min-width: 32px;
  }

  .leaderboard-guest-badge .leaderboard-score {
    color: #8aa4c8;
  }

  /* Плашка "Сыграйте матч" */
  .leaderboard-guest-empty {
    padding: 16px 12px;
    background: rgba(138, 164, 200, 0.05);
    border: 1px dashed rgba(138, 164, 200, 0.3);
    border-radius: 8px;
    position: sticky;
    bottom: 0;
    z-index: 10;
    margin: 8px 0 0 0;
    text-align: center;
    color: #6b7a94;
    font-size: 13px;
  }

  /* Кнопка "Сохранить прогресс" в плашке гостя */
  .leaderboard-save-progress-btn {
    margin-top: 10px;
    padding: 10px 16px;
    background: linear-gradient(135deg, #9be070, #7ab756);
    border: none;
    border-radius: 8px;
    color: #1a1a2e;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: transform 150ms, box-shadow 150ms;
    width: 100%;
  }

  .leaderboard-save-progress-btn:hover {
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(155, 224, 112, 0.3);
  }

  .leaderboard-save-progress-btn:active {
    transform: scale(0.98);
  }

  /* Mobile */
  @media (max-width: 480px) {
    .leaderboard-container {
      max-height: 95vh;
      border-radius: 12px;
    }

    .leaderboard-header {
      padding: 12px 16px;
    }

    .leaderboard-title {
      font-size: 18px;
    }

    .leaderboard-content {
      padding: 8px;
    }

    .leaderboard-entry {
      padding: 8px 10px;
      gap: 10px;
    }

    .leaderboard-place {
      width: 28px;
      height: 28px;
      font-size: 12px;
    }

    .leaderboard-name {
      font-size: 13px;
    }

    .leaderboard-score {
      font-size: 14px;
    }
  }
`;

const STYLES_ID = 'leaderboard-screen-styles';
injectStyles(STYLES_ID, styles);

// ========== Component ==========

interface LeaderboardScreenProps {
  onClose: () => void;
}

/**
 * Позиция строки игрока относительно видимой области.
 * - visible: строка видна в списке
 * - above: строка выше видимой области (нужна плашка сверху)
 * - below: строка ниже видимой области (нужна плашка снизу)
 * - not-in-list: игрок вне топ-100 (нужна плашка снизу)
 */
type UserRowPosition = 'visible' | 'above' | 'below' | 'not-in-list';

export function LeaderboardScreen({ onClose }: LeaderboardScreenProps) {
  const mode = leaderboardMode.value;
  const entries = leaderboardEntries.value;
  const userEntry = leaderboardUserEntry.value;
  const status = leaderboardLoadStatus.value;
  const error = leaderboardError.value;

  // Состояние позиции строки игрока для гибридной плашки
  const [userRowPosition, setUserRowPosition] = useState<UserRowPosition>('not-in-list');

  // Состояние для модала сохранения прогресса (LB-011)
  const [showSaveProgressModal, setShowSaveProgressModal] = useState(false);

  // Определяем данные гостя (если пользователь не авторизован)
  // Гость: userEntry === null && есть данные в localStorage
  const guestEntry = userEntry === null ? getGuestEntry() : null;
  const isGuest = guestEntry !== null;

  // Рефы для IntersectionObserver
  const contentRef = useRef<HTMLDivElement>(null);
  const userRowRef = useRef<HTMLDivElement>(null);

  // Проверяем, есть ли строка игрока в топ-100
  const userInList = userEntry && entries.find((e) => e.userId === userEntry.userId);

  // Copilot P2: Load leaderboard on mount and when mode changes
  useEffect(() => {
    leaderboardService.fetchLeaderboard(mode);
  }, [mode]);

  // LB-015: Автозакрытие при нахождении матча
  useEffect(() => {
    const mmStatus = matchmakingStatus.value;
    if (mmStatus === 'found' || mmStatus === 'connecting') {
      onClose();
    }
  }, [matchmakingStatus.value, onClose]);

  // IntersectionObserver для отслеживания видимости строки игрока
  useEffect(() => {
    // Если игрок не в списке — всегда показываем плашку снизу
    if (!userInList) {
      setUserRowPosition('not-in-list');
      return;
    }

    const userRow = userRowRef.current;
    const container = contentRef.current;

    if (!userRow || !container) {
      return;
    }

    const observer = new IntersectionObserver(
      (observerEntries) => {
        const entry = observerEntries[0];
        if (!entry) return;

        if (entry.isIntersecting) {
          // Строка видна — скрываем плашку
          setUserRowPosition('visible');
        } else {
          // Строка не видна — определяем положение (выше или ниже)
          const rowRect = entry.boundingClientRect;
          const containerRect = container.getBoundingClientRect();

          if (rowRect.bottom < containerRect.top) {
            // Строка выше видимой области
            setUserRowPosition('above');
          } else {
            // Строка ниже видимой области
            setUserRowPosition('below');
          }
        }
      },
      {
        root: container,
        // threshold 0 — срабатывает когда элемент полностью уходит из виду
        threshold: 0,
        // rootMargin: небольшой отступ для более плавного переключения
        rootMargin: '0px',
      }
    );

    observer.observe(userRow);

    return () => {
      observer.disconnect();
    };
  }, [userInList, entries, status]);

  const handleTabClick = useCallback((newMode: LeaderboardMode) => {
    leaderboardService.switchMode(newMode);
  }, []);

  const handleRetry = useCallback(() => {
    leaderboardService.fetchLeaderboard(mode, true);
  }, [mode]);

  const handleOverlayClick = useCallback((e: MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('leaderboard-overlay')) {
      onClose();
    }
  }, [onClose]);

  const getPlaceClass = (place: number): string => {
    if (place === 1) return 'top-1';
    if (place === 2) return 'top-2';
    if (place === 3) return 'top-3';
    return '';
  };

  return (
    <div class="leaderboard-overlay" onClick={handleOverlayClick}>
      <div class="leaderboard-container">
        <div class="leaderboard-header">
          <h2 class="leaderboard-title">Таблица лидеров</h2>
          <button class="leaderboard-close" onClick={onClose} title="Закрыть">
            X
          </button>
        </div>

        {/* LB-016: Названия вкладок по ТЗ */}
        <div class="leaderboard-tabs">
          <button
            class={`leaderboard-tab ${mode === 'total' ? 'active' : ''}`}
            onClick={() => handleTabClick('total')}
          >
            Накопительный
          </button>
          <button
            class={`leaderboard-tab ${mode === 'best' ? 'active' : ''}`}
            onClick={() => handleTabClick('best')}
          >
            Рекордный
          </button>
        </div>

        <div class="leaderboard-content" ref={contentRef}>
          {status === 'loading' && (
            <div class="leaderboard-loading">
              <div class="leaderboard-loading-spinner" />
              <span>Загрузка...</span>
            </div>
          )}

          {status === 'error' && (
            <div class="leaderboard-error">
              <span>{error || 'Ошибка загрузки'}</span>
              <button class="leaderboard-retry" onClick={handleRetry}>
                Повторить
              </button>
            </div>
          )}

          {status === 'success' && entries.length === 0 && (
            <div class="leaderboard-empty">
              <span>Пока нет данных</span>
            </div>
          )}

          {status === 'success' && entries.length > 0 && (
            <>
              {/* Гибридная плашка сверху — когда строка игрока выше видимой области */}
              {userEntry && userRowPosition === 'above' && (
                <div class="leaderboard-user-badge position-top">
                  <div class="leaderboard-user-badge-label">Ваша позиция</div>
                  <div class="leaderboard-entry">
                    <div class="leaderboard-place">{userEntry.place}</div>
                    <div class="leaderboard-info">
                      <div class="leaderboard-name">{getDisplayNickname(userEntry.nickname, userEntry.userId)}</div>
                      {userEntry.gamesPlayed !== undefined && (
                        <div class="leaderboard-meta">
                          {userEntry.gamesPlayed} игр | Ур. {userEntry.level ?? 1}
                        </div>
                      )}
                    </div>
                    <div class="leaderboard-score">{Math.floor(userEntry.score).toLocaleString()}</div>
                  </div>
                </div>
              )}

              <div class="leaderboard-list">
                {entries.map((entry) => {
                  const isUser = userEntry && entry.userId === userEntry.userId;
                  // Подсветка строки когда она видна и плашка скрыта
                  const isHighlighted = isUser && userRowPosition === 'visible';

                  return (
                    <div
                      key={entry.userId}
                      ref={isUser ? userRowRef : undefined}
                      data-user-id={entry.userId}
                      class={`leaderboard-entry ${getPlaceClass(entry.place)} ${
                        isUser ? 'is-user' : ''
                      } ${isHighlighted ? 'is-user-highlighted' : ''}`}
                    >
                      <div class="leaderboard-place">{entry.place}</div>
                      {/* LB-013: Миниатюра скина — спрайт или slime-base.webp как fallback */}
                      <img
                        class="leaderboard-skin"
                        src={`${import.meta.env.BASE_URL ?? '/'}sprites/slimes/base/${
                          (entry.skinId && isValidSprite(entry.skinId)) ? entry.skinId : 'slime-base.webp'
                        }`}
                        alt={entry.skinId || 'slime-base.webp'}
                        loading="lazy"
                      />
                      <div class="leaderboard-info">
                        <div class="leaderboard-name">{getDisplayNickname(entry.nickname, entry.userId)}</div>
                        {entry.gamesPlayed !== undefined && (
                          <div class="leaderboard-meta">
                            {entry.gamesPlayed} игр | Ур. {entry.level ?? 1}
                          </div>
                        )}
                      </div>
                      <div class="leaderboard-score">{Math.floor(entry.score).toLocaleString()}</div>
                    </div>
                  );
                })}
              </div>

              {/* Гибридная плашка снизу — когда строка ниже видимой области или игрок вне топ-100 */}
              {userEntry && (userRowPosition === 'below' || userRowPosition === 'not-in-list') && (
                <div class="leaderboard-user-badge position-bottom">
                  <div class="leaderboard-user-badge-label">Ваша позиция</div>
                  <div class="leaderboard-entry">
                    <div class="leaderboard-place">{userEntry.place}</div>
                    <div class="leaderboard-info">
                      <div class="leaderboard-name">{getDisplayNickname(userEntry.nickname, userEntry.userId)}</div>
                      {userEntry.gamesPlayed !== undefined && (
                        <div class="leaderboard-meta">
                          {userEntry.gamesPlayed} игр | Ур. {userEntry.level ?? 1}
                        </div>
                      )}
                    </div>
                    <div class="leaderboard-score">{Math.floor(userEntry.score).toLocaleString()}</div>
                  </div>
                </div>
              )}

              {/* Плашка гостя Standalone — когда нет userEntry, но есть данные в localStorage */}
              {isGuest && guestEntry && (
                <div class="leaderboard-guest-badge">
                  <div class="leaderboard-guest-badge-label">Вы (гость)</div>
                  <div class="leaderboard-entry">
                    <div class="leaderboard-place">—</div>
                    <div class="leaderboard-info">
                      <div class="leaderboard-name">{guestEntry.nickname}</div>
                      <div class="leaderboard-meta">Не в рейтинге</div>
                    </div>
                    <div class="leaderboard-score">{Math.floor(guestEntry.mass).toLocaleString()}</div>
                  </div>
                  <button
                    class="leaderboard-save-progress-btn"
                    onClick={() => setShowSaveProgressModal(true)}
                  >
                    Сохранить прогресс
                  </button>
                </div>
              )}

              {/* Плашка для гостя без данных — предложение сыграть матч */}
              {!userEntry && !isGuest && (
                <div class="leaderboard-guest-empty">
                  Сыграйте матч, чтобы попасть в рейтинг
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Модал сохранения прогресса (LB-011) */}
      {showSaveProgressModal && (
        <RegistrationPromptModal onClose={() => setShowSaveProgressModal(false)} />
      )}
    </div>
  );
}

export default LeaderboardScreen;
