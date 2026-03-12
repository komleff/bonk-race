# Руководство для ИИ-агентов — Slime Arena

Точка входа для всех ИИ-моделей. Начни с этого файла.

## Роли агентов

Каноничный документ: [`.agents/AGENT_ROLES.md`](.agents/AGENT_ROLES.md)

| Роль | Когда использовать |
| ---- | ------------------ |
| **PM** | Координация спринта, оркестрация ревью |
| **Architect** | Декомпозиция эпиков, создание задач |
| **Developer** | Написание кода, исправление багов |
| **Reviewer** | Проверка PR, валидация качества |

Промпты для активации: [`.agents/HOW_TO_USE_AGENT_ROLES.md`](.agents/HOW_TO_USE_AGENT_ROLES.md)

Задачи только через Beads: `bd ready` → `bd show <id>` → `bd update <id> --status=in_progress`

**Пуш в `main` запрещён.** Создавай ветку, открывай PR.

> **Комментарии в коде — только на русском.** Идентификаторы (переменные, классы, методы) — на английском.

---

## Инструкция по работе с Memory Bank

Вы — опытный ИИ-ассистент, работающий над сложным программным проектом. Ваша задача — поддерживать актуальное состояние «Memory Bank» проекта. Memory Bank — это набор документов в директории `.memory_bank/`, которые служат вашим внешним контекстом и «памятью» о проекте.

## Суть Memory Bank

Memory Bank позволяет вам:
1. Быстро входить в контекст проекта после перерыва.
2. Понимать архитектурные решения и паттерны.
3. Отслеживать прогресс и текущие задачи.
4. Сохранять знания о технических особенностях и ограничениях.

## Структура документов

- `projectbrief.md`: Суть проекта, его цели и ключевые особенности.
- `productContext.md`: Зачем существует проект, какие проблемы решает и как должен работать.
- `activeContext.md`: Текущее состояние, последние изменения и ближайшие шаги.
- `systemPatterns.md`: Архитектура, ключевые паттерны проектирования и технические решения.
- `techContext.md`: Стек технологий, инфраструктура и технические ограничения.
- `progress.md`: Список выполненных задач, текущий статус и планы.

## Правила работы

1. **Актуальность**: При каждом значительном изменении в коде или логике проекта вы ДОЛЖНЫ обновлять соответствующие файлы в `.memory_bank/`.
2. **Active Context**: Файл `activeContext.md` должен обновляться чаще всего — он отражает то, над чем вы работаете прямо сейчас.
3. **Синхронизация**: Перед началом работы всегда просматривайте Memory Bank, чтобы освежить контекст.
4. **Точность**: Документация должна соответствовать реальному состоянию кода. Если вы изменили паттерн — обновите `systemPatterns.md`.

---

## Файлы Memory Bank в проекте

Все файлы документации расположены в директории [/.memory_bank/](/.memory_bank/):

1.  [/.memory_bank/projectbrief.md](/.memory_bank/projectbrief.md) — Обзор проекта и целей.
2.  [/.memory_bank/productContext.md](/.memory_bank/productContext.md) — Бизнес-логика и пользовательский опыт.
3.  [/.memory_bank/activeContext.md](/.memory_bank/activeContext.md) — Текущий рабочий контекст.
4.  [/.memory_bank/systemPatterns.md](/.memory_bank/systemPatterns.md) — Архитектурные паттерны.
5.  [/.memory_bank/techContext.md](/.memory_bank/techContext.md) — Технический стек и ограничения.
6.  [/.memory_bank/progress.md](/.memory_bank/progress.md) — Статус выполнения и планы.

Также созданы дополнительные директории для расширения документации:
- [/.memory_bank/modules/](/.memory_bank/modules/)
- [/.memory_bank/ui_extension/](/.memory_bank/ui_extension/)
- [/.memory_bank/other/](/.memory_bank/other/)

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
