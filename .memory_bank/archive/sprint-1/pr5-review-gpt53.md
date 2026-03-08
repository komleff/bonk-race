## Review by GPT-5.3-Codex

### Чеклист
- [x] Изучены все комментарии PR (Copilot reviewer + 2 ручных отчета в треде)
- [x] Сборка проходит (`npm run build`)
- [x] Тесты проходят (`npm run test`, включая `determinism.test.js`)
- [x] SQL-инъекции не обнаружены (запросы параметризованы)
- [ ] Полное соответствие security/architecture требованиям
- [ ] Нет hardcoded констант баланса

### Замечания
1. **[P0]** `client/src/raceMain.ts:507`, `server/src/meta/routes/runs.ts:64`, `server/src/meta/routes/runs.ts:97` — экономическая уязвимость осталась: `coinsCollected` приходит с клиента и напрямую влияет на начисление валюты. Добавлен cap `MAX_COINS_PER_RUN`, но сервер не пересчитывает награду по серверным данным и не обеспечивает идемпотентность начисления. Авторизованный пользователь может отправлять повторные `POST /runs/submit` и фармить валюту.
2. **[P1]** `server/src/meta/middleware/auth.ts:53`, `server/src/meta/routes/auth.ts:104`, `server/src/meta/routes/runs.ts:75`, `server/src/db/migrations/011_race_leaderboard.sql:5`, `server/src/db/migrations/012_ghost_replays.sql:5` — заявленный guest loop архитектурно сломан: guest токен теперь проходит `requireAuth`, но `POST /auth/guest` не создает пользователя в БД, а `race_leaderboard`/`ghost_replays` требуют `user_id REFERENCES users(id)`. Для гостя submit приводит к ошибке транзакции (500) вместо сохранения результата.
3. **[P1]** `client/src/raceMain.ts:810`, `server/src/meta/routes/ghosts.ts:39` — PB ghost для гостя не работает: клиент отправляет guest Bearer, но `/api/v1/ghosts` извлекает пользователя только через `verifyAccessToken`, поэтому ветка personal best недоступна для единственного auth-flow этого PR.
4. **[P2]** `server/src/meta/routes/runs.ts:51`, `server/src/meta/routes/runs.ts:55`, `server/src/meta/routes/runs.ts:59`, `client/src/game/GhostRecorder.ts:44` — валидация replayData неполная: проверяются только «массив/лимит/кратность 4», но не проверяются тип/конечность чисел и допустимые диапазоны. Мусорные/NaN значения можно записать в JSONB и затем без фильтра распаковать на клиенте.
5. **[P2]** `server/src/meta/routes/runs.ts:17` — балансная константа `MAX_COINS_PER_RUN` захардкожена в коде сервера, хотя по правилам проекта баланс должен идти из конфигурации, а не из route-level констант.

### Вердикт
**CHANGES_REQUESTED** — требуется исправить P0/P1 замечания перед merge.