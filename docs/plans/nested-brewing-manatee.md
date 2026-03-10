# Обратный отсчёт 3-2-1-Go! и Go!-Go! при респауне

## Контекст

В BonkLab и основной игре (raceMain) при старте гонки и после рестарта нет полноценного обратного отсчёта — показывается только «Go!». По запросу оператора нужно:

1. **Старт гонки / Restart:** показывать 3 → 2 → 1 → Go! крупным шрифтом, по 0.7с на каждый шаг (итого 2.8с), физика заморожена
2. **После смерти:** показывать Go! → Go! (два кадра), по 0.4с каждый (итого 0.8с), крупным шрифтом как при старте

Скоуп: оба модуля — BonkLab (sandbox) и raceMain (основная гонка).

Дополнительно: почистить локальные ветки (`fix/lab-input-direction` — уже замержена).

---

## Beads-задачи (создать перед началом работы)

### Задача 1: `feat/countdown-start`

```bash
bd create --title="Обратный отсчёт 3-2-1-Go! при старте гонки" \
  --type=feature \
  --priority=1 \
  --description="**Местоположение:**
- BonkLab: client/src/lab/BonkLab.ts, LabRenderer.ts, LabToolbar.tsx
- Main game: client/src/raceMain.ts

**Требование:**
При старте гонки и после Restart показывать 3→2→1→Go! крупным шрифтом (96px).
Каждый шаг 0.7с, итого 2.8с. Физика и ввод заморожены до окончания.

**Решение:**
1. Добавить startCountdown таймер в BonkLab.ts
2. Заменить CSS-оверлей LabToolbar на canvas-рендер в LabRenderer
3. Изменить тайминг в raceMain.ts с 1с на 0.7с per step
4. Вынести константы в shared/src/constants.ts"
```

### Задача 2: `feat/death-go-go`

```bash
bd create --title="Go!-Go! оверлей после смерти (2×0.4с)" \
  --type=feature \
  --priority=1 \
  --description="**Местоположение:**
- BonkLab: client/src/lab/BonkLab.ts, LabRenderer.ts
- Main game: client/src/raceMain.ts

**Требование:**
После death freeze (0.8с) показывать Go!→Go! (2 кадра по 0.4с = 0.8с).
Крупный шрифт (96px), как при стартовом countdown.
Физика заморожена до окончания.

**Решение:**
1. Изменить respawnCountdown логику в BonkLab для 2-step Go!
2. Добавить deathFreezeTicks + respawnGoTicks в raceMain.ts
3. Рендер Go!-Go! в LabRenderer и renderHUD"
```

---

## План реализации

### Ветка: `feat/countdown-and-respawn-overlay`

### Шаг 0: Подготовка

```bash
git checkout main && git pull
git branch -d fix/lab-input-direction  # уже замержена
git checkout -b feat/countdown-and-respawn-overlay
```

### Шаг 1: Константы в shared

**Файл:** [shared/src/constants.ts](shared/src/constants.ts)

Добавить секцию:

```typescript
// ─── Countdown / respawn timing ─────────────────────────────────────────────
export const COUNTDOWN_STEP_S = 0.7;            // время одного шага (3/2/1/Go!)
export const COUNTDOWN_STEPS = ["3", "2", "1", "Go!"] as const;
export const COUNTDOWN_TOTAL_S = COUNTDOWN_STEP_S * COUNTDOWN_STEPS.length; // 2.8с
export const DEATH_FREEZE_S = 0.8;              // заморозка после смерти
export const RESPAWN_GO_STEP_S = 0.4;           // время одного Go! при респауне
export const RESPAWN_GO_STEPS = 2;              // количество Go! при респауне
export const RESPAWN_GO_TOTAL_S = RESPAWN_GO_STEP_S * RESPAWN_GO_STEPS; // 0.8с
```

Экспортировать из [shared/src/index.ts](shared/src/index.ts).

### Шаг 2: BonkLab — логика countdown

**Файл:** [client/src/lab/BonkLab.ts](client/src/lab/BonkLab.ts)

1. Заменить локальный `DEATH_FREEZE_S` (строка 113) на import из shared
2. Добавить приватное поле `private startCountdown = 0`
3. Добавить `startCountdown: number` в интерфейс `SandboxState` (строка ~88)
4. Экспортировать в `getState()`: `startCountdown: this.startCountdown`

**Изменить `start()`** — вместо немедленного начала физики:

```typescript
start(): void {
    this.startCountdown = COUNTDOWN_TOTAL_S;
    this.running = true;
    this.lastTimestamp = 0;
    this.accumulator = 0;
    this.rafId = requestAnimationFrame((ts) => this.loop(ts));
}
```

**Изменить `tick()` (строка 574)** — добавить блок перед `if (this.finished)`:

```typescript
// Стартовый обратный отсчёт — физика заморожена
if (this.startCountdown > 0) {
    this.startCountdown -= dt;
    if (this.startCountdown <= 0) this.startCountdown = 0;
    return;
}
```

**Изменить `reset()`** — добавить `this.startCountdown = 0`

**Изменить строку 599** — `respawnCountdown = DEATH_FREEZE_S` → `respawnCountdown = RESPAWN_GO_TOTAL_S`

### Шаг 3: BonkLab — рендер countdown

**Файл:** [client/src/lab/LabRenderer.ts](client/src/lab/LabRenderer.ts)

Заменить блок "Go!" (строки 170-181) на метод `drawCountdownOverlay()`.

**Стиль анимации (Mario Kart punch-in):**

- Каждый шаг: число **появляется крупно** (scale 2.0) и **быстро сжимается** к 1.0 за ~60% шага (easeOut)
- Оставшиеся ~40% шага — число стоит на scale 1.0, затем **резко исчезает** (без fade-out!)
- **"Go!"** — усиленный акцент: scale начинается с 2.5, цвет ярко-жёлтый, shadow glow
- При респауне Go!-Go! — тот же punch-in стиль, второй Go! с ещё большим glow (подчёркивает момент старта)

```typescript
private drawCountdownOverlay(
    ctx: CanvasRenderingContext2D,
    state: SandboxState,
    w: number,
    h: number,
): void {
    let label: string;
    let progress: number; // 0..1 внутри шага
    let isRespawn = false;
    let stepInSequence = 0; // для усиления второго Go! при респауне

    if (state.startCountdown > 0) {
        const elapsed = COUNTDOWN_TOTAL_S - state.startCountdown;
        const stepIdx = Math.min(
            Math.floor(elapsed / COUNTDOWN_STEP_S),
            COUNTDOWN_STEPS.length - 1,
        );
        label = COUNTDOWN_STEPS[stepIdx];
        progress = (elapsed % COUNTDOWN_STEP_S) / COUNTDOWN_STEP_S;
    } else if (state.respawnCountdown > 0) {
        label = "Go!";
        isRespawn = true;
        const elapsed = RESPAWN_GO_TOTAL_S - state.respawnCountdown;
        stepInSequence = Math.floor(elapsed / RESPAWN_GO_STEP_S);
        progress = (elapsed % RESPAWN_GO_STEP_S) / RESPAWN_GO_STEP_S;
    } else {
        return;
    }

    const isGo = label === "Go!";

    // Punch-in: scale 2.0→1.0 (или 2.5→1.0 для Go!) за 60% шага, easeOut
    const punchPhase = Math.min(progress / 0.6, 1); // 0..1 за первые 60%
    const eased = 1 - (1 - punchPhase) * (1 - punchPhase); // easeOutQuad
    const startScale = isGo ? 2.5 : 2.0;
    const scale = startScale - (startScale - 1.0) * eased;

    // Видимость: полная до 85% шага, затем резкое исчезновение
    const alpha = progress < 0.85 ? 1.0 : Math.max(0, 1 - (progress - 0.85) / 0.15);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.font = "bold 96px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Glow для Go! (сильнее для второго Go! при респауне)
    if (isGo) {
        const glowSize = isRespawn && stepInSequence === 1 ? 30 : 20;
        ctx.shadowColor = "rgba(255, 255, 100, 0.8)";
        ctx.shadowBlur = glowSize * (1 - eased * 0.5); // glow затухает с punch-in
    }

    ctx.fillStyle = isGo
        ? `rgba(255, 255, 100, ${alpha})`
        : `rgba(255, 255, 255, ${alpha})`;
    ctx.fillText(label, 0, 0);
    ctx.restore();
}
```

В `render()` вызвать:

```typescript
// ── Countdown / respawn overlay (punch-in стиль) ──
this.drawCountdownOverlay(ctx, state, w, h);
```

### Шаг 4: Убрать CSS-оверлей из LabToolbar

**Файл:** [client/src/lab/ui/LabToolbar.tsx](client/src/lab/ui/LabToolbar.tsx)

Упростить `handleRestart` (строки 237-267):

```typescript
const handleRestart = useCallback(() => {
    lab.stop();
    lab.reset();
    lab.start(); // start() внутри ставит startCountdown = 2.8с
    setElapsed(0);
}, [lab]);
```

Удалить: `countdown` state, `restartIntervalRef`, useEffect для cleanup, JSX оверлея.

**Файл:** [client/src/lab/ui/lab-toolbar.css](client/src/lab/ui/lab-toolbar.css)

Удалить `.lab-countdown-overlay`, `.lab-countdown-text`, `@keyframes lab-countdown-pop` (строки 197-229).

### Шаг 5: raceMain — исправить тайминг countdown

**Файл:** [client/src/raceMain.ts](client/src/raceMain.ts)

**5a.** Импортировать константы из shared:

```typescript
import { COUNTDOWN_STEP_S, COUNTDOWN_STEPS, COUNTDOWN_TOTAL_S, DEATH_FREEZE_S, RESPAWN_GO_STEP_S, RESPAWN_GO_TOTAL_S } from "@bonk-race/shared";
```

**5b.** Изменить `start()` (строка 493):

```typescript
// 4 шага по 0.7с = 84 тика при 30Hz
this.countdownTicks = Math.ceil(COUNTDOWN_TOTAL_S * this.config.physics.tickRate);
```

**5c.** Изменить рендер countdown в `renderHUD()` (строки 707-711):

Тот же punch-in стиль, что и в BonkLab:

```typescript
if (phase === RACE_PHASE_COUNTDOWN) {
    const tickRate = this.config.physics.tickRate;
    const totalTicks = Math.ceil(COUNTDOWN_TOTAL_S * tickRate);
    const stepTicks = Math.ceil(COUNTDOWN_STEP_S * tickRate);
    const elapsed = totalTicks - this.countdownTicks;
    const stepIdx = Math.min(Math.floor(elapsed / stepTicks), COUNTDOWN_STEPS.length - 1);
    const label = COUNTDOWN_STEPS[stepIdx];
    const progress = (elapsed % stepTicks) / stepTicks;
    const isGo = label === "Go!";

    // Punch-in: scale 2.0→1.0 (2.5 для Go!) за 60% шага, easeOutQuad
    const punchPhase = Math.min(progress / 0.6, 1);
    const eased = 1 - (1 - punchPhase) * (1 - punchPhase);
    const startScale = isGo ? 2.5 : 2.0;
    const scale = startScale - (startScale - 1.0) * eased;
    // Резкое исчезновение в последние 15%
    const alpha = progress < 0.85 ? 1.0 : Math.max(0, 1 - (progress - 0.85) / 0.15);

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.font = `bold ${fontSize * 4}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = alpha;
    if (isGo) {
        ctx.shadowColor = "rgba(255, 255, 100, 0.8)";
        ctx.shadowBlur = 20;
    }
    ctx.fillStyle = isGo ? "#ffff66" : "#ffffff";
    ctx.fillText(label, 0, 0);
    ctx.restore();
}
```

### Шаг 6: raceMain — death freeze + Go!-Go!

**Файл:** [client/src/raceMain.ts](client/src/raceMain.ts)

**6a.** Добавить поля:

```typescript
private deathFreezeTicks = 0;
private respawnGoTicks = 0;
```

**6b.** Изменить блок `else` после `if (!this.player.isDead)` (строки 601-604):

```typescript
} else if (this.deathFreezeTicks > 0) {
    // Фаза заморозки после смерти (0.8с)
    this.deathFreezeTicks--;
    if (this.deathFreezeTicks <= 0) {
        this.respawn();
        this.respawnGoTicks = Math.ceil(RESPAWN_GO_TOTAL_S * this.config.physics.tickRate);
    }
} else if (this.respawnGoTicks > 0) {
    // Go!-Go! фаза — ввод заморожен
    this.respawnGoTicks--;
} else {
    // Первый тик после смерти — начать death freeze
    this.deathFreezeTicks = Math.ceil(DEATH_FREEZE_S * this.config.physics.tickRate);
}
```

**Проблема:** после `respawn()` `isDead = false`, поэтому следующий тик пойдёт в `if (!this.player.isDead)`. Нужно добавить проверку `respawnGoTicks` в условие:

```typescript
if (!this.player.isDead && this.respawnGoTicks <= 0) {
    // Нормальная физика
    flightAssistSystem(...);
    physicsSystem(...);
    collisionSystem(...);
    if (this.player.isDead) {
        this.deathFreezeTicks = Math.ceil(DEATH_FREEZE_S * this.config.physics.tickRate);
        return;
    }
    // ... checkpoint, recorder ...
} else if (this.player.isDead) {
    if (this.deathFreezeTicks > 0) {
        this.deathFreezeTicks--;
        if (this.deathFreezeTicks <= 0) {
            this.respawn();
            this.respawnGoTicks = Math.ceil(RESPAWN_GO_TOTAL_S * this.config.physics.tickRate);
        }
    }
} else {
    // respawnGoTicks > 0 — Go!-Go! freeze
    this.respawnGoTicks--;
}
```

**6c.** Рендер Go!-Go! в `renderHUD()` (в блоке `RACE_PHASE_RACING`):

```typescript
// Go!-Go! при респауне (punch-in, как при старте)
if (this.respawnGoTicks > 0) {
    const tickRate = this.config.physics.tickRate;
    const totalTicks = Math.ceil(RESPAWN_GO_TOTAL_S * tickRate);
    const stepTicks = Math.ceil(RESPAWN_GO_STEP_S * tickRate);
    const elapsed = totalTicks - this.respawnGoTicks;
    const stepInSequence = Math.floor(elapsed / stepTicks);
    const progress = (elapsed % stepTicks) / stepTicks;

    const punchPhase = Math.min(progress / 0.6, 1);
    const eased = 1 - (1 - punchPhase) * (1 - punchPhase);
    const scale = 2.5 - 1.5 * eased;
    const alpha = progress < 0.85 ? 1.0 : Math.max(0, 1 - (progress - 0.85) / 0.15);
    const glowSize = stepInSequence === 1 ? 30 : 20; // второй Go! ярче

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.font = `bold ${fontSize * 4}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(255, 255, 100, 0.8)";
    ctx.shadowBlur = glowSize * (1 - eased * 0.5);
    ctx.fillStyle = "#ffff66";
    ctx.fillText("Go!", 0, 0);
    ctx.restore();
}
```

**6d.** Сбросить таймеры в `restart()` (после строки 534):

```typescript
this.deathFreezeTicks = 0;
this.respawnGoTicks = 0;
```

---

## Файлы для изменения

| Файл | Изменения |
|---|---|
| `shared/src/constants.ts` | Константы таймингов countdown и respawn |
| `shared/src/index.ts` | Реэкспорт новых констант |
| `client/src/lab/BonkLab.ts` | `startCountdown` поле, import shared, tick/start/reset/getState |
| `client/src/lab/LabRenderer.ts` | `drawCountdownOverlay()` — 3-2-1-Go! и Go!-Go! |
| `client/src/lab/ui/LabToolbar.tsx` | Убрать CSS countdown, упростить handleRestart |
| `client/src/lab/ui/lab-toolbar.css` | Убрать overlay/animation стили |
| `client/src/raceMain.ts` | Тайминг 0.7с, deathFreeze+respawnGo, HUD рендер |

---

## Верификация

1. `npm run build` — проект собирается без ошибок
2. `npm run test` — тесты проходят (determinism, orb-bite, arena-generation)
3. `npm run dev:client` → открыть `/lab`:
   - При загрузке — 3→2→1→Go! крупным шрифтом, физика заморожена 2.8с
   - Restart — тот же countdown
   - Врезаться в шип → 0.8с freeze → Go!→Go! (два кадра по 0.4с)
   - Шрифт Go! при респауне = тот же размер что при старте (96px)
4. Основная игра (если доступна) — аналогичная проверка через raceMain
5. Субагент-ревью перед PR
