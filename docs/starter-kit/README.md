# Agentic Engineering — Стартер-кит

Готовый пакет конфигураций для начала работы с ИИ-агентами в режиме Agentic Engineering.

**Версия:** 1.0
**Дата:** 13 марта 2026

---

## Что это

Набор шаблонов и конфигов для настройки мультиагентной разработки в VS Code и Cursor. Не vibe coding (человек пишет промпты ad-hoc), а **agentic engineering** — ИИ-агенты работают по ролям, правилам и задачам.

---

## Быстрый старт

### Требования

- **VS Code** с расширением [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code)
- **Cursor** (опционально) — AI-first редактор
- **Claude Code CLI** — `npm install -g @anthropic-ai/claude-code`
- **GitHub CLI** — `brew install gh` (для ревью и PR)
- API-ключи: Anthropic (Claude), OpenAI (GPT) — для кросс-ревью

### Установка за 5 минут

```bash
# 1. Скопировать шаблоны в корень проекта
cp -r docs/starter-kit/.agents .agents
cp -r docs/starter-kit/.claude .claude
cp -r docs/starter-kit/.github .github
cp -r docs/starter-kit/.memory_bank .memory_bank
cp -r docs/starter-kit/.vscode .vscode
cp docs/starter-kit/CLAUDE.md.template CLAUDE.md
cp docs/starter-kit/.cursorignore .cursorignore

# 2. Отредактировать CLAUDE.md — заменить плейсхолдеры
# [PROJECT_NAME], [TECH_STACK], [BUILD_CMD], [TEST_CMD]

# 3. Заполнить Memory Bank
# .memory_bank/projectbrief.md — зачем проект
# .memory_bank/techContext.md — стек и ограничения

# 4. Проверить
claude  # запустить Claude Code и убедиться, что он читает CLAUDE.md
```

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
4. **Memory Bank — внешняя память.** Агенты помнят контекст между сессиями.
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
A: Основные затраты — API Claude (Opus). Для среднего проекта: $50–150/мес. GPT ревью добавляет $10–30/мес.

**Q: Обязателен ли Beads?**
A: Нет. Можно использовать GitHub Issues, Linear или просто текстовый backlog. Beads удобен для CLI-first workflow.

**Q: Можно ли использовать только Cursor без VS Code?**
A: Да. Cursor читает те же конфиги. Основное отличие — Claude Code CLI лучше для мультиагентных сценариев (PM-режим с субагентами).

**Q: Что если у меня не TypeScript-проект?**
A: Шаблоны адаптируются под любой стек. Замените команды сборки/тестов и описание стека в конфигах.
