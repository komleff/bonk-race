# Обновление README.md — убрать монолит, исправить устаревшие факты

## Контекст

README.md содержит Docker-секцию, привязанную к v0.4.0, и ссылку на несуществующий `docker-compose.monolith.yml`. Проект на v0.8.7, production использует split-архитектуру (app+db). Монолит больше не нужен — production-сервер уже развёрнут.

Также найдены: отсутствующий Redis в стеке, неполная структура проекта, мёртвый домен, устаревшие ссылки на «Sprint 3».

---

## Конкретные изменения в README.md

### 1. Технологический стек (строка 41)

Добавить Redis:
```
- **Инфраструктура**: Docker, GitHub Actions (CI/CD), PostgreSQL, Redis.
```

### 2. Структура проекта (строки 69-76)

Добавить `admin-dashboard/` и `.agents/`:
```
- [admin-dashboard/](admin-dashboard/) — Админ-панель (Preact).
- [.agents/](.agents/) — Роли и регламенты ИИ-агентов.
```

### 3. «Sprint 3 завершён» (строка 149)

Убрать упоминание конкретного спринта:
```
**Статус: ✅ 19/19 тестов пройдены.**
```

### 4. «17 тестов» → «19 тестов» (строка 158)

```
# 3. В другом терминале — Stage D тесты (19 тестов)
```

### 5. Docker секция (строки 188-318) — капитальная переделка

**Удалить полностью:**
- «Запуск в Docker (Stable Release)» с `docker-compose.yml` (dev-ориентированный, устаревший v0.4.0)
- «Доступные сервисы v0.4.0»
- «Load Tests (k6)» — перенести выше, к тестированию
- «Backup & Restore» — перенести выше, к тестированию
- «Монолит (рекомендуется для быстрого старта)»
- «Удалённое развёртывание»
- «Образы v0.4.0»
- «Apple Silicon»

**Заменить на компактную секцию:**
```markdown
## Docker

Production: split-архитектура (2 контейнера).

| Контейнер | Содержание | Порты |
|-----------|-----------|-------|
| `slime-arena-app` | MetaServer + MatchServer + Client + Admin | 3000, 2567, 5173, 5175 |
| `slime-arena-db` | PostgreSQL 16 + Redis 7 | 5432, 6379 |

Образы: `ghcr.io/komleff/slime-arena-app`, `ghcr.io/komleff/slime-arena-db` (multi-arch: amd64/arm64).

Подробности: [docs/operations/SERVER_SETUP.md](docs/operations/SERVER_SETUP.md)
```

### 6. Production Deployment (строки 320-351) — упростить

**Удалить:** мёртвый домен `slime-arena-server.overmobile.space`, устаревший код WebSocket auto-detection, Domain Configuration.

**Заменить на:**
```markdown
## Production

**URL:** <https://slime-arena.overmobile.space>

Nginx проксирует HTTP, WebSocket и Admin Dashboard через один домен.
Второй домен: <https://slime-arena.u2game.space>

Документация: [SERVER_SETUP.md](docs/operations/SERVER_SETUP.md) | [SERVER_UPDATE.md](docs/operations/SERVER_UPDATE.md)
```

### 7. Load Tests и Backup — перенести в секцию «Тестирование»

Секции «Load Tests (k6)» и «Backup & Restore» переезжают вверх, под «Тестирование» (строка 138), чтобы не теряться в удалённой Docker-секции.

---

## Изменения в CLAUDE.md

### Порт клиента (строка 65)

```
npm run dev:client      # http://localhost:5173
```
(Было: 5174, в `vite.config.ts` указан 5173.)

---

## Файлы

1. `README.md` — 7 правок
2. `CLAUDE.md` — 1 строка

## Ветка

`docs/readme-update` от main → PR в main.

## Проверка

- `grep "v0.4.0\|monolith\.yml\|slime-arena-server" README.md` → пусто
- `grep "Redis" README.md` → найден в стеке
- `grep "admin-dashboard" README.md` → найден в структуре
- `grep "5174" CLAUDE.md` → пусто
