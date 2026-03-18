# Agentic Engineering — Стартер-кит

Готовый пакет конфигураций для начала работы с ИИ-агентами в режиме Agentic Engineering.

**Версия:** 1.0
**Дата:** 13 марта 2026

---

## Что это

Набор шаблонов и конфигов для настройки мультиагентной разработки в VS Code и Cursor. Не vibe coding (человек пишет промпты на лету), а **agentic engineering** — ИИ-агенты работают по ролям, правилам и задачам.

---

## Быстрый старт

### Требования

- **VS Code** с расширением [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code)
- **Cursor** (опционально) — AI-first редактор
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`
- **GitHub CLI** — [cli.github.com](https://cli.github.com/) (для ревью и PR)
- API-ключи: Anthropic (Claude), OpenAI (GPT) — для кросс-ревью

### Установка за 5 минут

```bash
# 1. Скопировать шаблоны в корень проекта
cp -rn docs/starter-kit/. ./

# 2. Переименовать шаблоны (убрать суффикс .template)
find . -path './.git' -prune -o -name "*.template" -print \
  | while read f; do mv "$f" "${f%.template}"; done

# 3. Заменить плейсхолдеры (см. таблицу ниже)

# 4. Заполнить Memory Bank (см. приоритеты ниже)

# 5. Проверить
claude  # запустить Claude Code → он должен поздороваться на русском
```

### Плейсхолдеры — что заменить

**Обязательные** (без них агент не поймёт проект):

| Плейсхолдер | Где | Пример |
|---|---|---|
| `[PROJECT_NAME]` | CLAUDE.md, AGENT_ROLES.md | `My App` |
| `[DATE]` | CLAUDE.md, AGENT_ROLES.md | `2026-03-19` |
| `[BUILD_CMD]` | CLAUDE.md, copilot-instructions.md | `npm run build` |
| `[TEST_CMD]` | CLAUDE.md, copilot-instructions.md | `npm run test` |
| `[DEV_SERVER_CMD]` | CLAUDE.md | `npm run dev` |

**Рекомендуемые** (улучшают контекст):

| Плейсхолдер | Где | Пример |
|---|---|---|
| `[CONFIG_FILE]` | CLAUDE.md | `config/settings.json` |
| `[MAIN_SERVER_FILE]` | CLAUDE.md | `src/server/index.ts` |
| `[MAIN_CLIENT_FILE]` | CLAUDE.md | `src/client/App.tsx` |
| `[ОПИСАНИЕ_ПРОЕКТА]` | copilot-instructions.md | `SaaS для управления задачами` |
| `[КОНФИГ_ФАЙЛ]` | copilot-instructions.md | `config/app.json` |

### Memory Bank — порядок заполнения

| Приоритет | Файл | Когда заполнять |
|---|---|---|
| 🔴 Сразу | `projectbrief.md` | Перед первым запуском — цель, аудитория, MVP |
| 🔴 Сразу | `techContext.md` | Перед первым запуском — стек, команды, ограничения |
| 🟡 Первая сессия | `activeContext.md` | После первого спринта — текущий статус |
| 🟡 Первая сессия | `productContext.md` | Когда есть понимание продукта |
| ⚪ Позже | `systemPatterns.md` | Когда появятся архитектурные решения |
| ⚪ Позже | `progress.md` | Когда начнётся итеративная работа |

### Проверка установки

После `claude` убедитесь:
1. Агент отвечает **на русском** (настройка `language` из settings.json)
2. Спросите `Какой проект?` — агент должен назвать `[PROJECT_NAME]` из CLAUDE.md
3. Попробуйте `git push origin main` — агент должен **отказать** (deny-list)

---

## Содержимое пакета

```
starter-kit/
├── README.md                         ← Этот файл
├── CLAUDE.md.template                ← Шаблон главного конфига
├── CLAUDE-core.md.template           ← Базовые правила
├── .cursorignore                     ← Что Cursor не индексирует
│
├── .agents/
│   ├── AGENT_ROLES.md.template       ← Роли агентов (PM, Developer, Reviewer)
│   └── HOW_TO_USE.md                 ← Промпты активации ролей
│
├── .claude/
│   └── settings.json                 ← Разрешения и deny-list
│
├── .github/
│   └── copilot-instructions.md.template ← Правила для Copilot
│
├── .memory_bank/
│   ├── projectbrief.md.template      ← Бриф проекта
│   ├── productContext.md.template    ← Продуктовый контекст
│   ├── activeContext.md.template     ← Текущее состояние
│   ├── techContext.md.template       ← Технический стек
│   ├── systemPatterns.md.template    ← Архитектурные паттерны
│   └── progress.md.template          ← Прогресс
│
└── .vscode/
    └── settings.json                 ← Настройки VS Code
```

---

## Уровни настройки

### Уровень 1: Минимальный (один агент, один человек)

Нужно: `CLAUDE.md`, `.claude/settings.json`

Подходит для: быстрого старта, небольших задач, одного человека.

### Уровень 2: Базовый (+ Copilot + Cursor)

Добавить: `.github/copilot-instructions.md`, `.cursorignore`, `.vscode/settings.json`

Подходит для: регулярной разработки с несколькими ИИ-инструментами.

### Уровень 3: Полный (мультиагентная разработка)

Добавить: `.agents/`, `.memory_bank/`

Подходит для: серьёзных проектов с итерационным циклом ревью, планированием спринтов, кросс-валидацией.

---

## Как это работает

### Поток работы

```
Оператор                   PM (Opus)               Developer (Opus)           Reviewer (Opus/GPT)
   │                          │                          │                          │
   ├─── задача ──────────────►│                          │                          │
   │                          ├─── декомпозиция ────────►│                          │
   │                          │                          ├─── код + тесты           │
   │                          │                          ├─── git push branch       │
   │                          ├─── запуск ревью ────────────────────────────────────►│
   │                          │                          │                          ├── вердикт
   │                          │◄─────────────────────────────────────────────────────┤
   │                          │  CHANGES_REQUESTED?      │                          │
   │                          ├─── фикс ────────────────►│                          │
   │                          │                          ├─── исправления           │
   │                          ├─── ре-ревью ────────────────────────────────────────►│
   │                          │                          │                          ├── APPROVED
   │◄──── PR ready ───────────┤                          │                          │
   ├─── merge ────────────────►                          │                          │
```

### Принципы

1. **Задачи — единственный источник работы.** Не TODO в коде, не устные договорённости.
2. **ИИ не пушит в main.** Только ветки, только PR. Merge — только человек.
3. **Кросс-ревью разными моделями.** Одна модель может пропустить баг, три — вряд ли.
4. **Memory Bank — внешняя память.** Агенты помнят контекст между сессиями. Концепция: [habr.com/ru/articles/979624](https://habr.com/ru/articles/979624/) (Максим Ткачев, bquadro).
5. **Zero Trust к человеку.** Человек не проверяет код — доверяет тестам и вердиктам.

---

## Рекомендации по моделям для ревью

| Модель | Роль | Рекомендация |
|--------|------|-------------|
| **GPT-5.4** | Ревьювер | Лучший. Находит реальные проблемы, следует роли. |
| **GPT-5.3-Codex** | Ревьювер | Быстрый и дешёвый, хорошее качество. |
| **Copilot** | Ревьювер | Удобен для мелочей, интегрирован в IDE. |
| **Claude Opus** | Ревьювер | Избыточен если PM тоже Opus (та же модель). |
| **Gemini** | Ревьювер | ⚠️ Осторожно: может начать править код вместо ревью. |
| **DeepSeek** | Ревьювер | Бесплатный cross-check, нестабильное качество. |

---

## Настройка Cursor

Cursor использует `.cursorignore` и может читать `CLAUDE.md` как project rules.

1. Скопировать `.cursorignore` в корень проекта
2. В Cursor: Settings → Rules → Add rule → указать путь к `CLAUDE.md`
3. Cursor будет следовать тем же правилам, что и Claude Code

---

## Частые вопросы

**Q: Сколько стоит?**
A: Основные затраты — API Claude (Opus). Для активной разработки: $100–200/мес. GPT ревью добавляет $20–40/мес.

**Q: Обязателен ли Beads?**
A: Нет. Можно использовать GitHub Issues, Linear или просто текстовый backlog. Beads удобен для CLI-first workflow.

**Q: Можно ли использовать только Cursor без VS Code?**
A: Да. Cursor читает те же конфиги. Основное отличие — Claude Code CLI лучше для мультиагентных сценариев (PM-режим с субагентами).

**Q: Что если у меня не TypeScript-проект?**
A: Шаблоны адаптируются под любой стек. Замените команды сборки/тестов и описание стека в конфигах.
