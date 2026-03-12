# Slime Arena — инструкции для Copilot

## Коммуникация

- Язык: только русский.
- Без жаргона и англицизмов (особенно в документах).
- Идентификаторы в коде не переводить: имена файлов, классов, методов, переменных, пакетов — как в репозитории.
- Комментарии в коде — только на русском. Объясняй «почему», а не «что».
- Стиль: кратко, по делу, без вводных слов.

## Картина проекта

- Монорепозиторий: `client/`, `server/`, `shared/` (npm workspaces).
- Сервер (Colyseus) — источник истины: клиент отправляет только `InputCommand`, не отправляет позиции/урон/массу.
- Симуляция фиксированная: 30 тиков/с. Случайность только через `Rng` из [server/src/utils/rng.ts](server/src/utils/rng.ts).

## Запуск и проверки

- Разработка: `npm run dev:server` (ws://localhost:2567) и `npm run dev:client` (http://localhost:5173).
- Сборка: `npm run build` (порядок: shared → server → client).
- Проверка детерминизма: `npm run test` (см. [server/tests/determinism.test.js](server/tests/determinism.test.js)).

## Конфигурация и типы

- Баланс — только в [config/balance.json](config/balance.json). Не «зашивать» числа в код.
- Загрузка баланса: `loadBalanceConfig()` из [server/src/config/loadBalanceConfig.ts](server/src/config/loadBalanceConfig.ts).
- Схема и значения по умолчанию: [shared/src/config.ts](shared/src/config.ts).
- Формулы (логарифмы, радиусы): [shared/src/formulas.ts](shared/src/formulas.ts).
- Флаги состояния — битовая маска: [shared/src/constants.ts](shared/src/constants.ts) (проверка: `(flags & FLAG_X) !== 0`).

## Паттерны симуляции (server)

- Порядок систем в тике фиксирован и важен для детерминизма (см. `onTick()` в [server/src/rooms/ArenaRoom.ts](server/src/rooms/ArenaRoom.ts)). Не менять порядок.
- Перевод времени в тики делать один раз при инициализации (`secondsToTicks()`), а не «на каждом тике».
- Ввод: в `onMessage("input")` отклонять старые `seq`, вектор движения ограничивать и нормализовать; `abilitySlot`/`talentChoice` — одноразовые сигналы на тик.

## Клиент и синхронизация

- Клиент использует буфер снапшотов и интерполяцию (см. [client/src/main.ts](client/src/main.ts)).
- Состояние комнаты задаётся схемой Colyseus: [server/src/rooms/schema/GameState.ts](server/src/rooms/schema/GameState.ts).

## Спрайты

- Спрайты слаймов: [assets/sprites/slimes/SYSTEM.md](assets/sprites/slimes/SYSTEM.md).
- Выбор спрайта по `classId` и состоянию: [shared/src/sprites.ts](shared/src/sprites.ts).

## Роли агентов

Перед работой прочитай [`.agents/AGENT_ROLES.md`](../.agents/AGENT_ROLES.md) — каноничный документ ролей: PM, Architect, Developer, Reviewer.
При написании кода следуй роли Developer. Задачи — только через Beads (`bd ready`, `bd update`).
