# Reverse: Physics & Movement Systems
**Версия:** v0.8.7 (425d333) | **Дата:** 2026-03-07

---

## 1. Обзор

Физика Slime Arena — авторитетная серверная симуляция с фиксированным шагом времени (30 Гц, `dt = 1/tickRate`). Модель движения двухуровневая:

1. **Flight Assist System** (fly-by-wire) — преобразует ввод джойстика в силы и моменты, создавая «ощущение управления космическим кораблём с автопилотом». Вдохновлена системой Flight Assist из Elite: Dangerous / Star Citizen.
2. **Physics System** — классическая ньютоновская интеграция: `F = ma`, Euler-интеграция скорости и позиции, drag-демпфирование.

Столкновения обрабатываются итеративно (4 итерации) с позиционной коррекцией (Baumgarte-стиль) и импульсным откликом. Арена генерируется процедурно с детерминированным RNG.

---

## 2. Исходные файлы

| Файл | Назначение |
|---|---|
| `server/src/rooms/systems/movementSystems.ts` | `flightAssistSystem()`, `physicsSystem()` — ядро движения |
| `server/src/rooms/systems/collisionSystem.ts` | `collisionSystem()` — все столкновения |
| `server/src/rooms/systems/arenaGenerator.ts` | `generateArena()`, `spawnInitialOrbs()` |
| `server/src/rooms/helpers/arenaGeneration.ts` | Алгоритмы генерации препятствий, зон, безопасных зон |
| `server/src/rooms/helpers/worldUtils.ts` | Границы мира, `applyWorldBoundsCollision()` |
| `server/src/rooms/helpers/mathUtils.ts` | `clamp()`, `normalizeAngle()`, `secondsToTicks()` |
| `server/src/rooms/ArenaRoom.ts` | Делегирующие методы: `applyWorldBounds()`, `orbOrbCollisions()`, `getPlayerRadius()`, `getMouthHalfAngle()`, `getSlimeInertiaForPlayer()`, `applyYawOscillationDamping()`, `getZoneSpeedMultiplier()`, `getZoneFrictionMultiplier()`, `applySpeedCap()` |
| `shared/src/formulas.ts` | `getSlimeRadius()`, `getSlimeRadiusFromConfig()`, `getSlimeInertia()`, `getOrbRadius()`, `getSpeedMultiplier()`, `scaleSlimeValue()` |
| `shared/src/mathUtils.ts` | `clamp()`, `lerp()`, `wrapAngle()`, `normalizeAngle()`, `degToRad()`, `distance()` |
| `shared/src/config.ts` | Типы: `SlimeConfig`, `MassCurveConfig`, `WorldPhysicsConfig`, `ObstacleConfig`, `SafeZoneConfig`, `ZonesConfig` |
| `config/balance.json` | Текущие значения всех параметров физики |

---

## 3. Flight Assist System

**Файл:** `movementSystems.ts` → `flightAssistSystem(room)`

### 3.1. Общий алгоритм

Для каждого живого игрока система вычисляет три выхода:
- `player.assistFx` — сила по X (мировые координаты, Н)
- `player.assistFy` — сила по Y (мировые координаты, Н)
- `player.assistTorque` — момент (Н·м)

Мёртвые игроки получают нулевые значения.

### 3.2. Подготовка параметров

```
mass = max(player.mass, balance.physics.minSlimeMass)
inertia = getSlimeInertia(mass, slimeConfig) × classStats.radiusMult²
```

Тяги и лимиты масштабируются по массе через `scaleSlimeValue()`:

```
thrustForward = scaleSlimeValue(base, mass, config, curve) × (1 + mod_thrustForwardBonus)
thrustReverse = scaleSlimeValue(base, mass, config, curve) × (1 + mod_thrustReverseBonus)
thrustLateral = scaleSlimeValue(base, mass, config, curve) × (1 + mod_thrustLateralBonus)
turnTorque    = scaleSlimeValue(base, mass, config, curve) × (1 + mod_turnBonus)
```

Лимиты скорости собирают множители:

```
totalSpeedMultiplier = (1 + mod_speedLimitBonus + mod_lightningSpeedBonus) × hasteMultiplier × zoneSpeedMultiplier
speedLimitForward × = totalSpeedMultiplier
speedLimitReverse × = totalSpeedMultiplier
speedLimitLateral × = totalSpeedMultiplier
```

**Штрафы:**
- `isLastBreath` → все тяги и лимиты × `combat.lastBreathSpeedPenalty` (0.8)
- `slowPct > 0` → скоростные лимиты × `(1 - slowPct)`

### 3.3. Система поворота (Yaw)

Поворот реализован как fly-by-wire: ввод джойстика задаёт **целевой угол**, а не скорость поворота напрямую.

**Шаг 1: Определение целевого угла**
```
targetAngle = atan2(inputY, inputX)
angleDelta = normalizeAngle(targetAngle - player.angle)
```

**Шаг 2: Опережающее торможение (Predictive Braking)**

Стиль U2 Flight Assist:ON — перед перелётом целевого угла система начинает тормозить:

```
effectiveDecel = maxAngularAccel + angularDragK × |angVel|
stoppingAngle = angVel² / (2 × effectiveDecel + 1e-6)
```

Если `movingTowardsTarget && stoppingAngle >= |angleDelta|` → `yawCmd = 0`, торможение.

**Шаг 3: Нормальное управление**
```
yawCmd = clamp(angleDelta / yawFullDeflectionAngleRad, -1, 1)
yawCmd = clamp(yawCmd × yawRateGain, -1, 1)
yawCmd = applyYawOscillationDamping(player, yawCmd, slimeConfig)
```

**Шаг 4: Демпфирование осцилляций**

`applyYawOscillationDamping()` (ArenaRoom.ts:2154) следит за историей знаков yawCmd в скользящем окне:
- Окно: `yawOscillationWindowFrames` (12 кадров)
- Порог: `yawOscillationSignFlipsThreshold` (4 смены знака)
- При превышении: `yawCmd /= yawDampingBoostFactor` (2.0)

**Шаг 5: Вычисление момента**

При наличии yaw-ввода:
```
desiredAngVel = yawCmd × angularLimit
angVelError = desiredAngVel - player.angVel
desiredAlpha = angVelError / reactionTimeS
clampedAlpha = clamp(desiredAlpha, -maxAngularAccel, maxAngularAccel)
torque = inertia × clampedAlpha
```

При отсутствии ввода или predictive braking — тормозной момент:
```
brakeTime = predictiveBraking ? dt : angularStopTimeS / angularBrakeBoostFactor
desiredAlpha = -angVel / brakeTime
torque = inertia × clamp(desiredAlpha, ±maxAngularAccel)
```

### 3.4. Система линейного движения

**Шаг 1: Желаемая скорость**

Ввод джойстика проецируется на локальные оси слайма (forward/right):

```
forwardX = cos(angle), forwardY = sin(angle)
rightX = -sin(angle), rightY = cos(angle)

inputForward = dot(inputDir, forward)
inputRight   = dot(inputDir, right)

desiredForwardSpeed = inputForward ≥ 0 ? inputForward × inputMag × speedLimitForward
                                       : inputForward × inputMag × speedLimitReverse
desiredLateralSpeed = inputRight × inputMag × speedLimitLateral
```

**Шаг 2: Ошибка скорости**
```
vError = desiredV - currentV   (мировые координаты)
errorForward = dot(vError, forward)
errorRight   = dot(vError, right)
```

**Шаг 3: Силы**
```
accelTime = hasInput ? accelTimeS : comfortableBrakingTimeS
desiredAccel = error / max(accelTime, dt)
force = mass × clamp(desiredAccel, ±maxAccel)
```

Тяга ограничивается: forward → `thrustForward/thrustReverse`, lateral → `thrustLateral`.

### 3.5. Counter-Acceleration (контр-ускорение)

Активируется при резком изменении направления (`counterAccelEnabled = true`).

**Условия активации:**
- Текущая скорость >= `counterAccelMinSpeedMps` (50 м/с)
- Угол между текущим и желаемым вектором скорости > `counterAccelDirectionThresholdDeg` (22 град)

**Действие:**
- Вычисляется перпендикулярная к желаемому направлению составляющая текущей скорости (drift)
- Генерируется сила для гашения drift за `counterAccelTimeS` (0.11 с)
- Сила ограничивается доступной тягой по осям

### 3.6. Overspeed Damping (гашение превышения скорости)

При `overspeedDampingRate > 0` система активно тормозит, когда скорость по локальной оси превышает лимит:

```
excess = |vAlongAxis| - axisLimit
brakeAccel = -sign(v) × excess × overspeedDampingRate / dt
```

Без ввода применяется коэффициент `autoBrakeMaxThrustFraction` (0.6), чтобы торможение было мягче.

### 3.7. Финальное ограничение и преобразование

```
forceForward = clamp(forceForward, -thrustReverse, thrustForward)
forceRight   = clamp(forceRight, -thrustLateral, thrustLateral)
assistFx = forward × forceForward + right × forceRight
assistFy = forward.y × forceForward + right.y × forceRight
```

---

## 4. Physics System

**Файл:** `movementSystems.ts` → `physicsSystem(room)`

### 4.1. Dash Override

Если игрок в состоянии `FLAG_DASHING`:
```
progress = 1 - ticksRemaining / dashDurationTicks
position = lerp(dashStart, dashTarget, progress)
velocity = dashDirection × (distanceM / durationSec)
```
Обычная физика пропускается — слайм движется линейно к цели.

### 4.2. Drag (анизотропное сопротивление среды)

Используется экспоненциальная decay-модель `exp(-k*dt)` вместо force-based drag.
Скорость разлагается на продольную (forward) и боковую (lateral) компоненты:

```
vFwd = dot(vel, forward)
vLat = dot(vel, right)

decayFwd = exp(-forwardDragK × surface.forwardDragMultiplier × dt)
lateralK = forwardDragK × lateralGripMultiplier × surface.lateralGripMultiplier
decayLat = exp(-lateralK × dt)

vFwd' = vFwd × decayFwd
vLat' = vLat × decayLat
vel' = forward × vFwd' + right × vLat'

angVel' = angVel × exp(-angularDragK × surface.angularDragMultiplier × dt)
```

`ISurfaceParams` (per-zone):
| Параметр | Описание | Default |
|---|---|---|
| forwardDragMultiplier | Множитель продольного трения | 1.0 |
| lateralGripMultiplier | Множитель бокового сцепления | 1.0 |
| angularDragMultiplier | Множитель углового трения | 1.0 |
| zoneThrustN | Доп. тяга по heading (турбо) | 0 |

Зоны:
| Зона | forwardDrag | lateralGrip | angularDrag | zoneThrustN |
|---|---|---|---|---|
| Default | 1.0 | 1.0 | 1.0 | 0 |
| Ice | 0.1 | 0.2 | 0.3 | 0 |
| Mud | 5.0 | 4.0 | 3.0 | 0 |
| Turbo | 0.5 | 1.0 | 1.0 | 15000 |
| Sand | 2.5 | 3.0 | 2.0 | 0 |

### 4.3. Semi-implicit Euler интеграция

```
// 1. Применить силы FA к скорости
vx += (assistFx / mass) × dt
vy += (assistFy / mass) × dt

// 2. Zone thrust по heading
if (zoneThrustN > 0):
  vx += (zoneThrustN / mass) × cos(angle) × dt
  vy += (zoneThrustN / mass) × sin(angle) × dt

// 3-5. Анизотропный decay (см. §4.2)

// 6. Обновить позицию
x += vx × dt
y += vy × dt

// 7. Angular: FA torque → decay → clamp
angVel += (assistTorque / inertia) × dt
angVel *= exp(-angularDragK × surface.angularDragMultiplier × dt)
```

### 4.4. Angular Velocity Clamping

```
angularLimit = scaleSlimeValue(angularSpeedLimitRadps, mass, ...)
if (isLastBreath) angularLimit *= lastBreathSpeedPenalty
if (|angVel| > angularLimit) angVel = sign(angVel) × angularLimit
angle = normalizeAngle(angle + angVel × dt)
```

### 4.5. Порядок выполнения в тике

Из контекста ArenaRoom (не показан напрямую, но восстановлен):
1. `flightAssistSystem()` — вычисление сил
2. `physicsSystem()` — интеграция
3. `collisionSystem()` — коллизии и импульсы
4. Прочие системы (combat, death, etc.)

---

## 5. Collision System

**Файл:** `collisionSystem.ts` → `collisionSystem(room)`

### 5.0. Общие параметры

```
iterations = 4                  // захардкожено
slop = 0.001                    // захардкожено (м)
percent = 0.8                   // захардкожено (Baumgarte correction percent)
restitution = worldPhysics.restitution  // из конфига (0.9)
maxCorrection = worldPhysics.maxPositionCorrectionM  // из конфига (0.5 м)
```

### 5.1. Circle-Circle: Слайм-Слайм

**Проверка пересечения:**
```
dx = p2.x - p1.x, dy = p2.y - p1.y
minDist = radius1 + radius2
if (dx² + dy² >= minDist²) → пропуск
```

**Позиционная коррекция (Baumgarte):**
```
penetration = minDist - dist
invMass1 = 1/mass1, invMass2 = 1/mass2
corrRaw = (max(penetration - slop, 0) / invMassSum) × percent
corrMag = min(corrRaw, maxCorrection)
p1.pos -= normal × corrMag × invMass1
p2.pos += normal × corrMag × invMass2
```

**Импульсный отклик (при сближении, velAlongNormal <= 0):**
```
relVel = v2 - v1
velAlongNormal = dot(relVel, normal)
j = -(1 + restitution) × velAlongNormal / invMassSum
impulse = normal × j
v1 -= impulse × invMass1
v2 += impulse × invMass2
```

После коллизии вызывается `processCombat()` для обоих участников (проверка укуса по зонам mouth/side/tail).

### 5.2. Circle-Circle: Слайм-Орб

Аналогичная схема circle-circle. Особенности:
- Физическая масса орба = его пищевая масса (`orb.mass`), без множителя density
- Радиус орба: `getOrbRadius(mass, density)` — зависит от density типа орба
- После физики проверяется **поедание ртом**:

```
angleToOrb = atan2(dy, dx)
angleDiff = normalizeAngle(angleToOrb - playerAngle)
isMouthHit = |angleDiff| <= mouthHalfAngle
```

Поедание возможно при: `isMouthHit && gcdReady && biteCooldownElapsed`.

### 5.3. Circle-Circle: Слайм-Сундук

Аналогичная схема. Особенности:
- Масса сундука берётся из конфига по типу (`rare`/`epic`/`gold`), минимум 50
- Сундуки подвижны — получают импульсы и позиционную коррекцию

### 5.4. Circle-Circle: Слайм-Препятствие (столбы, шипы)

Препятствия **неподвижны** (бесконечная масса):
```
corrMag = min(max(penetration - slop, 0), maxCorrection)
player.pos += normal × corrMag   // только игрок смещается
```

**Импульсный отклик (при движении к препятствию):**
```
velAlongNormal = dot(playerVel, normal)
if (velAlongNormal < 0):
    impulse = (1 + restitution) × velAlongNormal
    playerVel -= impulse × normal
```

**Шипы (`OBSTACLE_TYPE_SPIKES`):**
- Урон: `spikeDamagePct` (5%) от массы игрока
- Один урон за итерацию на игрока (set `spikeDamageApplied`)
- Не срабатывает на: неуязвимых (`invulnerableUntilTick`) и `isLastBreath`
- Guard-буст поглощает удар: `tryConsumeGuard(player)`

### 5.5. Circle-Boundary (стены арены)

**Файл:** `ArenaRoom.ts:2623` → `applyWorldBounds()`

Вызывается для каждого живого игрока на каждой итерации коллизий.

**Прямоугольная арена (текущий конфиг):**
```
halfW = widthM / 2, halfH = heightM / 2
if (x - radius < -halfW) → x = -halfW + radius, vx = |vx| × restitution
if (x + radius > halfW)  → x = halfW - radius,  vx = -|vx| × restitution
(аналогично для Y)
```

**Круглая арена:**
```
dist = hypot(x, y)
if (dist + radius > limit):
    pos = normal × (limit - radius)
    velAlongNormal = dot(vel, normal)
    vel -= (1 + restitution) × velAlongNormal × normal
```

**Замечание:** реализация для прямоугольных стен отличается от circle-circle — используется `restitution` как множитель (без `1+`), а не `1 + restitution` как коэффициент восстановления. Это означает, что при `restitution = 0.9` стена «съедает» 10% скорости, а при circle-circle столкновении объекты отскакивают с почти удвоенной компонентой по нормали. Это архитектурная асимметрия (см. раздел 9).

### 5.6. Орб-Орб столкновения

**Файл:** `ArenaRoom.ts:884` → `orbOrbCollisions()`

Стандартная circle-circle схема. Вызывается **после** всех остальных коллизий на каждой итерации. Не использует `maxCorrection` (в отличие от остальных типов).

### 5.7. Impulse Response — сводная таблица

| Тип | invMass1 | invMass2 | Позиционная коррекция | Импульсная формула | maxCorrection |
|---|---|---|---|---|---|
| Слайм-Слайм | 1/m1 | 1/m2 | Baumgarte (percent=0.8) | `-(1+e)×vn / invMassSum` | Да |
| Слайм-Орб | 1/mPlayer | 1/mOrb | Baumgarte | `-(1+e)×vn / invMassSum` | Да |
| Слайм-Сундук | 1/mPlayer | 1/mChest | Baumgarte | `-(1+e)×vn / invMassSum` | Да |
| Слайм-Препятствие | 1 (implicit) | 0 (static) | Простая | `(1+e)×vn` (одностороннее) | Да |
| Слайм-Стена (rect) | 1 | 0 | Позиционный clamp | `vAxis = ±|vAxis|×e` | Нет |
| Слайм-Стена (circle) | 1 | 0 | Позиционный clamp | `-(1+e)×vn×n` | Нет |
| Орб-Орб | 1/m1 | 1/m2 | Baumgarte | `-(1+e)×vn / invMassSum` | **Нет** |

---

## 6. Arena Generation

**Файлы:** `helpers/arenaGeneration.ts`, `systems/arenaGenerator.ts`

### 6.1. Общий алгоритм

При старте/рестарте матча `generateArena()` выполняет:
1. Очистка всех obstacles, safeZones, zones
2. Генерация безопасных зон → `generateSafeZoneSeeds()`
3. Генерация игровых зон → `generateZoneSeeds()`
4. Генерация препятствий → `generateObstacleSeeds()`
5. Спавн начальных орбов → `spawnInitialOrbs()`

### 6.2. Категории размера карты

```typescript
function getMapSizeKey(mapSize: number): "small" | "medium" | "large" {
    if (mapSize <= 900) return "small";
    if (mapSize <= 1400) return "medium";
    return "large";
}
```

### 6.3. Генерация препятствий

**Фаза 1: Проходы (passages)**

Парные столбы с зазором между ними:
```
passageCount = min(totalCount/2, passageCountByMapSize[sizeKey])
halfPassageDist = passageGapWidth/2 + passagePillarRadius
```

Для каждого прохода: случайный центр + случайный угол → два столба `OBSTACLE_TYPE_PILLAR` на расстоянии `halfPassageDist` от центра. Максимум `placementRetries` (30) попыток.

**Фаза 2: Одиночные препятствия**

Оставшееся количество = `totalCount - размещённые`. Каждый с шансом `spikeChance` (30%) — шипы, иначе столб.

**Валидация размещения:**
- Не выходит за границы мира (с учётом радиуса)
- Минимальное расстояние `spacing` (8 м) до существующих препятствий

### 6.4. Генерация безопасных зон

```
count = countByMapSize[sizeKey]      // small:1, medium:2, large:3
radius = radiusByMapSize[sizeKey]    // small:120, medium:150, large:180
minDistance = 200 м между зонами
margin = radius + 10
```

### 6.5. Генерация игровых зон

```
count = countByMapSize[sizeKey]      // small:3, medium:4, large:5
radius = radiusByMapSize[sizeKey]    // small:90, medium:110, large:130
minDistance = 180 м между зонами
```

**Выбор типа зоны:**
Взвешенный random по `typeWeights` (все = 1 в текущем конфиге, равновероятные):
- NECTAR (нектар), ICE (лёд), SLIME (слизь), LAVA (лава), TURBO (турбо)

**Ограничение для Лавы:**
- Не ближе `lavaMinDistanceFromSpawn` (100 м) + radius от центра карты (0,0)

**Зоны не пересекаются** с безопасными зонами (проверка `isTooCloseToSafeZone`).

### 6.6. Форма мира

Поддерживаются две формы: `"rectangle"` и `"circle"`. Текущий конфиг — `"rectangle"` 1000×1000 м.

Генерация точек адаптирована к форме:
- Rectangle: `rng.range(-width/2, width/2)`, `rng.range(-height/2, height/2)`
- Circle: `angle = rng.range(0, 2π)`, `r = √(rng.next()) × radius` (равномерное распределение по площади)

---

## 7. Формулы

### 7.1. getSlimeRadiusFromConfig (основная формула радиуса)

**Файл:** `shared/src/formulas.ts`

```
radius = baseRadiusM × √(safeMass / baseMassKg)
safeMass = max(mass, baseMassKg × minMassFactor)
```

| Вход | Тип | Единицы | Текущее значение |
|---|---|---|---|
| mass | number | кг | переменная |
| baseMassKg | number | кг | 100 |
| baseRadiusM | number | м | 10.0 |
| minMassFactor | number | безразмерный | 0.1 |

| Масса (кг) | Радиус (м) |
|---:|---:|
| 50 | 7.07 |
| 100 | 10.0 |
| 400 | 20.0 |
| 1600 | 40.0 |

### 7.2. getSlimeInertia

```
radius = getSlimeRadiusFromConfig(mass, config)
inertia = inertiaFactor × mass × radius²
```

С подстановкой:
```
inertia = inertiaFactor × mass × baseRadiusM² × (mass / baseMassKg)
        = inertiaFactor × baseRadiusM² × mass² / baseMassKg
```

| Вход | Значение |
|---|---|
| inertiaFactor | 0.10 |
| baseMassKg | 100 |
| baseRadiusM | 10.0 |

Примеры:
| Масса | Инерция |
|---:|---:|
| 100 кг | 0.10 × 100 × 100 = 1000 |
| 400 кг | 0.10 × 400 × 400 = 16000 |

**Заметка:** в ArenaRoom `getSlimeInertiaForPlayer()` дополнительно умножает на `classStats.radiusMult²`.

### 7.3. scaleSlimeValue

Универсальный масштабатор параметров по массе:

```
ratio = safeMass / baseMassKg

if curve.type === "power":
    value = baseValue × ratio ^ exp

if curve.type === "log":
    value = baseValue × (1 + k × ln(ratio))

value = clamp(value, curve.minValue, curve.maxValue)
```

**Текущие кривые масштабирования (balance.json):**

| Параметр | Тип | Экспонента / k |
|---|---|---|
| thrustForwardN | power | 0.5 (√mass) |
| thrustReverseN | power | 0.5 |
| thrustLateralN | power | 0.5 |
| turnTorqueNm | power | **1.7** (суперлинейный!) |
| speedLimitForwardMps | power | 0 (константа) |
| speedLimitReverseMps | power | 0 (константа) |
| speedLimitLateralMps | power | 0 (константа) |
| angularSpeedLimitRadps | power | 0 (константа) |

**Следствие:** тяга растёт как √mass, лимиты скорости не меняются с массой. Момент поворота растёт как mass^1.7 — это компенсирует рост инерции (mass²), но неполностью, поэтому тяжёлые слаймы поворачивают медленнее.

### 7.4. getOrbRadius

```
radius = slimeBaseRadius × √(mass / slimeBaseMass / density)
```

| Вход | Значение |
|---|---|
| slimeBaseMass | 100 (захардкожено) |
| slimeBaseRadius | 10 (захардкожено) |

### 7.5. getSlimeRadius (устаревшая формула)

```
radius = base × √(1 + scale × mass / divisor)
```

Используется из `balance.formulas`, но **основной код** использует `getSlimeRadiusFromConfig()` из `SlimeConfig`. Формула из `formulas.radius` — legacy.

### 7.6. getSpeedMultiplier (устаревшая)

```
multiplier = base / (1 + scale × ln(1 + mass / divisor))
```

Не используется в текущей системе движения. Flight Assist использует `scaleSlimeValue()` с curve-конфигами.

---

## 8. Захардкоженные значения

### 8.1. В collisionSystem.ts

| Константа | Значение | Назначение |
|---|---|---|
| `iterations` | 4 | Число итераций решения коллизий |
| `slop` | 0.001 | Допуск проникновения (м) |
| `percent` | 0.8 | Baumgarte correction percent |

### 8.2. В movementSystems.ts

| Константа | Значение | Назначение |
|---|---|---|
| `1e-6` | — | Порог деления на ноль для inertia/dist |
| `1e-3` | — | Порог angVel для активации торможения |
| `0.001` | — | Минимум reactionTimeS |

### 8.3. В formulas.ts (getOrbRadius)

| Константа | Значение | Назначение |
|---|---|---|
| `slimeBaseMass` | 100 | Базовая масса для расчёта радиуса орба |
| `slimeBaseRadius` | 10 | Базовый радиус для расчёта радиуса орба |

### 8.4. В arenaGeneration.ts

| Константа | Значение | Назначение |
|---|---|---|
| Порог small | mapSize ≤ 900 | Граница категории размера |
| Порог medium | mapSize ≤ 1400 | Граница категории размера |
| SafeZone margin | radius + 10 | Отступ от края карты |
| Zone margin | radius + 10 | Отступ от края карты |

### 8.5. В ArenaRoom.ts

| Константа | Значение | Назначение |
|---|---|---|
| Mouth offset | 1.9 × radius | Точка притяжения орбов (getMouthPoint) |
| Min chest mass | 50 | Минимальная масса сундука при коллизии |

---

## 9. Расхождения с документацией

### 9.1. Restitution

| Источник | Значение |
|---|---|
| GDD-Arena.md, раздел 1.3 | **0.3** |
| config/balance.json → worldPhysics.restitution | **0.9** |
| config/balance.json → physics.collisionRestitution | **0.5** (не используется!) |

**Факт:** код использует `worldPhysics.restitution` (0.9). GDD указывает 0.3. Расхождение значительное — при 0.9 столкновения почти упругие, при 0.3 — сильно гасят энергию.

Поле `physics.collisionRestitution` (0.5) существует в конфиге, но **нигде не используется** в текущем коде коллизий.

### 9.2. Формула радиуса

| Источник | Формула |
|---|---|
| GDD-Core.md §9.1 | `baseRadiusM × √(mass / baseMassKg)` |
| Код: `getSlimeRadiusFromConfig()` | `baseRadiusM × √(safeMass / baseMassKg)` |
| Код: `getSlimeRadius()` (legacy) | `base × √(1 + scale × mass / divisor)` |

GDD и `getSlimeRadiusFromConfig()` совпадают (с учётом safeMass clamp). Legacy-формула `getSlimeRadius()` — другая, но не используется для слаймов.

### 9.3. Двигатели

| Параметр | GDD-Core §9.2 | balance.json |
|---|---|---|
| thrustForwardN | 9000 | **27000** (×3) |
| thrustReverseN | 6750 | **9000** (~×1.33) |
| thrustLateralN | 8500 | **11300** (~×1.33) |
| turnTorqueNm | 175 | **24000** (×137) |
| angularSpeedLimitDegps | 80 | **180** (×2.25) |

**Критическое расхождение:** значения в конфиге значительно выше, чем в GDD. Слаймы намного манёвреннее и быстрее, чем описано в документации. Момент поворота отличается на два порядка.

### 9.4. Масштабирование тяги

| Источник | Формула |
|---|---|
| GDD-Core §9.3 | `baseThrust × √(mass / baseMassKg)` |
| Код | `scaleSlimeValue(base, mass, config, curve)` с `exp=0.5` |

Совпадают — обе дают `base × (mass/baseMass)^0.5 = base × √(mass/baseMass)`.

### 9.5. Момент инерции

| Источник | Формула |
|---|---|
| GDD-Core §9.3 | `0.5 × mass × radius²` |
| Код: `getSlimeInertia()` | `inertiaFactor × mass × radius²` |

Совпадают при `inertiaFactor = 0.10` (текущее значение).

### 9.6. Масштабирование момента поворота

| Источник | Экспонента |
|---|---|
| GDD-Core §9.3 | 0.5 (√mass) |
| balance.json | **1.7** |

GDD предполагает √mass-масштабирование для момента поворота, как и для тяги. Код использует mass^1.7 — суперлинейное масштабирование, которое компенсирует рост инерции (mass²) и позволяет тяжёлым слаймам поворачивать быстрее, чем предполагает GDD.

### 9.7. Форма арены

| Источник | Описание |
|---|---|
| GDD-Arena §1.2 | «Арена прямоугольная» |
| Код | Поддержка `"rectangle"` и `"circle"`, текущий конфиг: `"rectangle"` |

Совпадает по факту, но код готов к кругу.

### 9.8. Генерация карты — отсутствует валидация проходимости

GDD-Arena §9.2 требует: «Валидация: проверить проходимость между любыми двумя точками». В коде такой проверки **нет** — только `canPlaceObstacle()` проверяет spacing, но не графовую проходимость.

### 9.9. Ограничения площади зон

GDD-Arena §9.3: «Лава не более 10% площади, Нектар не более 5%, минимум 60% свободно». В коде нет проверки площади зон — только количество и минимальные расстояния.

### 9.10. Узкий проход — ограничение по массе

GDD-Arena §3.2: «Слаймы тяжелее 350 кг не могут пройти (ширина 25 м)». В коде passageGapWidth = 25 м, passagePillarRadius = 18 м. Ограничение по массе работает **косвенно** через формулу радиуса: при 350 кг радиус ≈ 18.7 м, два столба с зазором 25 м → проход = 25 м, слайм с радиусом 18.7 м проходит. Однако при passagePillarRadius = 18 м реальная ширина прохода между краями столбов = passageGapWidth = 25 м, а для прохода нужно `radius < passageGapWidth / 2 = 12.5 м` → масса < ~156 кг. Расхождение с GDD (350 кг → 25 м).

### 9.11. Стенное отражение (rect) — другая формула

Для прямоугольных стен используется `vx = ±|vx| × restitution`, а не `vx -= (1+e)×vn×nx`. При `e = 0.9` стена гасит 10% скорости. При circle-circle с `e = 0.9` формула `-(1+e)×vn` почти удваивает компоненту отскока. Это **разные физические модели** для стен vs объектов.

---

## 10. Технический долг

### 10.1. Дублирование mathUtils

Три реализации `clamp()` и две `normalizeAngle()`:
- `shared/src/mathUtils.ts` — O(1) normalizeAngle (через `%`)
- `server/src/rooms/helpers/mathUtils.ts` — while-loop normalizeAngle
- `ArenaRoom.ts` — while-loop normalizeAngle (метод экземпляра)

Серверный код использует while-loop версию, shared — O(1) версию с `%`. Потенциальная разница поведения при больших углах.

### 10.2. Неиспользуемые поля конфига

- `physics.collisionRestitution` (0.5) — нигде не используется
- `physics.collisionImpulseCap` (10000) — нигде не используется
- `physics.environmentDrag` (0.01) — нигде не используется (используется `worldPhysics.forwardDragK`)
- `physics.slimeLinearDamping` (0.02) — нигде не используется
- `physics.maxSlimeSpeed` (500) — `applySpeedCap()` существует в ArenaRoom, но не вызывается из physicsSystem
- `physics.maxOrbSpeed` (1000) — аналогично

### 10.3. Отсутствие CCD (Continuous Collision Detection)

При высоких скоростях и малых объектах возможны туннелирования (объект пролетает сквозь другой за один тик). При dt=33ms и maxSpeed=500 м/с объект проходит ~16.5 м за тик. Радиус слайма 100 кг = 10 м. Туннелирование маловероятно для слаймов, но возможно для мелких орбов на высокой скорости.

### 10.4. Монолитный ArenaRoom

Методы `applyWorldBounds()`, `orbOrbCollisions()`, `applyYawOscillationDamping()`, `getPlayerRadius()` и др. живут в ArenaRoom (~2800 строк). Коллизионная система зависит от room-методов через `room.processCombat()`, `room.tryEatOrb()`, `room.applyWorldBounds()`. Tight coupling.

### 10.5. Итеративный решатель без warm-starting

4 итерации решателя коллизий без сохранения импульсов между тиками. При большом количестве объектов (30 слаймов + орбы + сундуки) возможна нестабильность. На практике работает благодаря малым скоростям и мягкому slop.

### 10.6. Inconsistent rect wall reflection

Формула отражения от прямоугольных стен (`vx = ±|vx| × e`) даёт другое поведение, чем от круглых стен или от объектов. Стоило бы унифицировать.

---

## 11. Заметки для форка BonkRace

### 11.1. Переиспользование физики столкновений

- Circle-circle collision response (§5.1) полностью переиспользуется: «бамперное столкновение» между гонщиками
- Baumgarte position correction предотвращает overlap — критично для плотных гонок
- `restitution` стоит уменьшить до 0.3–0.5 для менее «прыгучих» столкновений

### 11.2. Arena Generation → Track Generation

- `generateObstacleSeeds()` → генерация бортиков/конусов трассы
- `isInsideWorld()` → проверка нахождения внутри границ трассы
- `getMapSizeKey()` → категоризация длины/сложности трассы
- `randomPointInMapWithMargin()` → генерация спавн-поинтов, бустов, ловушек
- Зоны (`generateZoneSeeds()`) → зоны ускорения (turbo), замедления (slime), опасные (lava → oil slick)

### 11.3. Стены арены → Границы трассы

- `applyWorldBounds()` для прямоугольника → рельсовые стены (прижатие к бортику с отскоком)
- Для кольцевой трассы использовать circle-mode: внешняя стена + внутренняя стена
- Restitution для стен трассы: 0.2–0.4 (удар о стену — штраф, не батут)

### 11.4. Flight Assist → Drive Assist

- Forward thrust → газ/тормоз (thrustForward / thrustReverse)
- Lateral thrust → не нужен или минимальный drift
- Turn torque → руль, значительно упростить (нет fly-by-wire, прямое управление)
- Counter-acceleration → drift recovery (можно переиспользовать)
- Overspeed damping → естественный предел скорости

### 11.5. Что убрать

- Angular limit clamping (не нужен для колёсного транспорта)
- Yaw oscillation damping (для руля не актуально)
- Predictive braking (для руля не актуально)
- Поедание орбов ртом (нет рта у машин)

### 11.6. Что добавить

- Трение трассы (поверхность → friction × drag)
- Checkpoints и подсчёт кругов
- Старт с обратного отсчёта
- Nitro/boost pickups (из zone system → турбо-зоны)
- Позиционный трекинг (кто впереди)
