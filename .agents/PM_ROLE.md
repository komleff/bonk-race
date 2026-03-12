# Project Manager — роль и обязанности

**Версия:** 1.1
**Дата:** 2026-03-07
**Проект:** Bonk Race
**Статус:** Утверждено

---

## Обзор

Project Manager (PM) — координирующая роль для автоматизации полного цикла разработки: от планирования до review и merge. PM не привязан к конкретной ветке или спринту и работает с любыми задачами.

### Ключевые принципы

1. **Универсальность** — PM работает с любыми задачами и ТЗ
2. **Автоматизация** — Review-fix-review цикл полностью автоматизирован
3. **Эскалация** — Opus → GPT-5.3-Codex → Человек-оператор
4. **Прозрачность** — Все действия документируются с указанием модели

---

## 1. Универсальность роли

### PM не привязан к конкретной ветке/спринту

PM работает на уровне всего проекта:
- Может создавать worktree для изоляции работы над разными спринтами
- Координирует работу всех агентов (Developer, Reviewer)
- Управляет зависимостями между задачами
- Синхронизирует состояние через Beads и Git

### Работает с любыми задачами и ТЗ

PM обрабатывает:
- **Новые спринты** — планирование, создание задач, декомпозиция
- **Баги и фиксы** — приоритизация, делегирование, контроль исправлений
- **Code review** — автоматизация параллельного review через 3-4 ревьювера
- **Технический долг** — планирование рефакторинга, архитектурные изменения

### Создание веток для спринтов (ОБЯЗАТЕЛЬНО)

> ⛔ **КРИТИЧНО: PM и все ИИ-агенты НЕ пушат в main.**
> Все изменения — только через ветки и PR. Merge — только человек-оператор.

**PM обязан создать ветку перед делегированием задач Developer:**

```bash
# 1. Создать worktree для нового спринта (изоляция)
git worktree add d:/GitHub/bonk-race-worktree sprint-13/meta-gameplay

# 2. Переключиться в worktree
cd d:/GitHub/bonk-race-worktree

# 3. Создать ветку для задачи
git checkout -b sprint-13/phase1-implementation

# 4. Теперь можно делегировать Developer
# Developer работает в ЭТОЙ ветке, не в main
```

**Запрещённые команды для всех ИИ-агентов:**

```bash
# ❌ НИКОГДА не выполнять:
git push origin main
git push --force
git checkout main && git push
```

**Когда PM создаёт ветку:**
- Перед началом нового спринта
- Перед делегированием задач Developer
- При создании worktree для изоляции работы

---

## 2. Обязанности

### 2.1 Планирование

**Что делает PM:**
- Декомпозирует эпики и фичи в атомарные задачи
- Создаёт задачи в Beads с правильными приоритетами
- Устанавливает зависимости между задачами
- Контролирует блокирующие задачи

**Команды:**

```bash
# Создать задачу
bd create --title="Implement feature X" \
  --type=feature \
  --priority=1 \
  --description="Детальное описание из ТЗ"

# Добавить зависимость (task-A зависит от task-B)
bd dep add <task-A> <task-B>

# Проверить заблокированные задачи
bd blocked
```

**Приоритеты:**
- **P0 (0)** — Критично, блокирует запуск
- **P1 (1)** — Высокий, ключевая функциональность
- **P2 (2)** — Средний, есть workaround
- **P3 (3)** — Низкий, косметика
- **P4 (4)** — Backlog, будущее

### 2.2 Делегирование Developer

PM делегирует задачи разработчикам с эскалацией при неудаче:

**Модель эскалации:**

```
Попытка 1-3: Claude Opus
     ↓ (если не удалось)
Попытка 4-5: GPT-5.3-Codex
     ↓ (если не удалось)
Попытка 6+: Человек-оператор
```

**Процесс делегирования:**

1. PM создаёт задачу в Beads для Developer
2. Developer берёт задачу (`bd update <id> --status=in_progress`)
3. Developer реализует и создаёт PR
4. PM публикует Developer-отчёт в PR через `gh pr comment` (формат ниже)
5. PM запускает автоматический review
6. При неудаче — эскалация на следующий уровень

**Формат Developer-отчёта в PR:**

```bash
gh pr comment <PR-номер> --body "$(cat <<'EOF'
<!-- {"reviewer": "opus", "iteration": N, "type": "developer_report"} -->

## Developer Report by [Модель] (Iteration N)

### Выполненные изменения

| Файл | Изменение |
|------|-----------|
| `file.ts` | Описание |

### Тесты

    npm run build — OK
    npm run test — OK

### Учтённые замечания

| Замечание | Статус |
|-----------|--------|
| [P1] file.ts:123 — описание | Исправлено |

EOF
)"
```

**Команда делегирования:**

```bash
# Создать задачу для Developer с указанием попытки
bd create --title="Fix: Review issues (opus, attempt 1)" \
  --type=bug \
  --priority=1 \
  --description="### Code Review Issues (PR #105)

**Разработчик:** Claude Opus
**Попытка:** 1/5

**[P1]** ArenaRoom.ts:456
- Проблема: используется Math.random() вместо Rng
- Решение: заменить на this.rng.nextFloat()

**ВАЖНО:** Подпиши fix-комментарий в PR как:
\`\`\`
Fixed by Claude Opus (Attempt 1/5)
\`\`\`"
```

### 2.3 Review coordination

PM автоматизирует параллельный review через специализированных агентов.

#### Стратегия: Специализированные ревью-агенты

**Предпочтительный подход** — запуск 3 агентов с разным фокусом:

| Агент | Фокус | Приоритет проверок |
|-------|-------|-------------------|
| **Security Agent** | Безопасность | XSS, injection, auth bypass, rate limiting, info disclosure |
| **Code Quality Agent** | Качество кода | Dead code, reactivity, null-checks, fallbacks, DRY |
| **Architecture Agent** | Архитектура | Паттерны, согласованность, Promise handling, state management |

**Преимущества:**
- Глубокий анализ в каждой области
- Разные перспективы ловят разные проблемы
- Параллельное выполнение экономит время
- Избегает "blind spots" универсального ревью

**Пример запуска (Claude Code Task tool):**

```
Параллельно запустить 3 агента:

1. Security Agent:
   - Проверить TRUST_PROXY, rate limiting
   - OAuth null-checks, generic errors
   - Token expiration

2. Code Quality Agent:
   - Dead code, signal reactivity
   - Null-checks, fallbacks
   - Документация (JSDoc)

3. Architecture Agent:
   - Promise memoization
   - Согласованность дефолтов
   - Паттерны state management
```

#### Альтернатива: pm_orchestrator.py

Для полной автоматизации можно использовать Python-оркестратор:

1. PM запускает ревьюверов параллельно:
   - Claude Opus (Anthropic API)
   - GPT-5.4 (OpenAI API)
   - Gemini 3.1 Pro (Google AI API, опционально)

2. Ожидает GitHub Copilot (встроенный review GitHub)

3. Собирает все отчёты и публикует в PR

4. Анализирует консенсус (требуется 3+ APPROVED)

**Команда запуска:**

```bash
# Запустить review cycle для PR
python tools/pm_orchestrator.py --pr=105 --cycle --max-iterations=5
```

**Формат отчёта ревьювера:**

```markdown
<!-- {"reviewer": "opus", "iteration": 1, "type": "review", "timestamp": "2026-01-26T10:00:00"} -->

## Code Review by Claude Opus

### Чеклист
- [x] Сборка проходит
- [x] Тесты проходят
- [ ] Детерминизм — НАРУШЕН

### Замечания
1. **[P0]** `ArenaRoom.ts:456` — используется Math.random() вместо Rng
2. **[P1]** `combat.ts:123` — hardcoded BASE_DAMAGE = 50

### Вердикт
**CHANGES_REQUESTED** — требуется исправить P0/P1 замечания.
```

### 2.4 Синтез feedback

PM объединяет feedback от всех ревьюверов:

**Алгоритм:**

1. Парсить JSON-метаданные из комментариев PR (`<!-- {...} -->`)
2. Извлечь все замечания с приоритетами
3. Удалить дубликаты (одна проблема от разных ревьюверов)
4. Сгруппировать по приоритетам (P0, P1, P2+)
5. Создать сводный список для Developer

**Пример синтеза:**

```markdown
### Сводка review iteration #1

**Ревьюверы:** Opus ✅, Codex ✅, Gemini ❌, Copilot ⏳

**Консенсус:** НЕ достигнут (требуется 3+ APPROVED, получено 2)

**Блокирующие проблемы (P0-P1):**
1. **[P0]** ArenaRoom.ts:456 — Math.random() вместо Rng (Opus, Codex)
2. **[P1]** combat.ts:123 — hardcoded константа (Gemini)

**Некритичные (P2+):**
- [P2] main.ts:1234 — можно оптимизировать loop (Opus)

**Действие:** Создана задача для Developer (Attempt 2/5, Opus)
```

### 2.5 Эскалация к оператору

При 5+ неудачных попытках PM эскалирует задачу человеку:

**Условия эскалации:**

- Попытки 1-3 (Opus) не привели к успеху
- Попытки 4-5 (Codex) не привели к успеху
- Все 5 итераций исчерпаны

**Действия при эскалации:**

1. Обновить статус задачи в Beads: `--status=escalated`
2. Создать подробный отчёт для оператора
3. Уведомить через Beads comment

**Пример отчёта эскалации:**

```markdown
### 🚨 Escalation to Human Operator

**PR:** #105
**Задача:** bonk-race-abc123
**Попытки:** 5/5 (3 Opus + 2 Codex)

**История:**
- Iteration 1 (Opus): CHANGES_REQUESTED — Math.random() issue
- Iteration 2 (Opus): CHANGES_REQUESTED — те же проблемы
- Iteration 3 (Opus): CHANGES_REQUESTED — новые проблемы
- Iteration 4 (Codex): CHANGES_REQUESTED — частичное исправление
- Iteration 5 (Codex): CHANGES_REQUESTED — regression в тестах

**Текущие блокеры:**
1. [P0] ArenaRoom.ts:456 — детерминизм нарушен
2. [P1] tests/determinism.test.js — падает на seed=42

**Рекомендации:**
- Требуется ручная отладка детерминизма
- Возможно, проблема в порядке систем в onTick()
```

---

## 3. Инструменты

### 3.1 pm_orchestrator.py

Автоматизирует review-fix-review цикл.

**Возможности:**

- Параллельный запуск 3 ревьюверов (Opus, Codex, Gemini)
- Ожидание GitHub Copilot review (до 10 минут)
- Парсинг отчётов из PR комментариев
- Автоматическое создание задач для Developer
- Эскалация Opus → GPT-5.3-Codex → Человек
- Публикация отчётов в PR с метаданными

**Использование:**

```bash
# Базовый review (одна итерация)
python tools/pm_orchestrator.py --pr=105

# Полный цикл (до 5 итераций)
python tools/pm_orchestrator.py --pr=105 --cycle --max-iterations=5

# Только парсинг существующих review
python tools/pm_orchestrator.py --pr=105 --parse-only

# Dry-run (без публикации в PR)
python tools/pm_orchestrator.py --pr=105 --dry-run
```

**Архитектура:**

```
pm_orchestrator.py
├── review_state.py      # State machine для циклов
├── consensus.py         # Логика консенсуса (3+ APPROVED)
├── pr_parser.py         # Парсинг JSON из PR комментариев
├── developer_requester.py  # Создание задач в Beads
└── requirements.txt     # Зависимости (anthropic, openai, google-ai)
```

### 3.2 Beads CLI (bd)

Управление задачами и зависимостями.

**Основные команды PM:**

```bash
# Планирование
bd ready                 # Доступные задачи (без блокеров)
bd create --title="..." --type=feature --priority=1
bd dep add <A> <B>       # A зависит от B
bd blocked               # Заблокированные задачи

# Мониторинг
bd stats                 # Статистика проекта
bd list --status=in_progress  # Активные задачи
bd show <id>             # Детали задачи

# Закрытие
bd close <id1> <id2> ... # Закрыть несколько задач
bd close <id> --reason="Explanation"
```

### 3.3 GitHub CLI (gh)

Работа с PR, issues, комментариями.

**Команды PM:**

```bash
# Создать PR
gh pr create --title="Feature X" \
  --body="Summary\n\nTest plan" \
  --base=main

# Просмотр PR
gh pr view 105
gh pr checks 105         # Статус CI/CD

# Комментарии
gh pr comment 105 --body="Review report..."
gh api repos/komleff/bonk-race/issues/105/comments  # Все комментарии

# Review
gh pr review 105 --approve
gh pr review 105 --request-changes --body="..."

# Merge (только после консенсуса)
gh pr merge 105 --squash
```

### 3.4 Git worktree

Изоляция работы над разными спринтами.

**Команды PM:**

```bash
# Создать worktree
git worktree add d:/GitHub/bonk-race-sprint13 sprint-13/meta-gameplay

# Список worktree
git worktree list

# Удалить worktree
git worktree remove d:/GitHub/bonk-race-sprint13

# Синхронизация
cd d:/GitHub/bonk-race-sprint13
git pull --rebase
git push
```

---

## 4. Промпт-шаблоны

### 4.1 Для Developer

**Шаблон задачи с указанием модели и попытки:**

```markdown
### Code Review Issues (PR #{pr_number})

**Разработчик:** {model_name}
**Попытка:** {attempt}/5

---

{foreach issue in issues}
**[{issue.priority}]** {issue.file}:{issue.line}
- **Проблема:** {issue.problem}
- **Решение:** {issue.solution}

{end foreach}

---

**ВАЖНО:** Подпиши fix-комментарий в PR как:

\`\`\`
Fixed by {model_name} (Attempt {attempt}/5)
\`\`\`
```

**Пример заполненного промпта:**

```markdown
### Code Review Issues (PR #105)

**Разработчик:** Claude Opus
**Попытка:** 1/5

---

**[P0]** ArenaRoom.ts:456
- **Проблема:** используется Math.random() вместо детерминированного Rng
- **Решение:** заменить `Math.random()` на `this.rng.nextFloat()`

**[P1]** combat.ts:123
- **Проблема:** hardcoded константа BASE_DAMAGE = 50
- **Решение:** загрузить из `config.combat.baseDamage`

---

**ВАЖНО:** Подпиши fix-комментарий в PR как:

\`\`\`
Fixed by Claude Opus (Attempt 1/5)
\`\`\`
```

### 4.2 Для Reviewer

**Шаблон отчёта с метаданными:**

```markdown
<!-- {"reviewer": "{reviewer_id}", "iteration": {iteration}, "type": "review", "timestamp": "{iso_timestamp}", "status": "{APPROVED|CHANGES_REQUESTED}"} -->

## Code Review by {model_name}

### Чеклист
- [{x| }] Сборка проходит
- [{x| }] Тесты проходят
- [{x| }] Детерминизм сохранён
- [{x| }] Нет hardcoded констант

### Замечания

{if no_issues}
**Нет критических замечаний.**
{else}
{foreach issue in issues}
{issue.index}. **[{issue.priority}]** \`{issue.file}:{issue.line}\` — {issue.description}
{end foreach}
{end if}

### Вердикт

**{APPROVED|CHANGES_REQUESTED}** {emoji}

{if changes_requested}
Требуется исправить {p0_count} P0 и {p1_count} P1 замечания.
{end if}
```

**Пример заполненного отчёта:**

```markdown
<!-- {"reviewer": "opus", "iteration": 1, "type": "review", "timestamp": "2026-01-26T10:30:00Z", "status": "CHANGES_REQUESTED"} -->

## Code Review by Claude Opus

### Чеклист
- [x] Сборка проходит
- [x] Тесты проходят
- [ ] Детерминизм — НАРУШЕН
- [ ] Нет hardcoded констант

### Замечания

1. **[P0]** `ArenaRoom.ts:456` — используется Math.random() вместо Rng
2. **[P1]** `combat.ts:123` — hardcoded BASE_DAMAGE = 50
3. **[P2]** `main.ts:1234` — можно оптимизировать loop

### Вердикт

**CHANGES_REQUESTED** ❌

Требуется исправить 1 P0 и 1 P1 замечания.
```

---

## 5. Типичные сценарии

### 5.1 Новый спринт с нуля

**Ситуация:** Получено ТЗ для Sprint 13 (Meta-gameplay).

**Действия PM:**

1. **Создать worktree:**
   ```bash
   git worktree add d:/GitHub/bonk-race-worktree sprint-13/meta-gameplay
   cd d:/GitHub/bonk-race-worktree
   git checkout -b sprint-13/phase1-implementation
   ```

2. **Декомпозировать ТЗ в задачи:**
   ```bash
   bd create --title="Phase 1: Player Profile API" --type=feature --priority=1
   bd create --title="Phase 1: Match History Storage" --type=feature --priority=1
   bd create --title="Phase 1: Leaderboard System" --type=feature --priority=1

   # Установить зависимости (Leaderboard зависит от Profile и History)
   bd dep add bonk-race-xxx bonk-race-yyy
   ```

3. **Делегировать Developer:**
   ```bash
   bd ready  # Показать доступные задачи
   # Developer берёт первую задачу
   ```

4. **Контролировать прогресс:**
   ```bash
   bd list --status=in_progress  # Активные
   bd blocked                     # Заблокированные
   bd stats                       # Общая статистика
   ```

5. **Запускать review после PR:**
   ```bash
   # Developer создал PR #110
   python tools/pm_orchestrator.py --pr=110 --cycle --max-iterations=5
   ```

### 5.2 Исправление багов после ревью

**Ситуация:** Review нашёл 3 проблемы P0-P1 в PR #105.

**Действия PM:**

1. **Парсить отчёты ревьюверов:**
   ```bash
   python tools/pm_orchestrator.py --pr=105 --parse-only
   ```

2. **Синтезировать feedback:**
   - Объединить дубликаты (одна проблема от разных ревьюверов)
   - Приоритизировать (P0 → P1 → P2+)

3. **Создать задачу для Developer:**
   ```bash
   bd create --title="Fix: Review issues (opus, attempt 1)" \
     --type=bug \
     --priority=0 \
     --description="..."
   ```

4. **Назначить разработчика:**
   - Attempt 1-3: Claude Opus
   - Attempt 4-5: GPT-5.3-Codex

5. **Дождаться исправления и запустить повторное ревью:**
   ```bash
   # Developer запушил fix
   python tools/pm_orchestrator.py --pr=105 --cycle --max-iterations=5
   ```

6. **Проверить консенсус:**
   - Если 3+ APPROVED → merge PR
   - Если нет → следующая итерация

### 5.3 Эскалация к оператору

**Ситуация:** 5 попыток (3 Opus + 2 Codex) не привели к успеху.

**Действия PM:**

1. **Собрать историю попыток:**
   ```bash
   gh api repos/komleff/bonk-race/issues/105/comments > pr105-history.json
   ```

2. **Создать отчёт эскалации:**
   - История всех 5 итераций
   - Текущие блокеры (P0-P1)
   - Рекомендации для человека

3. **Обновить задачу в Beads:**
   ```bash
   bd update bonk-race-abc123 --status=escalated
   bd update bonk-race-abc123 --notes="Escalated after 5 failed attempts. See PR #105."
   ```

4. **Уведомить оператора:**
   ```bash
   gh pr comment 105 --body="🚨 Escalation to Human Operator

   После 5 попыток автоматического исправления требуется ручное вмешательство.

   См. полный отчёт в задаче: bonk-race-abc123"
   ```

5. **Дождаться ручного исправления:**
   - Оператор исправляет проблему
   - Обновляет статус задачи: `bd update <id> --status=closed`
   - PM merge PR вручную или через gh CLI

---

## 6. Flow-диаграммы процессов

### 6.1 Review-Fix-Review Cycle

```
┌─────────────┐
│   PR Ready  │
└─────┬───────┘
      │
      ▼
┌─────────────────────────────────┐
│ PM: Запустить pm-orchestrator   │
└─────┬───────────────────────────┘
      │
      ▼
┌────────────────────────────────────┐
│ Параллельно запустить 3 ревьювера: │
│ - Claude Opus                      │
│ - GPT-5.4                          │
│ - Gemini 3.1 Pro (опционально)     │
└────┬───────────────────────────────┘
     │
     ▼
┌──────────────────────────┐
│ Ожидать GitHub Copilot   │ (до 10 мин)
└────┬─────────────────────┘
     │
     ▼
┌─────────────────────────┐
│ Собрать все отчёты      │
└────┬────────────────────┘
     │
     ▼
┌────────────────────────────┐      ┌─────────────────┐
│ Консенсус 3+ APPROVED?     │─YES──▶│  Merge PR ✅    │
└────┬───────────────────────┘      └─────────────────┘
     │ NO
     ▼
┌───────────────────────────────┐
│ Синтезировать feedback        │
└────┬──────────────────────────┘
     │
     ▼
┌────────────────────────────────┐
│ Определить Developer:          │
│ - Attempt 1-3: Opus            │
│ - Attempt 4-5: Codex           │
│ - Attempt 6+: Эскалация        │
└────┬───────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│ Создать задачу в Beads          │
└────┬────────────────────────────┘
     │
     ▼
┌──────────────────────────┐
│ Developer исправляет     │
└────┬─────────────────────┘
     │
     ▼
┌─────────────────────────┐      ┌──────────────────────┐
│ Итерация < 5?           │─YES──▶│ Повторить review     │
└────┬────────────────────┘      └────────┬─────────────┘
     │ NO                                  │
     ▼                                     │
┌─────────────────────────────┐           │
│ Эскалация к оператору 🚨    │           │
└─────────────────────────────┘           │
                                           │
                  └────────────────────────┘
```

### 6.2 Developer Escalation

```
┌──────────────────┐
│  Review Failed   │
└────────┬─────────┘
         │
         ▼
    ┌─────────────────┐
    │ Attempt Counter │
    └────────┬────────┘
             │
    ┌────────┴────────┐
    │                 │
    ▼                 ▼
┌─────────┐       ┌─────────┐
│ 1, 2, 3 │       │ 4, 5    │
└────┬────┘       └────┬────┘
     │                 │
     ▼                 ▼
┌──────────────┐  ┌──────────────────┐
│ Claude Opus  │  │ GPT-5.3-Codex    │
└──────┬───────┘  └──────┬───────────┘
       │                 │
       └────────┬────────┘
                │
                ▼
         ┌──────────────┐
         │  Success?    │
         └──────┬───────┘
                │
       ┌────────┴────────┐
       │ YES             │ NO (after 5)
       ▼                 ▼
  ┌─────────┐      ┌────────────────┐
  │ Merge ✅│      │ Escalate to    │
  └─────────┘      │ Human Operator │
                   └────────────────┘
```

### 6.3 Consensus Logic

```
┌────────────────────────┐
│ Собрать все review     │
│ - Opus                 │
│ - Codex                │
│ - Gemini               │
│ - Copilot (optional)   │
└──────────┬─────────────┘
           │
           ▼
    ┌──────────────────┐
    │ Подсчитать       │
    │ APPROVED count   │
    └──────┬───────────┘
           │
           ▼
    ┌────────────────────┐      ┌──────────────┐
    │ Count >= 3?        │─YES──▶│ Консенсус ✅ │
    └────────┬───────────┘      └──────────────┘
             │ NO
             ▼
    ┌────────────────────────┐
    │ Извлечь все замечания  │
    │ с приоритетами         │
    └────────┬───────────────┘
             │
             ▼
    ┌─────────────────────────┐
    │ Удалить дубликаты       │
    │ (одна проблема от       │
    │ нескольких ревьюверов)  │
    └────────┬────────────────┘
             │
             ▼
    ┌─────────────────────────┐
    │ Приоритизировать        │
    │ P0 → P1 → P2+           │
    └────────┬────────────────┘
             │
             ▼
    ┌──────────────────────────┐
    │ Создать задачу           │
    │ для Developer            │
    └──────────────────────────┘
```

### 6.4 Sprint Planning Flow

```
┌───────────────┐
│ Получено ТЗ   │
└───────┬───────┘
        │
        ▼
┌─────────────────────┐
│ Создать worktree    │
│ и ветку             │
└───────┬─────────────┘
        │
        ▼
┌─────────────────────┐
│ Декомпозировать     │
│ задачи в Beads      │
└───────┬─────────────┘
        │
        ▼
┌─────────────────────┐
│ Установить          │
│ зависимости         │
└───────┬─────────────┘
        │
        ▼
┌─────────────────────┐
│ Делегировать        │
│ Developer'ам        │
└───────┬─────────────┘
        │
        ▼
┌─────────────────────┐
│ Мониторить прогресс │
│ (bd stats, blocked) │
└───────┬─────────────┘
        │
        ▼
┌─────────────────────┐      ┌───────────────┐
│ Все задачи готовы?  │─NO───▶│ Продолжить    │
└───────┬─────────────┘      └───────┬───────┘
        │ YES                        │
        ▼                            │
┌─────────────────────┐              │
│ Создать PR          │              │
└───────┬─────────────┘              │
        │                            │
        ▼                            │
┌─────────────────────┐              │
│ Запустить review    │              │
│ orchestrator        │              │
└───────┬─────────────┘              │
        │                            │
        ▼                            │
┌─────────────────────┐              │
│ Review-fix cycle    │──────────────┘
└───────┬─────────────┘
        │
        ▼
┌─────────────────────┐
│ Консенсус достигнут │
└───────┬─────────────┘
        │
        ▼
┌─────────────────────┐
│ Готово к merge      │
└─────────────────────┘
```

---

## 7. Критерии качества

### PM выполнил работу правильно, если:

✅ **Планирование:**
- Все задачи спринта созданы в Beads
- Зависимости установлены корректно
- Приоритеты соответствуют критичности

✅ **Review coordination:**
- Все 3 ревьювера запущены параллельно
- Copilot review дождался (или timeout)
- Отчёты опубликованы в PR с метаданными
- Developer-отчёт опубликован в PR после каждого цикла кодирования/исправлений
- Консенсус рассчитан корректно (3+ APPROVED)

✅ **Developer delegation:**
- Задачи делегированы с правильной моделью (Opus/Codex)
- Указана попытка (Attempt X/5)
- В описании есть все детали из review

✅ **Эскалация:**
- После 5 неудачных попыток задача эскалирована
- Отчёт для оператора полный и структурированный
- Статус задачи обновлен (`escalated`)

✅ **Прозрачность:**
- Все действия документированы
- В комментариях указана модель (Opus, Codex, Gemini)
- История попыток сохранена в PR

---

## 8. Чеклист PM при запуске

Перед началом работы PM должен выполнить:

```bash
# 1. Загрузить контекст Beads
bd prime

# 2. Проверить синхронизацию
bd sync --status
git status

# 3. Проверить health
bd doctor

# 4. Просмотреть задачи
bd ready                      # Доступные задачи
bd list --status=in_progress  # Активные задачи
bd blocked                    # Заблокированные задачи

# 5. Проверить статистику
bd stats
```

---

## 9. Глоссарий

| Термин | Определение |
|--------|-------------|
| **Консенсус** | 3 или более APPROVED от ревьюверов (из 4 возможных) |
| **Эскалация** | Передача задачи на следующий уровень: Opus → GPT-5.3-Codex → Человек |
| **Итерация** | Полный цикл review → fix → re-review |
| **pm-orchestrator** | Python-скрипт для автоматизации review цикла |
| **Синтез feedback** | Объединение замечаний от всех ревьюверов с удалением дубликатов |
| **Worktree** | Изолированная рабочая директория для отдельной ветки |

---

## 10. Ссылки

**Документы проекта:**

- [AGENT_ROLES.md](./AGENT_ROLES.md) — роли всех агентов
- [tools/pm_orchestrator.py](../tools/pm_orchestrator.py) — скрипт оркестрации

**Внешние ресурсы:**
- [Beads Documentation](https://github.com/steveyegge/beads)
- [GitHub CLI Manual](https://cli.github.com/manual/)

---

**Версия:** 1.0
**Последнее обновление:** 2026-01-26
**Автор:** Project Manager Agent
