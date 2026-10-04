# U2TagLab rigid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. PM delegates implementation inline; PM owns final independent review and remote delivery.

**Goal:** Добавить жёсткую бесшарнирную сцепку только в U2TagLab.

**Architecture:** Общая масса, COM, скорость и инерция с параллельной осью; две окружности вращаются как одно тело. Контакты действуют относительно общего COM. Захват nearest4 проецирует P/L на касательный состав и проверяет энергию/пути до commit.

**Tech Stack:** TypeScript, Canvas/Preact, существующий Node test runner; без зависимостей.

**Spec:** Beads bonk-race-555 и уточнения оператора/PM 4 октября: nearest4, общий продольный axis, nose/nose и tail/tail допустимы.

## Global Constraints

- Исходный checkout/U2 не менять; ветка feat/u2taglab-rigid-coupling.
- Комментарии только на русском; прежние три типа и schema1/2/3 сохраняются.
- Front/rear выбирает только стартовую конфигурацию; свободный захват ближайших креплений.
- Двигатели только A; поля могут действовать на оба тела.
- Сохранять COM/P/L, не добавлять энергию; невозможное соединение атомарно отклонить.
- Круглые корпуса, без инфраструктуры/версий/новых зависимостей.

## Review Focus

- Захват с вращением: энергия после snap может быть несовместима с сохранением L — атомарный отказ.
- Быстрое вращение у маленького препятствия: непрерывный поиск контактов должен учитывать дугу центра.
- Одновременный угол/контакт двух кругов: общий импульс без повторного A/B контакта.
- Самопересечение во время snap: блокировать путь, даже при свободных конечных позах.
- Старые ссылки и изменение настройки в полёте: исходное поведение и требование Restart.

### Task 1: Составная физика и захват

**Files:** Create client/src/u2taglab/physics/rigid.ts, rigidContacts.ts; Modify advanceWorld.ts, tuglab/labTowing.ts, types.ts, physics/advance.ts; Test tests/tuglab/u2taglab-rigid.test.cjs.

**Interfaces:** captureRigid(a,b,c,arena) возвращает проверенный кандидат без изменения входа; rigid assembly восстанавливает тела после интеграции общего COM/angle.

- [x] Написать и увидеть RED: nearest4/tangent/COM/P/L/K, front/rear, двигатель/момент, препятствия/CCD/guards.
- [x] Реализовать состав и transactional capture/advance.
- [x] GREEN адресных и всей test:tuglab.

### Task 2: Ссылки, интеграция и настройки

**Files:** Modify u2taglab/share.ts, profile.ts, ui/paramDefs.ts, lab/BonkLab.ts; Test u2taglab-rigid-runtime.test.cjs.

**Interfaces:** schema4/u2-space-circles-rigid-v5 сохраняет tow.rigidArrangement; schema1/2/3 остаются точными прежними контрактами.

- [x] RED обоих reset arrangements, nearest4 реального lab, атомарного отказа, strict share и legacy.
- [x] Реализовать UI/экспорт/импорт/Restart и скрытие неподходящих полей.
- [x] GREEN адресных и полной suite; root/nested browser smoke.

### Task 3: Проверка и документация

**Files:** Modify docs/U2TagLab-Guide.md и .memory_bank/{activeContext,systemPatterns,progress}.md.

- [x] Проверить полный test:tuglab, npm test, typechecks и существующие builds.
- [x] Сохранить результаты/ограничения; обновить Guide/Memory.
- [x] Commit; передать PM для независимого review и push/PR.
