# CLAUDE.md — Bonk Race: корневой индекс

**Проект:** Bonk Race
**Обновлён:** 2026-03-07

**Работай по задачам Beads.** Перед началом работы выполни `bd ready` и выбери задачу. Следуй правилам из `.agents/AGENT_ROLES.md`.

---

## Протокол работы

1. **Beads** — единственный источник задач. Перед работой: `bd ready`, затем `bd update <id> --status=in_progress`.
2. **AGENT_ROLES** — следуй роли Developer из `.agents/AGENT_ROLES.md`.
3. **Memory Bank** — веди протокол в `.memory_bank/activeContext.md` при значительных изменениях.

---

## Структура инструкций

Этот файл — индекс. Загружай нужные разделы по задаче.

| Файл | Когда загружать |
|---|---|
| `CLAUDE-core.md` | **Всегда** — базовые правила работы |
| `CLAUDE-architecture.md` | Любая задача связана с кодом, сервером, БД, API |
| `CLAUDE-gameplay.md` | Задачи по игровым механикам, балансу, GDD |
| `CLAUDE-platforms.md` | Интеграция с платформами (Telegram, Yandex, VK) |
| `.memory_bank/` | Текущий спринт, статус задач, техдолг — **актуальный источник** |

---

## Приоритет источников правды

1. `SlimeArena-Architecture-v4.2.5-Part4.md` — БД, HTTP API, конфиги, безопасность
2. `TZ-SoftLaunch-v1.4.7.md` — требования релиза
3. `SlimeArena-SoftLaunch-Plan-v1.0.5.md` — этапы и критерии готовности
4. `SlimeArena-Architecture-v4.2.5-Part1..3.md` — остальная архитектура
5. Прочие документы

При конфликте между источниками — сообщить оператору. Самостоятельно выбирать нельзя.

---

## Быстрый старт

1. Прочитай `CLAUDE-core.md`.
2. Определи тип задачи.
3. Загрузи соответствующий контекстный файл.
4. Работай только в рамках загруженного контекста.

---

## Команды

```bash
# Разработка
npm run dev:server      # ws://localhost:2567
npm run dev:client      # http://localhost:5173

# Сборка и тесты
npm run build           # shared → server → client
npm run test            # determinism + orb-bite + arena-generation
```

## Beads (управление задачами)

```bash
bd prime               # Загрузить контекст
bd ready               # Доступные задачи
bd show <issue-id>     # Детали задачи
bd update <id> --status=in_progress
bd close <id> --reason="..."
```

## Ключевые файлы

| Файл | Назначение |
|------|------------|
| `config/balance.json` | Параметры баланса |
| `server/src/rooms/ArenaRoom.ts` | Игровая логика (~2800 строк) |
| `server/src/utils/rng.ts` | Детерминированный генератор |
| `client/src/main.ts` | Клиентский код (~4000 строк) |
| `shared/src/formulas.ts` | Игровые формулы |
| `.agents/AGENT_ROLES.md` | Роли агентов |
| `.memory_bank/activeContext.md` | Текущее состояние проекта |

## Дополнительный контекст

- **Архитектура:** `docs/soft-launch/SlimeArena-Architecture-v4.2.5-Part1.md` (и Part2-4)
- **Технический план:** `docs/soft-launch/TZ-SoftLaunch-v1.4.7.md`
- **GDD:** `docs/gdd/` (BonkRace-GDD-v3_0.md)
- **Memory Bank:** `.memory_bank/`
- **Роли агентов:** `.agents/AGENT_ROLES.md`
