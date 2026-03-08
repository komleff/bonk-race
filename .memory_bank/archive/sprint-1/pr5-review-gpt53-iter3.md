## Review by GPT-5.3-Codex

### Чеклист
- [x] Изучены комментарии в PR (включая предыдущие отчеты и свежий developer report)
- [x] Сборка проходит (`npm run build`)
- [x] Тесты проходят (`npm run test`, включая determinism)
- [x] P1 из прошлой итерации по guest FK и guest PB частично закрыты
- [ ] Полное закрытие security-рисков (P0/P1)

### Замечания
1. **[P0]** `client/src/raceMain.ts:507`, `server/src/meta/routes/runs.ts:64`, `server/src/meta/routes/runs.ts:79`, `server/src/meta/routes/runs.ts:103` — coin farm prevention все еще обходится.
`coinsCollected` и `finishMs` остаются клиент-контролируемыми. Начисление теперь идет только при `isNewRecord`, но рекорд тоже определяется по клиентскому `finishMs`. Атакующий может отправлять серию искусственно улучшающихся значений (`600000 -> 599999 -> ...`) и получать награду на каждом шаге.
2. **[P1]** `client/src/api/metaServerClient.ts:176`, `server/src/meta/routes/runs.ts:42` — серверная идемпотентность submit не реализована.
Клиент отправляет `operationId` через `postIdempotent`, но `/api/v1/runs/submit` не читает и не валидирует `operationId`, не использует таблицу `transactions` и не имеет уникального idempotency-ключа.
3. **[P2]** `server/src/meta/routes/runs.ts:51`, `server/src/meta/routes/runs.ts:59`, `client/src/game/GhostRecorder.ts:44` — replayData валидируется неполно.
Есть проверки массива/лимита/кратности 4, но нет проверки, что элементы — конечные числа (`Number.isFinite`) и в допустимых диапазонах.
4. **[P2]** `server/src/meta/routes/auth.ts:111`, `server/src/meta/routes/ghosts.ts:78` — после фикса guest FK создается только запись в `users`, но не в `profiles`; при этом opponent ghost выбирается через `JOIN profiles`. В результате гостевые записи не участвуют в выборе opponent, и пайплайн ghost для guest-user остается неполным в части rival.
5. **[P3]** `server/src/meta/routes/runs.ts:17` — `MAX_COINS_PER_RUN` остается захардкоженной балансной константой в route-коде.

### Вердикт
**CHANGES_REQUESTED** — требуется закрыть P0/P1 замечания перед merge.