/**
 * MainScreen — главный экран игры
 *
 * Показывает героя, HUD профиля, валюту и кнопку Arena.
 * На основе макета assets/templates/main.html
 */

import { useEffect, useState } from 'preact/hooks';
import { useComputed } from '@preact/signals';
import { injectStyles } from '../utils/injectStyles';
import { currentUser, currentProfile, openLeaderboard } from '../signals/gameState';
import { GUEST_DEFAULT_NICKNAME } from '@bonk-race/shared';
import { RegistrationPromptModal } from './RegistrationPromptModal';

const STYLES_ID = 'main-screen-styles';

const styles = `
  .main-screen {
    position: fixed;
    inset: 0;
    background-image: url('/backgrounds/bg_main_screen.jpg');
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    overflow: hidden;
    user-select: none;
    z-index: 10;
  }

  /* === HUD PROFILE === */
  .hud-profile-wrapper {
    position: absolute;
    top: 20px;
    left: 20px;
    transform: scale(0.7);
    transform-origin: top left;
    z-index: 20;
  }

  .hud-container {
    position: relative;
    width: 480px;
    height: 160px;
  }

  .hud-base {
    position: absolute;
    left: 25px;
    top: 5px;
    width: 340px;
    z-index: 1;
    filter: drop-shadow(0px 8px 10px rgba(0,0,0,0.4));
  }

  .hud-avatar-group {
    position: absolute;
    left: 0;
    top: 0;
    width: 150px;
    height: 150px;
    z-index: 10;
    cursor: pointer;
    transition: transform 0.2s ease;
  }

  .hud-avatar-group:hover {
    transform: scale(1.08);
  }

  .frame-top {
    position: absolute;
    left: 0;
    top: 0;
    width: 146px;
    z-index: 10;
    filter: drop-shadow(0px 5px 5px rgba(0,0,0,0.3));
    clip-path: polygon(0 0, 100% 0, 100% 50%, 0 50%);
  }

  .hud-avatar-img {
    position: absolute;
    left: 16px;
    top: 12px;
    width: 116px;
    height: 116px;
    z-index: 11;
    border-radius: 50%;
    object-fit: cover;
  }

  .frame-bottom {
    position: absolute;
    left: 0;
    top: 0;
    width: 146px;
    z-index: 12;
    clip-path: polygon(0 50%, 100% 50%, 100% 100%, 0 100%);
  }

  .hud-star-group {
    position: absolute;
    left: 100px;
    top: 75px;
    width: 60px;
    height: 60px;
    z-index: 20;
  }

  .hud-star {
    width: 100%;
    filter: drop-shadow(0 4px 4px rgba(0,0,0,0.3));
  }

  .hud-level-text {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: 'Trebuchet MS', Verdana, 'Segoe UI', sans-serif;
    color: white;
    font-size: 22px;
    font-weight: 700;
    padding-top: 4px;
    text-shadow: 0 2px 3px rgba(0,0,0,0.4);
  }

  .hud-info {
    position: absolute;
    left: 165px;
    top: 24px;
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .hud-name {
    font-family: 'Trebuchet MS', Verdana, 'Segoe UI', sans-serif;
    color: white;
    font-size: 24px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    /* Простая тень для читаемости */
    text-shadow: 0 2px 4px rgba(0,0,0,0.5);
  }

  .medals-row {
    display: flex;
    gap: 8px;
  }

  .medal {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid white;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  }

  .xp-track {
    position: absolute;
    left: 140px;
    top: 114px;
    width: 200px;
    height: 10px;
    z-index: 4;
    background: rgba(0,0,0,0.3);
    border-radius: 6px;
  }

  .xp-fill {
    height: 100%;
    background: linear-gradient(180deg, #96E06C 0%, #43A047 100%);
    border-radius: 6px;
    box-shadow: inset 0 2px 2px rgba(255,255,255,0.5);
    transition: width 0.3s ease;
  }

  .hud-auth-link {
    border: none;
    outline: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.5px;
    color: #fff;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    text-transform: uppercase;
    padding: 10px 28px;
    /* Компенсация gap контейнера .hud-info (flex-column) для визуального выравнивания кнопки между «ГОСТЬ» и прогресс-баром */
    margin-top: -4px;
    min-height: 44px;
    min-width: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(180deg, #81D4FA 0%, #039BE5 50%, #0277BD 100%);
    border-radius: 999px;
    box-shadow: 0 3px 0 #01579B, 0 5px 8px rgba(0,0,0,0.3);
    transition: transform 0.1s, box-shadow 0.1s;
  }

  .hud-auth-link:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 0 #01579B, 0 6px 10px rgba(0,0,0,0.3);
  }

  .hud-auth-link:active {
    transform: translateY(2px);
    box-shadow: 0 1px 0 #01579B, 0 2px 4px rgba(0,0,0,0.3);
  }

  .hud-auth-link:focus-visible {
    outline: 2px solid #81D4FA;
    outline-offset: 2px;
  }

  /* === ВАЛЮТА === */
  .currency-panel {
    position: absolute;
    top: 20px;
    right: 20px;
    display: flex;
    gap: 16px;
    transform: scale(0.85);
    transform-origin: top right;
    z-index: 20;
  }

  .curr-item {
    position: relative;
    background: #4E342E;
    padding: 5px 15px 5px 45px;
    border-radius: 30px;
    height: 40px;
    display: flex;
    align-items: center;
    border: 2px solid #6D4C41;
    box-shadow: 0 6px 10px rgba(0,0,0,0.3);
  }

  .curr-icon-img {
    position: absolute;
    left: -15px;
    top: -8px;
    width: 58px;
    height: 58px;
    z-index: 2;
    filter: drop-shadow(0 4px 5px rgba(0,0,0,0.4));
    transition: transform 0.2s;
  }

  .curr-item:hover .curr-icon-img {
    transform: scale(1.15) rotate(-10deg);
  }

  .curr-val {
    color: #fff;
    font-family: 'Trebuchet MS', Verdana, 'Segoe UI', sans-serif;
    font-size: 18px;
    font-weight: 700;
    text-shadow: 0 1px 3px rgba(0,0,0,0.5);
    margin-right: 5px;
  }

  .btn-add {
    width: 24px;
    height: 24px;
    background: #66BB6A;
    border-radius: 50%;
    color: white;
    font-weight: 800;
    display: flex;
    justify-content: center;
    align-items: center;
    border: 2px solid white;
    cursor: pointer;
    box-shadow: 0 2px 0 rgba(0,0,0,0.2);
    transition: transform 0.1s;
  }

  .btn-add:active {
    transform: scale(0.95);
  }

  /* === ГЕРОЙ === */
  .hero-container {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 350px;
    height: 350px;
    z-index: 10;
    pointer-events: none;
  }

  .hero-model {
    width: 100%;
    height: 100%;
    background-image: url('/skins/lobby/hero_skin_current.webp');
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    animation: floatHero 4s infinite ease-in-out;
    filter: drop-shadow(0 15px 20px rgba(0,0,0,0.4));
  }

  .hero-floor-shadow {
    position: absolute;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    width: 180px;
    height: 20px;
    background: rgba(0,0,0,0.3);
    border-radius: 50%;
    filter: blur(15px);
    animation: shadowScale 4s infinite ease-in-out;
  }

  @keyframes floatHero {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-15px); }
  }

  @keyframes shadowScale {
    0%, 100% { transform: translateX(-50%) scale(1); opacity: 0.3; }
    50% { transform: translateX(-50%) scale(0.8); opacity: 0.2; }
  }

  /* === КНОПКА ARENA (JELLY STYLE) === */
  .arena-btn-wrapper {
    position: absolute;
    bottom: 30px;
    right: 35px;
    z-index: 30;
  }

  .jelly-btn {
    --hue: 355;
    --sat: 90%;
    --lum-main: 50%;

    --c-dark: hsl(var(--hue), var(--sat), 30%);
    --c-border: hsl(var(--hue), var(--sat), 40%);
    --c-surface: hsl(var(--hue), var(--sat), var(--lum-main));
    --c-highlight: hsl(var(--hue), var(--sat), 65%);
    --c-shadow: hsl(var(--hue), var(--sat), 15%);

    position: relative;
    border: none;
    outline: none;
    cursor: pointer;
    background: transparent;
    padding: 0;
    min-width: 220px;
    height: 72px;
    transition: transform 0.1s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .jelly-btn-frame {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, var(--c-highlight), var(--c-dark));
    border-radius: 999px;
    box-shadow: 0 8px 0 var(--c-shadow), 0 15px 20px rgba(0,0,0,0.4);
    transition: box-shadow 0.1s;
  }

  .jelly-btn-content {
    position: absolute;
    inset: 4px;
    background: linear-gradient(180deg, var(--c-highlight) 0%, var(--c-surface) 40%, var(--c-dark) 100%);
    border-radius: 999px;
    display: flex;
    justify-content: center;
    align-items: center;
    box-shadow: inset 0 2px 5px rgba(255,255,255,0.4), inset 0 -3px 5px rgba(0,0,0,0.2);
  }

  .jelly-btn-shine {
    position: absolute;
    top: 6px;
    left: 12px;
    right: 12px;
    height: 40%;
    border-radius: 999px;
    background: linear-gradient(180deg, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.1) 100%);
    filter: blur(0.5px);
    pointer-events: none;
  }

  .jelly-btn-shine::after {
    content: '';
    position: absolute;
    top: 4px;
    right: 10px;
    width: 6px;
    height: 6px;
    background: white;
    border-radius: 50%;
    opacity: 0.6;
    box-shadow: -8px 2px 0 rgba(255,255,255,0.3);
  }

  .jelly-text {
    color: white;
    font-family: 'Trebuchet MS', Verdana, 'Segoe UI', sans-serif;
    font-size: 28px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 2px;
    /* Простая тень для читаемости на ярком фоне */
    text-shadow: 0 2px 4px rgba(0,0,0,0.4);
    z-index: 2;
    position: relative;
    padding-bottom: 4px;
  }

  .jelly-btn:active {
    transform: translateY(6px);
  }

  .jelly-btn:active .jelly-btn-frame {
    box-shadow: 0 2px 0 var(--c-shadow), 0 4px 10px rgba(0,0,0,0.3);
  }

  .jelly-btn:hover {
    filter: brightness(1.1);
  }

  /* === БОКОВОЕ МЕНЮ === */
  .side-menu {
    position: absolute;
    bottom: 30px;
    left: 35px;
    display: flex;
    gap: 16px;
    z-index: 30;
  }

  .menu-btn {
    width: 65px;
    height: 65px;
    background: #FFF8E1;
    border-radius: 18px;
    border: 3px solid #FFD54F;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    box-shadow: 0 5px 0 #FFA000, 0 8px 12px rgba(0,0,0,0.3);
    transition: transform 0.1s, box-shadow 0.1s;
  }

  .menu-btn:active {
    transform: translateY(5px);
    box-shadow: 0 0 0 #FFA000, 0 2px 5px rgba(0,0,0,0.2);
  }

  .menu-icon-img {
    width: 80%;
    height: 80%;
    object-fit: contain;
    filter: drop-shadow(0 2px 2px rgba(0,0,0,0.2));
    transition: transform 0.2s;
  }

  .menu-btn:hover .menu-icon-img {
    transform: scale(1.12);
  }

  /* === ВЕРСИЯ === */
  .version-tag {
    position: absolute;
    bottom: 8px;
    right: 12px;
    font-size: 11px;
    color: rgba(255,255,255,0.4);
    font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    z-index: 5;
  }

  /* === MOBILE LANDSCAPE === */
  @media (max-width: 900px) and (orientation: landscape) {
    .hud-profile-wrapper {
      transform: scale(0.55);
    }

    .currency-panel {
      transform: scale(0.7);
    }

    .hero-container {
      width: 280px;
      height: 280px;
    }

    .arena-btn-wrapper {
      bottom: 15px;
      right: 20px;
    }

    .jelly-btn {
      min-width: 180px;
      height: 60px;
    }

    .jelly-text {
      font-size: 26px;
    }

    .side-menu {
      bottom: 15px;
      left: 20px;
      gap: 10px;
    }

    .menu-btn {
      width: 50px;
      height: 50px;
      border-radius: 14px;
    }
  }

  /* === MOBILE PORTRAIT === */
  @media (max-width: 480px) and (orientation: portrait) {
    .hud-profile-wrapper {
      transform: scale(0.45);
      top: 10px;
      left: 10px;
    }

    .currency-panel {
      transform: scale(0.65);
      top: 10px;
      right: 10px;
      gap: 8px;
    }

    .curr-item {
      padding: 3px 10px 3px 35px;
      height: 32px;
    }

    .curr-icon-img {
      width: 45px;
      height: 45px;
      left: -12px;
      top: -6px;
    }

    .curr-val {
      font-size: 16px;
    }

    .btn-add {
      width: 20px;
      height: 20px;
      font-size: 14px;
    }

    .hero-container {
      width: 250px;
      height: 250px;
      top: 45%;
    }

    .arena-btn-wrapper {
      right: 50%;
      transform: translateX(50%);
      bottom: 100px;
    }

    .jelly-btn {
      min-width: 200px;
      height: 64px;
    }

    .jelly-text {
      font-size: 28px;
    }

    .side-menu {
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      gap: 12px;
    }

    .menu-btn {
      width: 55px;
      height: 55px;
      border-radius: 14px;
    }

    .version-tag {
      bottom: 4px;
      right: 8px;
      font-size: 9px;
    }
  }

  /* === VERY SMALL SCREENS === */
  @media (max-height: 600px) and (orientation: portrait) {
    .hero-container {
      width: 200px;
      height: 200px;
      top: 40%;
    }

    .arena-btn-wrapper {
      bottom: 80px;
    }

    .jelly-btn {
      min-width: 180px;
      height: 56px;
    }

    .jelly-text {
      font-size: 24px;
    }
  }
`;

interface MainScreenProps {
  onArena: () => void;
}

export function MainScreen({ onArena }: MainScreenProps) {
  useEffect(() => {
    injectStyles(STYLES_ID, styles);
  }, []);

  // Данные пользователя из сигналов
  const user = currentUser.value;
  const profile = currentProfile.value;

  // Реактивное вычисление гостевого статуса из сигнала currentUser.
  // При возврате из матча currentUser обновляется, и isGuest пересчитывается автоматически.
  // FIX slime-arena-y2z2: заменили useState(authService.isAnonymous()) на useComputed,
  // чтобы компонент реагировал на изменения currentUser без перемонтирования.
  const isGuest = useComputed(() => {
    const u = currentUser.value;
    if (!u) return true;
    return u.id === 'guest';
  });
  const playerName = isGuest.value ? GUEST_DEFAULT_NICKNAME : (user?.nickname || 'PLAYER');
  const level = profile?.level ?? 1;
  const avatarUrl = profile?.avatarUrl || '/hud/hud_avatar_hero_01.webp';
  const coins = 0; // Валюта пока не реализована
  const gems = 0;

  // XP прогресс (заглушка)
  const xpPercent = profile ? Math.min(100, (profile.xp / 1000) * 100) : 50;

  // Модал авторизации для гостей
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Обработчики заглушек
  const handleAddCoins = () => {
    // Заглушка - ничего не делает
  };

  const handleAddGems = () => {
    // Заглушка - ничего не делает
  };

  const handleSettings = () => {
    // Заглушка - ничего не делает
  };

  const handleLeaderboard = () => {
    openLeaderboard();
  };

  const handleSkins = () => {
    // Заглушка - ничего не делает
  };

  return (
    <div class="main-screen">
      {/* HUD Profile */}
      <div class="hud-profile-wrapper">
        <div class="hud-container">
          <div class="hud-avatar-group">
            <img src="/hud/hud_avatar_frame_cookie.webp" class="frame-top" alt="" />
            <img src={avatarUrl} class="hud-avatar-img" alt="Avatar" />
            <img src="/hud/hud_avatar_frame_cookie.webp" class="frame-bottom" alt="" />
          </div>
          <img src="/hud/hud_profile_base_chocolate.webp" class="hud-base" alt="" />
          <div class="hud-star-group">
            <img src="/hud/hud_level_badge_star_blue.webp" class="hud-star" alt="" />
            <div class="hud-level-text">{level}</div>
          </div>
          <div class="hud-info">
            <div class="hud-name">{playerName}</div>
            {isGuest.value ? (
              <button class="hud-auth-link" onClick={() => setShowAuthModal(true)}>
                Войти
              </button>
            ) : (
              <div class="medals-row">
                <div class="medal" style={{ background: '#FFD700' }} />
                <div class="medal" style={{ background: '#C0C0C0' }} />
                <div class="medal" style={{ background: '#E91E63' }} />
              </div>
            )}
          </div>
          {isGuest.value ? null : (
            <div class="xp-track">
              <div class="xp-fill" style={{ width: `${xpPercent}%` }} />
            </div>
          )}
        </div>
      </div>

      {/* Currency Panel */}
      <div class="currency-panel">
        <div class="curr-item">
          <img src="/icons/icon_currency_coin.webp" class="curr-icon-img" alt="Монеты" />
          <div class="curr-val">{coins.toLocaleString()}</div>
          <button type="button" class="btn-add" onClick={handleAddCoins}>+</button>
        </div>
        <div class="curr-item">
          <img src="/icons/icon_currency_gem.webp" class="curr-icon-img" alt="Кристаллы" />
          <div class="curr-val">{gems}</div>
          <button type="button" class="btn-add" onClick={handleAddGems}>+</button>
        </div>
      </div>

      {/* Hero */}
      <div class="hero-container">
        <div class="hero-floor-shadow" />
        <div class="hero-model" />
      </div>

      {/* Arena Button */}
      <div class="arena-btn-wrapper">
        <button type="button" class="jelly-btn" onClick={onArena}>
          <div class="jelly-btn-frame" />
          <div class="jelly-btn-content">
            <span class="jelly-text">Арена</span>
            <div class="jelly-btn-shine" />
          </div>
        </button>
      </div>

      {/* Side Menu */}
      <div class="side-menu">
        <button type="button" class="menu-btn" title="Настройки" onClick={handleSettings}>
          <img src="/icons/icon_menu_settings.webp" class="menu-icon-img" alt="" />
        </button>
        <button type="button" class="menu-btn" title="Лидеры" onClick={handleLeaderboard}>
          <img src="/icons/icon_menu_leaderboard.webp" class="menu-icon-img" alt="" />
        </button>
        <button type="button" class="menu-btn" title="Гардероб" onClick={handleSkins}>
          <img src="/icons/icon_menu_skins.webp" class="menu-icon-img" alt="" />
        </button>
      </div>

      {/* Version */}
      <div class="version-tag">v{__APP_VERSION__}</div>

      {/* Модал авторизации для гостей */}
      {showAuthModal && (
        <RegistrationPromptModal
          intent="login"
          onClose={() => {
            setShowAuthModal(false);
            // isGuest пересчитывается автоматически через useComputed(currentUser)
          }}
        />
      )}
    </div>
  );
}

export default MainScreen;
