# BonkRace

> **AI-Native Development Experiment**
>
> Этот проект создаётся **полностью силами ИИ** под управлением человека-оператора. Форк [SlimeArena](https://github.com/komleff/slime-arena) с другой игровой механикой — гоночный time-trial вместо арены.
>
> **ИИ отвечает за:** аналитику, гейм-дизайн, архитектуру, код, ревью, тесты, деплой.
>
> **Методология:** Beads (трекер задач), Memory Bank (контекст), Agent Roles (PM, Architect, Developer, Reviewer).

Браузерная гоночная игра (time-trial). Игрок управляет блобом по трассе, собирает монетки, обходит препятствия, соревнуется с ghost-записями других игроков.

## Архитектура

В отличие от SlimeArena (серверная физика через Colyseus), BonkRace использует **клиентскую физику** (GDD §10.1). Сервер принимает результаты через REST API.

| Компонент | Назначение | Порт |
|-----------|-----------|------|
| Client (Vite + Preact + Canvas) | Физика, рендеринг, управление | :5173 |
| Meta-server (Express) | Tracks API, runs, ghosts, auth | :3000 |
| PostgreSQL | Пользователи, лидерборды, ghost-replays | :5432 |
| Redis | Кэш, сессии | :6379 |

## Ключевые механики

- **Wall-thrust** — при скольжении о стену блоб получает ускорение вдоль неё
- **Поверхности** — Ice (минимальное трение), Mud (повышенное трение + замедление), Turbo (ускорение в направлении движения)
- **Пикапы** — Nitro (рывок), Teleport (shortcut)
- **Ghost-система** — replay предыдущей попытки отображается полупрозрачно
- **Трасса дня** — seed-based, одна для всех игроков
- **Медали** — Bronze / Silver / Gold / Author по времени финиша

## BonkLab — Physics Sandbox

Dev-only инструмент для настройки физики движения. Отдельная страница `/lab`, ~50 параметров в реальном времени.

**Возможности:**
- 60Hz Newtonian physics (F=ma, semi-implicit Euler, Flight Assist)
- Canvas 2D renderer: камера, векторы сил, минимап
- TelemetryHUD: скорость, масса, FA-состояние, зона, дистанция, прогресс
- 13 групп параметров: геометрия, тяга, лимиты, FA, зоны, орбы
- 6 пресетов: Ультралёгкий, Лёгкий и быстрый, Slime Arena, Тяжёлый, Минимальный FA, Космос
- Орбы — баллистические объекты, столкновения со всем, spike kill
- Настраиваемая геометрия трассы (радиусы столбов, шипов, проходов)
- Export/Import JSON, seed control, density slider
- Финиш с рекордами и таймером

```bash
npm run dev:client    # http://localhost:5173/lab
```

Подробнее: [docs/BonkLab-Guide.md](docs/BonkLab-Guide.md)

## Технологический стек

- **Frontend**: Preact, Signals, HTML5 Canvas, Vite
- **Backend**: Node.js, Express (meta-server)
- **Shared**: TypeScript (типы, физика, RNG)
- **Инфраструктура**: Docker, GitHub Actions, PostgreSQL, Redis

## Структура проекта

- [client/](client/) — Веб-клиент (Vite + Preact + Canvas)
  - [client/src/lab/](client/src/lab/) — BonkLab physics sandbox
- [server/](server/) — Meta-server (Express REST API)
- [shared/](shared/) — Общие типы, TrackConfig, RNG, physics
- [config/](config/) — Конфигурационные файлы
- [admin-dashboard/](admin-dashboard/) — Админ-панель (Preact)
- [docs/](docs/) — Документация, GDD, планы
- [.agents/](.agents/) — Роли ИИ-агентов
- [.memory_bank/](.memory_bank/) — База знаний для ИИ-ассистентов

## Быстрый старт

### Установка

```bash
npm install
```

### Разработка

```bash
# Терминал 1: Meta-server (требует PostgreSQL + Redis)
cd server && npx ts-node-dev -r tsconfig-paths/register src/meta/server.ts

# Терминал 2: Клиент
npm run dev:client    # http://localhost:5173

# BonkLab (physics sandbox)
# http://localhost:5173/lab
```

### Сборка

```bash
npm run build    # shared -> server -> client -> admin
```

### База данных

BonkRace использует PostgreSQL и Redis. Для локальной разработки можно использовать Docker-контейнеры SlimeArena или поднять свои:

```bash
# Вариант: использовать существующий slime-pg контейнер
docker exec -i slime-pg psql -U bonk -d postgres -c "CREATE DATABASE bonk_race OWNER bonk;"
```

Миграции 001-013 применяются автоматически при старте meta-server.

### Тестирование

```bash
npm run test    # determinism + orb-bite + arena-generation + tracks smoke
```

## API

| Endpoint | Метод | Описание |
|----------|-------|---------|
| `/api/v1/tracks/today` | GET | Трасса дня |
| `/api/v1/tracks/list` | GET | Список всех трасс |
| `/api/v1/tracks/:id` | GET | Конкретная трасса по ID |
| `/api/v1/runs/submit` | POST | Отправка результата |
| `/api/v1/ghosts` | GET | Ghost-replay данные |

## Docker

| Контейнер | Содержание | Порты |
|-----------|-----------|-------|
| `bonk-race-app` | Meta-server + Client + Admin | 3000, 5173, 5175 |
| `bonk-race-db` | PostgreSQL 16 + Redis 7 | 5432, 6379 |

## Версия

**v0.1.0** — BonkLab physics sandbox (Sprint 1b + Sprint 2)

---

Подробная документация в [docs/](docs/).
