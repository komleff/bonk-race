# Plan: BonkLab Decomposition Refactoring

**Epic**: bonk-race-wig (P2)
**Branch**: `refactor/bonklab-decomposition` (from `main`)
**PM**: Claude (PM role)

---

## Context

BonkLab.ts (1168 строк) — God Object с 8 ответственностями в одном `tick()` методе (340 строк).
Каждая новая фича (trail coloring, spike knockback) раздувает файл дальше.
Архитектор (коммит 609283e) создал план декомпозиции на 7 задач в 2 фазы.

**Цель**: разбить BonkLab на 7 сфокусированных модулей без изменения поведения.

---

## Execution Order

```
Phase 1 (параллельно, без зависимостей):
  coe → paramDefs.ts        (данные LabPanel)
  9xw → colorUtils.ts       (утилиты LabRenderer)
  6th → presets.ts           (данные LabToolbar + main.ts)
  cm1 → labConstants.ts      (formatTime + ZONE_LABELS дедупликация)

Phase 2 (последовательно, зависят от r94):
  r94 → labTypes.ts          (типы SandboxState, SandboxOrb)
  pk5 → LabParamManager      (зависит от r94)
  6jf → OrbSimulator          (зависит от r94)
```

---

## Task 1: bonk-race-coe — PARAM_GROUPS -> paramDefs.ts

**New file**: `client/src/lab/ui/paramDefs.ts`

Extract from `LabPanel.tsx`:
- `ParamDef` interface (lines 16-30)
- `GroupDef` interface (lines 32-35)
- `PARAM_GROUPS` const (lines 39-658, ~620 lines)

**Changes to `LabPanel.tsx`**:
- Remove extracted code
- Add: `import { PARAM_GROUPS, type ParamDef, type GroupDef } from "./paramDefs";`

**Result**: LabPanel.tsx drops from 1099 to ~440 lines.

---

## Task 2: bonk-race-9xw — color utils -> colorUtils.ts

**New file**: `client/src/lab/colorUtils.ts`

Extract from `LabRenderer.ts` (lines 82-155):
- `hexToRgb(hex)` — line 82
- `rgbToHex(r, g, b)` — line 94
- `lerpColor(c1, c2, t)` — line 101
- `hslToHex(h, s, l)` — line 117
- `normalizeAngle(angle)` — line 141
- `getDriftAngle(vx, vy, heading)` — line 151

All functions are used ONLY within LabRenderer.ts. Export all 6.

**Changes to `LabRenderer.ts`**:
- Remove lines 77-155 (comment header + 6 functions)
- Add: `import { hexToRgb, lerpColor, hslToHex, normalizeAngle, getDriftAngle } from "./colorUtils";`
- Note: `rgbToHex` is only used internally by the other functions, no direct import needed in LabRenderer

**Result**: LabRenderer.ts drops from 1106 to ~1030 lines.

---

## Task 3: bonk-race-6th — PRESETS -> presets.ts + dedup

**New file**: `client/src/lab/ui/presets.ts`

Extract from `LabToolbar.tsx`:
- `Preset` interface (lines 13-16)
- `PRESETS` array (lines 18-210, ~193 lines)

Export: `PRESETS`, `Preset`, `DEFAULT_PRESET_IDX = 3`

**Changes to `LabToolbar.tsx`**:
- Remove extracted code
- Add: `import { PRESETS, DEFAULT_PRESET_IDX, type Preset } from "./presets";`
- Replace hardcoded `3` on line 399 with `DEFAULT_PRESET_IDX`

**Changes to `main.ts`**:
- Remove `STARTUP_PRESET` block (lines 40-59)
- Add: `import { PRESETS, DEFAULT_PRESET_IDX } from "./ui/presets";`
- Apply preset: `for (const [key, val] of Object.entries(PRESETS[DEFAULT_PRESET_IDX].values)) { lab.updateParams(key, val); }`

**Result**:
- LabToolbar.tsx drops from 573 to ~370 lines
- main.ts: removes 20 duplicate lines
- Single source of truth for presets

---

## Task 4: bonk-race-cm1 — formatTime + ZONE_LABELS dedup -> labConstants.ts

**New file**: `client/src/lab/labConstants.ts`

### formatTime

Two different implementations exist:
- `TelemetryHUD.ts:55` — format `MM:SS.S` (padded minutes)
- `LabToolbar.tsx:214` — format `M:SS.D` (no padded minutes)

Create unified function:
```ts
export function formatTime(seconds: number, padMinutes = false): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const mm = padMinutes ? String(mins).padStart(2, "0") : String(mins);
    const ss = secs.toFixed(1).padStart(4, "0");
    return `${mm}:${ss}`;
}
```

### ZONE_LABELS

Three locations, inconsistent:
- `TelemetryHUD.ts:40-44` — 3 zones (ice, turbo, mud), **missing sand**
- `LabRenderer.ts:403` — 4 zones inline (ice, mud, turbo, sand)
- `BonkLab.ts:57-64` — zone surfaces (4 zones)

Create unified constant:
```ts
export const ZONE_LABELS: Record<string, string> = {
    ice: "Led",       // "Лёд"
    mud: "Gryaz",     // "Грязь"
    turbo: "Turbo",   // "Турбо"
    sand: "Pesok",    // "Песок"
};
```

### FA_LABELS

Also extract from `TelemetryHUD.ts:32-37`:
```ts
export const FA_LABELS: Record<string, string> = {
    accel: "Razgon",
    brake: "Tormozhenie",
    "drift-correction": "Dreyf-korrektsiya",
    idle: "Kholostoy khod",
};
```

**Changes**:
- `TelemetryHUD.ts`: remove local `ZONE_LABELS`, `FA_LABELS`, `formatTime`; import from `./labConstants`
- `LabToolbar.tsx`: remove local `formatTime`; import from `../labConstants`
- `LabRenderer.ts`: import `ZONE_LABELS` from `./labConstants` for the zone label usage at line ~403

**Result**: Sand zone bug in TelemetryHUD fixed. Single source of truth for labels.

---

## Task 5: bonk-race-r94 — labTypes.ts (types extraction)

**New file**: `client/src/lab/labTypes.ts`

Extract from `BonkLab.ts`:
- `SandboxOrb` interface (lines 68-78)
- `SandboxState` interface (lines 80-135)

**Changes**:
- `BonkLab.ts`: remove interfaces, add `import type { SandboxOrb, SandboxState } from "./labTypes";`, keep `export type { SandboxOrb, SandboxState }` for backwards compat (or re-export)
- `LabRenderer.ts`: change import to `import type { SandboxState } from "./labTypes";`
- `TelemetryHUD.ts`: change import to `import type { SandboxState } from "./labTypes";`

**Result**: Types independent from BonkLab class. Enables pk5 and 6jf.

---

## Task 6: bonk-race-pk5 — LabParamManager (depends on r94)

**New file**: `client/src/lab/LabParamManager.ts`

Extract from `BonkLab.ts`:
- `updateParams()` method (lines 406-481, ~75 lines)
- `buildFlatParams()` method (lines 1054-1157, ~103 lines)
- `autoSyncOrbDensity()` private method
- `setNestedValue()` helper function

Design: Class that encapsulates parameter management.

```ts
interface UpdateEffect {
    regenerateArena?: boolean;
    massChanged?: boolean;
}

export class LabParamManager {
    params: Record<string, number | boolean | string>;

    constructor(
        private slimeConfig: SlimeConfig,
        private worldPhysics: WorldPhysicsConfig,
        private zoneSurfaces: Record<string, SurfaceConfig>,
    ) { ... }

    update(key: string, value: number | boolean | string): UpdateEffect { ... }
    buildFlatParams(): Record<string, number | boolean | string> { ... }
}
```

**Changes to `BonkLab.ts`**:
- Remove `updateParams()`, `buildFlatParams()`, `autoSyncOrbDensity()`, `setNestedValue()`
- Create `LabParamManager` instance in constructor
- Delegate: `updateParams(k, v) { const effect = this.paramManager.update(k, v); if (effect.regenerateArena) this.regenerateArena(...); }`
- `this.params` → `this.paramManager.params`

**Result**: BonkLab.ts drops ~180 lines.

---

## Task 7: bonk-race-6jf — OrbSimulator (depends on r94)

**New file**: `client/src/lab/orbSimulator.ts`

Extract from `BonkLab.ts`:
- `tickOrbs()` method (lines 952-1046, ~94 lines)

Design: Pure function, not a class.

```ts
export function tickOrbs(
    orbs: SandboxOrb[],
    dt: number,
    playerBody: ICircleBody,
    obstacles: IStaticObstacle[],
    wallBounds: IWallBounds,
    restitution: number,
    spikeKill: boolean,
): void { ... }
```

Mutates `orbs` array in place (same as current behavior).

**Changes to `BonkLab.ts`**:
- Remove `tickOrbs()` method
- Add: `import { tickOrbs } from "./orbSimulator";`
- In `tick()`: replace `this.tickOrbs(dt)` with `tickOrbs(this.orbs, dt, playerBody, obstacles, wallBounds, restitution, spikeKill)`

**Result**: BonkLab.ts drops ~94 lines.

---

## File Impact Summary

| File | Before | After (approx) | Delta |
|------|--------|-----------------|-------|
| BonkLab.ts | 1168 | ~860 | -308 |
| LabPanel.tsx | 1099 | ~440 | -659 |
| LabToolbar.tsx | 573 | ~370 | -203 |
| LabRenderer.ts | 1106 | ~1030 | -76 |
| TelemetryHUD.ts | 213 | ~195 | -18 |
| main.ts | 181 | ~170 | -11 |
| **New files (7)** | 0 | ~1275 | +1275 |
| **Total** | 4340 | ~4340 | ~0 |

---

## New Files Created

```
client/src/lab/
  colorUtils.ts        (~80 lines)  — color math (9xw)
  labConstants.ts      (~40 lines)  — formatTime, ZONE_LABELS, FA_LABELS (cm1)
  labTypes.ts          (~75 lines)  — SandboxOrb, SandboxState (r94)
  LabParamManager.ts   (~190 lines) — param CRUD + buildFlatParams (pk5)
  orbSimulator.ts      (~100 lines) — orb physics tick (6jf)
  ui/
    paramDefs.ts       (~630 lines) — ParamDef, GroupDef, PARAM_GROUPS (coe)
    presets.ts         (~200 lines) — Preset, PRESETS, DEFAULT_PRESET_IDX (6th)
```

---

## Developer Delegation

**Branch**: `refactor/bonklab-decomposition` (created from `main`)

### Wave 1 — Phase 1 tasks (4 parallel worktrees)

| Worktree | Beads | Task |
|----------|-------|------|
| A | coe | paramDefs.ts extraction |
| B | 9xw | colorUtils.ts extraction |
| C | 6th | presets.ts + dedup |
| D | cm1 | labConstants.ts + dedup |

Each Developer works in isolation. After all 4 complete — merge into branch, run build + tests.

### Wave 2 — Phase 2 tasks (sequential on branch)

1. **r94**: labTypes.ts (unblocks pk5 and 6jf)
2. **pk5**: LabParamManager (after r94 merged)
3. **6jf**: OrbSimulator (after r94 merged; can run parallel with pk5)

---

## Review Strategy

After all 7 tasks merged into branch:

1. **3 specialized reviewers** in parallel:
   - Security: no new attack surfaces, no secret leaks
   - Code Quality: naming, duplication, dead code
   - Architecture: module boundaries, dependency direction

2. Build verification: `npm run build` (shared -> server -> client)
3. Manual verification: run BonkLab, test all presets, verify telemetry HUD

---

## Verification

1. `npm run build` — clean compilation, no type errors
2. `npm run test` — all existing tests pass (21/21)
3. Manual: open BonkLab in browser
   - All 12 presets load correctly
   - All slider groups work
   - Telemetry HUD shows all 9 rows including sand zone
   - Trail coloring (drift, rainbow) works
   - Orb physics: collision, spike destroy
   - Death/respawn cycle works
   - Export/Import modal works
4. No behavior changes — pure structural refactor
