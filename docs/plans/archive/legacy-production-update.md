# План обновления production-сервера: v0.7.8 → v0.8.5

## Контекст

**Текущее состояние сервера (147.45.147.175):**
- Образ: `slime-arena-monolith-full:0.7.8` (deprecated монолит — всё в одном контейнере)
- Контейнер `slime-arena`: Up, unhealthy (Redis RDB Permission denied — временно исправлено)
- Запущен через `docker run` — без docker-compose
- Нет директории `/root/slime-arena/`, файлы лежат в `/root/`
- Порты: 3000, 2567, 5173 (нет 5175 — Admin Dashboard отсутствует)
- Бэкап: `/root/backups/pre-update-2026-02-07-2157.sql` (1.7 МБ, свежий)

**Целевое состояние:**
- Split-архитектура: `slime-arena-db:0.8.5` + `slime-arena-app:0.8.5`
- docker-compose в `/root/slime-arena/`
- Порты: 3000, 2567, 5173, **5175** (Admin Dashboard)
- Health endpoint → 200 OK

**Даунтайм:** ~2-3 минуты (остановка старого → запуск нового → restore → миграции).

---

## Шаги

### 1. Проверить доступность Docker-образов v0.8.5

```bash
ssh ... 'docker pull ghcr.io/komleff/slime-arena-db:0.8.5 && docker pull ghcr.io/komleff/slime-arena-app:0.8.5'
```

Если образы не найдены — нужно сначала собрать и запушить через CI/CD (push в main или manual dispatch).

### 2. Подготовить структуру на сервере

```bash
mkdir -p /root/slime-arena
```

Скопировать `docker/docker-compose.app-db.yml` → `/root/slime-arena/docker-compose.yml`.
Источник: `docker/docker-compose.app-db.yml` (71 строка, version 0.8.5).

### 3. Подготовить `.env` на сервере

Секреты уже есть в `/root/.env.production` (285 байт). Копируем и дополняем:

```bash
cp /root/.env.production /root/slime-arena/.env
```

Затем добавить **одну новую переменную** (не было в v0.7.8):

```bash
echo "ADMIN_ENCRYPTION_KEY=$(openssl rand -base64 32)" >> /root/slime-arena/.env
```

Убедиться что в `.env` есть `OAUTH_YANDEX_ENABLED=true` (в compose по умолчанию `false`).

### 4. Остановить старый монолит

```bash
docker stop slime-arena
docker rm slime-arena
```

**С этого момента сервер недоступен.** Порты 3000, 2567, 5173 освобождаются.

### 5. Запустить DB-контейнер

```bash
cd /root/slime-arena
docker compose up -d db
```

Ждать healthy (healthcheck: `pg_isready`, start_period 30s):
```bash
docker compose ps   # State: Up (healthy)
```

entrypoint-db.sh создаст пустую БД `slime_arena` с пользователем `slime`.

### 6. Восстановить бэкап PostgreSQL

```bash
docker exec -i slime-arena-db psql -U slime -d slime_arena < /root/backups/pre-update-2026-02-07-2157.sql
```

Это восстановит все данные v0.7.8 (пользователи, профили, матчи, лидерборд).
Предупреждения `already exists` — нормально (seed-data уже создал часть объектов).

### 7. Запустить APP-контейнер

```bash
docker compose up -d app
```

Контейнер ждёт `db: service_healthy`, затем запускает 4 процесса:
- MetaServer (:3000), MatchServer (:2567), Client (:5173), Admin (:5175)

### 8. Применить миграции

```bash
docker exec slime-arena-app npm run db:migrate --workspace=server
```

Миграции идемпотентны (`CREATE TABLE IF NOT EXISTS`). На восстановленной БД v0.7.8:
- 001, 002 — пропустятся (таблицы уже есть)
- 007 — лидерборды, oauth_links (может быть частично)
- 008 — колонки guest-пользователей
- 009 — admin_users, admin_sessions, audit_log
- 010 — no-op

### 9. Обновить Nginx

Добавить блок `/admin/` в конфиг Nginx (если отсутствует):

```nginx
location /admin/ {
    proxy_pass http://127.0.0.1:5175/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Файл: `/etc/nginx/sites-available/slime-arena.overmobile.space`

```bash
nginx -t && systemctl reload nginx
```

### 10. Верификация

```bash
# Health
curl -s https://slime-arena.overmobile.space/health | jq .

# Guest auth
curl -s -X POST https://slime-arena.overmobile.space/api/v1/auth/guest \
  -H "Content-Type: application/json" -d '{}' | jq .

# Leaderboard (данные сохранены?)
curl -s "https://slime-arena.overmobile.space/api/v1/leaderboard?mode=total&limit=5" | jq .

# Admin Dashboard
curl -s -o /dev/null -w "%{http_code}" https://slime-arena.overmobile.space/admin/

# Docker status
docker compose ps
```

**Ожидаемый результат:**
- `/health` → 200, `{"status":"ok","database":"connected","redis":"connected"}`
- Лидерборд → данные совпадают с бэкапом (Дмитрий Комлев — 15573)
- `/admin/` → 200 (HTML страница)
- Оба контейнера `Up (healthy)`

---

## Откат (если что-то пошло не так)

```bash
cd /root/slime-arena
docker compose down

# Вернуть монолит
docker run -d --name slime-arena \
  --env-file /root/.env.production \
  -p 3000:3000 -p 2567:2567 -p 5173:5173 \
  ghcr.io/komleff/slime-arena-monolith-full:0.7.8
```

---

## Файлы, задействованные в миграции

| Файл | Роль |
|------|------|
| `docker/docker-compose.app-db.yml` | Compose-конфиг для сервера |
| `docker/entrypoint-db.sh` | Инициализация БД в контейнере |
| `server/src/db/migrate.ts` | Скрипт миграций (идемпотентный) |
| `server/src/db/migrations/001-010_*.sql` | 6 файлов миграций |
| `docs/operations/SERVER_SETUP.md` | Nginx-конфиг (reference) |
| `docs/operations/AI_AGENT_GUIDE.md` | Процедура обновления |
