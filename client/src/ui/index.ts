/**
 * UI экспорты — точка входа для всех UI компонентов
 */

// Bridge — главный API для интеграции с игрой
export * from './UIBridge';

// Signals (состояние)
export * from './signals/gameState';

// Data (classes/abilities/rarity removed — slime-specific)

// Screen Manager
export {
  ScreenManager,
  registerScreen,
  registerModal,
  navigateTo,
  goBack,
  showModal,
  hideModal,
  mountScreenManager,
  unmountScreenManager,
} from './screens/ScreenManager';

// Components
export { GameHUD } from './components/GameHUD';
export { ResultsScreen } from './components/ResultsScreen';
export { MainMenu } from './components/MainMenu';
