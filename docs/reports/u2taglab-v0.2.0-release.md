# Выпуск U2TagLab0.2.0 / BonkRacev0.6.4

Дата:4 октября2026. Оператор явно поручил публикацию принятого патча; дополнительных изменений gameplay при выпуске не было.

- PR44 слит через GitHub после3 product APPROVED, scoped QA/metadata Quality и зелёных release checks. Прямого push main нет.
- SOURCE_SHA/tag: `058fcc0e6d09673a4b1e0eaec8fede8b7bf488f9`; дерево совпадает с проверенным `dd31d1f`. BonkRace0.6.4/U2TagLab0.2.0 синхронизированы; dependency graph lockfile прежний.
- Свежие435/435, npm test и check-version PASS; PR packaging[37200789859](https://github.com/komleff/bonk-race/actions/runs/37200789859) SUCCESS. Архивы отдельно собраны на точном merge commit; stamped root/nested actualbutton14 PASS.
- Pages[37201164371](https://github.com/komleff/bonk-race/actions/runs/37201164371) build/deploy SUCCESS. Live Chrome390: BonkLab/TugLab/U2TagLab HTTP200, правильные режимы, stamp058fcc0/v0.6.4, U2v0.2.0; реальные настройки rigidfront/rear/Restart касаются без зазора, Share exact snapshot; точная userS/L180 ссылка восстанавливается после Reset; Canvas выводит401т.7 checks/errors[].
- Ранние2 live попытки имели Chrome ERR_SOCKET_NOT_CONNECTED при сетевом переходе к свежему получателю. Первые страницы/режимы/масса уже прошли. Новый запуск HTTP/1.1 прошёл полностью; TLS-проверка сохранялась. Публичный JS имеет SHA256 `f9506ede570c82ec429a7871f119a0ffded9311fee67dc47082441bc990d5cf4` и совпадает с локальным release bundle побайтно.
- [GitHub Releasev0.6.4](https://github.com/komleff/bonk-race/releases/tag/v0.6.4) опубликован с notes и четырьмя assets. Обе повторно скачанные tar.gz совпали по байтам с подготовленными; manifestSOURCE_SHA равен тегу, SHA256 files и API digest совпадают.

| Архив | SHA256 |
|---|---|
| tuglab-static.tar.gz | f750dadf2cb5139c72a121b1ae3d300ff03310d4d9fcd8b10ff84dfc74f5f5cd |
| u2taglab-static.tar.gz | bcac454c6d4304ab9f02bfde382fcf8581786d76154980cc9a78816de37e2af5 |

[Играть](https://komleff.github.io/bonk-race/u2taglab/) · [Описание нового](../releases/v0.6.4-release-notes.md)

Известный отдельный Docker558 повторён на[37201164381](https://github.com/komleff/bonk-race/actions/runs/37201164381): runtime npm ci не находит install-hooks.js. Это не Pages/архивы; failure записан в существующий backlog. Численный бюджет/круглые корпуса/governor572/passiveB571 остаются ограничениями; новая приёмка физического Android не заявляется. Оригинальный checkout, stash и U2 сохранены. Логи/PNG/JSON автора выпуска: `/tmp/bonk-tuglab-tools/release-v0.6.4/`.
