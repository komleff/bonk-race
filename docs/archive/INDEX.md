# Навигация по документации Bonk Race

> Актуально на: 2026-03-10 | Версия: v0.1.0

---

## Для ИИ-агентов (живая инфраструктура)

| Что | Где | Назначение |
|-----|-----|------------|
| **Роли агентов** | [.agents/AGENT_ROLES.md](../.agents/AGENT_ROLES.md) | PM, Architect, Developer, Reviewer |
| **Роль PM** | [.agents/PM_ROLE.md](../.agents/PM_ROLE.md) | Оркестрация, эскалация, цикл ревью |
| **Beads CLI** | [.beads/README.md](../.beads/README.md) | `bd create`, `bd show`, `bd sync` |
| **Claude** | [CLAUDE.md](../CLAUDE.md) | Beads, архитектура, команды |
| **Memory Bank** | [AGENTS.md](../AGENTS.md) | Точка входа для AI-моделей |
| **Copilot** | [.github/copilot-instructions.md](../.github/copilot-instructions.md) | Паттерны симуляции, конфигурация |

### Memory Bank (`.memory_bank/`)

| Файл | Назначение |
|------|------------|
| [activeContext.md](../.memory_bank/activeContext.md) | Текущее состояние, PR-история, техдолг |
| [progress.md](../.memory_bank/progress.md) | Статус спринтов, контрольные точки |
| [systemPatterns.md](../.memory_bank/systemPatterns.md) | Архитектура, порядок систем |
| [techContext.md](../.memory_bank/techContext.md) | Стек, инфраструктура, ограничения |
| [productContext.md](../.memory_bank/productContext.md) | Бизнес-логика, UX |
| [projectbrief.md](../.memory_bank/projectbrief.md) | Суть проекта, цели |

---

## Документация проекта

### BonkLab (dev-only physics sandbox)

| Файл | Содержание |
|------|------------|
| [BonkLab-Guide.md](BonkLab-Guide.md) | Руководство пользователя (~50 параметров, пресеты, export/import) |
| [tz/BonkLab-TZ-v1.2.md](tz/BonkLab-TZ-v1.2.md) | Техническое задание v1.2 (орбы, финиш, геометрия, камера) |
| [review-prompt-bonklab-v1.2.md](review-prompt-bonklab-v1.2.md) | Промпт для AI-ревью BonkLab v1.2 |

### Дизайн игры (`docs/gdd/`)

| Файл | Содержание |
|------|------------|
| [GDD-index.md](gdd/GDD-index.md) | Game Design Document v4.0 |
| [GDD-Core.md](gdd/GDD-Core.md) | Ядро: блобы, масса, арена |
| [GDD-Combat.md](gdd/GDD-Combat.md) | Боевая система |
| [GDD-Arena.md](gdd/GDD-Arena.md) | Арена, зоны, объекты |
| [GDD-UI.md](gdd/GDD-UI.md) | Интерфейс |
| [GDD-Glossary.md](gdd/GDD-Glossary.md) | Глоссарий терминов |

### Архитектура (`docs/soft-launch/`)

| Файл | Содержание |
|------|------------|
| [SlimeArena-Architecture-v4.2.5-Part1..4](soft-launch/) | Полная архитектура (4 части) |
| [TZ-SoftLaunch-v1.4.7.md](soft-launch/TZ-SoftLaunch-v1.4.7.md) | Требования софт-лонча |
| [architecture/data-flow.md](architecture/data-flow.md) | Поток данных клиент ↔ сервер |

### Релизы (`docs/releases/`)

| Файл | Содержание |
|------|------------|
| [v0.1.0-release-notes.md](releases/v0.1.0-release-notes.md) | **BonkLab v0.1.0** — physics sandbox + orbs |
| [v0.8.6-release-notes.md](releases/v0.8.6-release-notes.md) | SlimeArena v0.8.6 (legacy) |

### Планы (`docs/plans/`)

| Файл | Содержание |
|------|------------|
| [archive/sprint-2-bonklab-v1.2-plan.md](plans/archive/sprint-2-bonklab-v1.2-plan.md) | Sprint 2: BonkLab v1.2 (завершён) |
| [archive/sprint-1-mvp-loop-plan.md](plans/archive/sprint-1-mvp-loop-plan.md) | Sprint 1: MVP loop (завершён) |
| [archive/sprint-1b-bonklab-v1-spec.md](plans/archive/sprint-1b-bonklab-v1-spec.md) | Sprint 1b: BonkLab v1.0 spec (завершён) |

### Эксплуатация (`docs/operations/`)

| Файл | Содержание |
|------|------------|
| [SERVER_SETUP.md](operations/SERVER_SETUP.md) | Настройка сервера |
| [SERVER_UPDATE.md](operations/SERVER_UPDATE.md) | Обновление, откат |
| [backup-restore.md](operations/backup-restore.md) | Бэкапы |

---

## Корневые файлы

| Файл | Назначение |
|------|------------|
| [README.md](../README.md) | Главный README проекта |
| [config/balance.json](../config/balance.json) | Баланс (единственный источник) |
| [CLAUDE.md](../CLAUDE.md) | Инструкции для Claude Code |
